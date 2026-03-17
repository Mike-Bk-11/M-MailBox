import Imap from 'imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { ConfidentialClientApplication } from '@azure/msal-node';
import prisma from '../lib/prisma';
import type { NormalizedEmail } from './imap.service';

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

function getMsalClient() {
  return new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}`,
    },
  });
}

/**
 * Use the stored refresh token to get a fresh access token for IMAP/SMTP.
 * Updates the DB row with the new access token + expiry.
 */
async function refreshOutlookToken(accountId: string): Promise<string> {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.refreshToken) {
    throw new Error('No refresh token available – user must re-authenticate');
  }

  const msalClient = getMsalClient();

  // Hydrate the cache so MSAL can use the refresh token
  const cacheEntry = {
    RefreshToken: {
      entry: {
        home_account_id: account.email,
        environment: 'login.microsoftonline.com',
        credential_type: 'RefreshToken',
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        secret: account.refreshToken,
      },
    },
  };
  msalClient.getTokenCache().deserialize(JSON.stringify(cacheEntry));

  const result = await msalClient.acquireTokenByRefreshToken({
    refreshToken: account.refreshToken,
    scopes: [
      'https://outlook.office365.com/IMAP.AccessAsUser.All',
      'https://outlook.office365.com/SMTP.Send',
    ],
  });

  if (!result) throw new Error('Failed to refresh Outlook token');

  await prisma.emailAccount.update({
    where: { id: accountId },
    data: {
      accessToken: result.accessToken,
      tokenExpiry: result.expiresOn || null,
    },
  });

  return result.accessToken;
}

/** Return a valid access token, refreshing first if expired. */
async function getValidToken(accountId: string): Promise<string> {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.accessToken) throw new Error('Account not found');

  const now = new Date();
  if (account.tokenExpiry && account.tokenExpiry > now) {
    return account.accessToken;
  }

  return refreshOutlookToken(accountId);
}

// ---------------------------------------------------------------------------
// Build XOAUTH2 string  (RFC 7628 / MS docs)
// ---------------------------------------------------------------------------

function buildXOAuth2Token(user: string, accessToken: string): string {
  const authString = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
  return Buffer.from(authString).toString('base64');
}

// ---------------------------------------------------------------------------
// IMAP helpers
// ---------------------------------------------------------------------------

function connectImapXOAuth2(email: string, accessToken: string): Promise<Imap> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: email,
      xoauth2: buildXOAuth2Token(email, accessToken),
      host: 'outlook.office365.com',
      port: 993,
      tls: true,
      tlsOptions: { servername: 'outlook.office365.com' },
      authTimeout: 30000,
    } as any);

    imap.once('ready', () => resolve(imap));
    imap.once('error', (err: Error) => reject(err));
    imap.connect();
  });
}

function openBox(imap: Imap, boxName: string): Promise<Imap.Box> {
  return new Promise((resolve, reject) => {
    imap.openBox(boxName, true, (err, box) => {
      if (err) reject(err);
      else resolve(box);
    });
  });
}

function fetchMessages(imap: Imap, range: string): Promise<NormalizedEmail[]> {
  return new Promise((resolve, reject) => {
    const emails: NormalizedEmail[] = [];
    const f = imap.seq.fetch(range, { bodies: '', struct: true });

    f.on('message', (msg) => {
      let rawBuffer = Buffer.alloc(0);

      msg.on('body', (stream) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          rawBuffer = Buffer.concat(chunks);
        });
      });

      msg.once('end', async () => {
        try {
          const parsed = await simpleParser(rawBuffer);
          const toAddrs = Array.isArray(parsed.to)
            ? parsed.to.flatMap((t) => t.value.map((v) => v.address || ''))
            : parsed.to?.value.map((v) => v.address || '') || [];

          const ccAddrs = parsed.cc
            ? Array.isArray(parsed.cc)
              ? parsed.cc.flatMap((c) => c.value.map((v) => v.address || ''))
              : parsed.cc.value.map((v) => v.address || '')
            : undefined;

          emails.push({
            messageId: parsed.messageId || `outlook-${Date.now()}-${Math.random()}`,
            threadId: parsed.references?.[0] || parsed.messageId || undefined,
            fromAddress: parsed.from?.value[0]?.address || '',
            fromName: parsed.from?.value[0]?.name,
            toAddresses: toAddrs,
            ccAddresses: ccAddrs,
            subject: parsed.subject || '(no subject)',
            bodyText: parsed.text || undefined,
            bodyHtml: parsed.html || undefined,
            snippet: (parsed.text || '').slice(0, 200),
            date: parsed.date || new Date(),
            isRead: false, // IMAP flags handled later if needed
            folder: 'INBOX',
            hasAttachments: (parsed.attachments || []).length > 0,
            attachments: (parsed.attachments || []).map((a) => ({
              filename: a.filename || 'attachment',
              contentType: a.contentType || 'application/octet-stream',
              size: a.size || 0,
            })),
          });
        } catch (parseErr) {
          console.error('Parse error:', parseErr);
        }
      });
    });

    f.once('error', reject);
    f.once('end', () => {
      // Small delay so all async simpleParser calls finish
      setTimeout(() => resolve(emails), 500);
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const FOLDER_MAP: Record<string, string> = {
  INBOX: 'INBOX',
  SENT: 'Sent Items',
  DRAFTS: 'Drafts',
  TRASH: 'Deleted Items',
  SPAM: 'Junk Email',
};

export async function syncOutlookAccount(accountId: string, limit?: number) {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account || account.provider !== 'outlook') return;

  const { applyFiltersToEmail } = await import('./filter.service');

  const accessToken = await getValidToken(accountId);
  const imap = await connectImapXOAuth2(account.email, accessToken);

  try {
    for (const folder of ['INBOX', 'SENT', 'DRAFTS']) {
      const imapFolder = FOLDER_MAP[folder] || folder;
      try {
        const box = await openBox(imap, imapFolder);
        if (box.messages.total === 0) continue;

        const fetchCount = limit || box.messages.total;
        const start = Math.max(1, box.messages.total - (fetchCount - 1));
        const range = `${start}:${box.messages.total}`;
        const emails = await fetchMessages(imap, range);

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
                create: email.attachments.map((a) => ({
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
      } catch (folderErr) {
        console.error(`Outlook sync folder ${folder} error:`, folderErr);
      }
    }
  } finally {
    imap.end();
  }
}

export async function sendOutlookEmail(
  accountId: string,
  options: { to: string; cc?: string; bcc?: string; subject: string; text?: string; html?: string },
) {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new Error('Account not found');

  const accessToken = await getValidToken(accountId);
  const xoauth2Token = buildXOAuth2Token(account.email, accessToken);

  const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
      type: 'custom',
      method: 'XOAUTH2',
      user: account.email,
      credentials: { user: account.email, accessToken: xoauth2Token },
    },
  } as any);

  await transporter.sendMail({
    from: account.email,
    to: options.to,
    cc: options.cc,
    bcc: options.bcc,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}
