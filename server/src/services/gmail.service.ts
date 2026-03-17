import { google } from 'googleapis';
import prisma from '../lib/prisma';
import { NormalizedEmail } from './imap.service';

function getOAuth2Client(accessToken: string, refreshToken?: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
  });
  return oauth2Client;
}

export class GmailService {
  private gmail;
  private accountId: string;

  constructor(accessToken: string, refreshToken: string | null, accountId: string) {
    const auth = getOAuth2Client(accessToken, refreshToken || undefined);
    this.gmail = google.gmail({ version: 'v1', auth });
    this.accountId = accountId;
  }

  async fetchEmails(folder: string = 'INBOX', limit: number = 500): Promise<NormalizedEmail[]> {
    const labelMap: Record<string, string> = {
      'INBOX': 'INBOX',
      'SENT': 'SENT',
      'DRAFTS': 'DRAFT',
      'TRASH': 'TRASH',
      'SPAM': 'SPAM',
    };

    const labelIds = [labelMap[folder] || folder];

    let messages: Array<{ id?: string | null; threadId?: string | null }> = [];
    let pageToken: string | undefined;
    const batchSize = Math.min(limit, 500);

    while (messages.length < limit) {
      const listRes = await this.gmail.users.messages.list({
        userId: 'me',
        labelIds,
        maxResults: Math.min(batchSize, limit - messages.length),
        pageToken,
      });

      messages = messages.concat(listRes.data.messages || []);
      pageToken = listRes.data.nextPageToken || undefined;
      if (!pageToken) break;
    }
    const emails: NormalizedEmail[] = [];

    for (const msg of messages) {
      const detail = await this.gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      const parts = detail.data.payload?.parts || [];
      let bodyText = '';
      let bodyHtml = '';

      function extractBody(parts: any[]) {
        for (const part of parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            bodyText = Buffer.from(part.body.data, 'base64url').toString('utf-8');
          }
          if (part.mimeType === 'text/html' && part.body?.data) {
            bodyHtml = Buffer.from(part.body.data, 'base64url').toString('utf-8');
          }
          if (part.parts) extractBody(part.parts);
        }
      }

      if (detail.data.payload?.body?.data) {
        const data = Buffer.from(detail.data.payload.body.data, 'base64url').toString('utf-8');
        if (detail.data.payload.mimeType === 'text/html') bodyHtml = data;
        else bodyText = data;
      }
      extractBody(parts);

      const attachments = parts
        .filter(p => p.filename && p.body?.attachmentId)
        .map(p => ({
          filename: p.filename!,
          contentType: p.mimeType || 'application/octet-stream',
          size: p.body?.size || 0,
        }));

      const fromRaw = getHeader('From');
      const fromMatch = fromRaw.match(/(?:"?(.+?)"?\s)?<?([^>]+@[^>]+)>?/);

      emails.push({
        messageId: detail.data.id || msg.id!,
        threadId: detail.data.threadId || undefined,
        fromAddress: fromMatch?.[2] || fromRaw,
        fromName: fromMatch?.[1] || undefined,
        toAddresses: getHeader('To').split(',').map(s => s.trim().replace(/.*<([^>]+)>/, '$1')),
        ccAddresses: getHeader('Cc') ? getHeader('Cc').split(',').map(s => s.trim().replace(/.*<([^>]+)>/, '$1')) : undefined,
        subject: getHeader('Subject'),
        bodyText,
        bodyHtml,
        snippet: detail.data.snippet || '',
        date: new Date(parseInt(detail.data.internalDate || '0')),
        isRead: !(detail.data.labelIds || []).includes('UNREAD'),
        folder,
        hasAttachments: attachments.length > 0,
        attachments,
      });
    }

    return emails;
  }

  async sendEmail(options: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text?: string;
    html?: string;
  }) {
    const messageParts = [
      `To: ${options.to}`,
      options.cc ? `Cc: ${options.cc}` : '',
      options.bcc ? `Bcc: ${options.bcc}` : '',
      `Subject: ${options.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: ${options.html ? 'text/html' : 'text/plain'}; charset=utf-8`,
      '',
      options.html || options.text || '',
    ].filter(Boolean).join('\r\n');

    const raw = Buffer.from(messageParts).toString('base64url');

    await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
  }

  async getFolders(): Promise<string[]> {
    const res = await this.gmail.users.labels.list({ userId: 'me' });
    return (res.data.labels || []).map(l => l.name || l.id || '');
  }

  async markAsRead(messageId: string) {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: ['UNREAD'] },
    });
  }

  async markAsUnread(messageId: string) {
    await this.gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds: ['UNREAD'] },
    });
  }

  async moveToTrash(messageId: string) {
    await this.gmail.users.messages.trash({ userId: 'me', id: messageId });
  }
}

export async function syncGmailAccount(accountId: string, limit?: number) {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account || account.provider !== 'gmail' || !account.accessToken) return;

  const { applyFiltersToEmail } = await import('./filter.service');

  const svc = new GmailService(account.accessToken, account.refreshToken, accountId);

  for (const folder of ['INBOX', 'SENT', 'DRAFTS']) {
    const emails = await svc.fetchEmails(folder, limit || 500);

    for (const email of emails) {
      const exists = await prisma.email.findFirst({
        where: { accountId, messageId: email.messageId },
      });
      if (exists) continue;

      const created = await prisma.email.create({
        data: {
          accountId,
          messageId: email.messageId,
          threadId: email.threadId,
          fromAddress: email.fromAddress,
          fromName: email.fromName,
          toAddresses: JSON.stringify(email.toAddresses),
          ccAddresses: email.ccAddresses ? JSON.stringify(email.ccAddresses) : null,
          subject: email.subject,
          bodyText: email.bodyText,
          bodyHtml: email.bodyHtml,
          snippet: email.snippet,
          date: email.date,
          isRead: email.isRead,
          folder,
          hasAttachments: email.hasAttachments,
          attachments: {
            create: email.attachments.map(a => ({
              filename: a.filename,
              contentType: a.contentType,
              size: a.size,
            })),
          },
        },
      });

      try {
        await applyFiltersToEmail(created, account.userId);
      } catch (e) {
        console.error('Filter apply error:', e);
      }
    }
  }
}
