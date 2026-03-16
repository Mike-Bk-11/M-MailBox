import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import nodemailer from 'nodemailer';
import { decrypt } from '../utils/crypto';
import prisma from '../lib/prisma';

export interface NormalizedEmail {
  messageId: string;
  threadId?: string;
  fromAddress: string;
  fromName?: string;
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  snippet?: string;
  date: Date;
  isRead: boolean;
  folder: string;
  hasAttachments: boolean;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content?: Buffer;
    contentId?: string;
  }>;
}

function makeSnippet(text?: string): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

export class ImapService {
  private config: {
    user: string;
    password: string;
    host: string;
    port: number;
    tls: boolean;
  };

  constructor(account: {
    email: string;
    encryptedPassword: string;
    imapHost: string;
    imapPort: number;
  }) {
    this.config = {
      user: account.email,
      password: decrypt(account.encryptedPassword),
      host: account.imapHost,
      port: account.imapPort,
      tls: account.imapPort === 993,
    };
  }

  private connect(): Promise<Imap> {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        ...this.config,
        tlsOptions: { rejectUnauthorized: false },
      });
      imap.once('ready', () => resolve(imap));
      imap.once('error', (err: Error) => reject(err));
      imap.connect();
    });
  }

  async fetchEmails(folder: string = 'INBOX', limit: number = 500, since?: Date): Promise<NormalizedEmail[]> {
    const imap = await this.connect();

    return new Promise((resolve, reject) => {
      imap.openBox(folder, true, (err) => {
        if (err) { imap.end(); return reject(err); }

        const searchCriteria: any[] = since ? [['SINCE', since]] : ['ALL'];

        imap.search(searchCriteria, (err, results) => {
          if (err) { imap.end(); return reject(err); }
          if (!results.length) { imap.end(); return resolve([]); }

          const recent = results.slice(-limit);
          const emails: NormalizedEmail[] = [];

          const fetch = imap.fetch(recent, {
            bodies: '',
            struct: true,
            markSeen: false,
          });

          fetch.on('message', (msg) => {
            let buffer = '';
            let attrs: any;

            msg.on('body', (stream) => {
              stream.on('data', (chunk: Buffer) => { buffer += chunk.toString('utf8'); });
            });

            msg.once('attributes', (a) => { attrs = a; });

            msg.once('end', async () => {
              try {
                const parsed: ParsedMail = await simpleParser(buffer);
                const flags = attrs.flags || [];

                emails.push({
                  messageId: parsed.messageId || `${attrs.uid}@imap`,
                  fromAddress: parsed.from?.value?.[0]?.address || '',
                  fromName: parsed.from?.value?.[0]?.name,
                  toAddresses: parsed.to
                    ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
                        .flatMap(a => a.value.map(v => v.address || ''))
                    : [],
                  ccAddresses: parsed.cc
                    ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc])
                        .flatMap(a => a.value.map(v => v.address || ''))
                    : undefined,
                  subject: parsed.subject,
                  bodyText: parsed.text,
                  bodyHtml: parsed.html || undefined,
                  snippet: makeSnippet(parsed.text),
                  date: parsed.date || new Date(),
                  isRead: flags.includes('\\Seen'),
                  folder,
                  hasAttachments: (parsed.attachments?.length || 0) > 0,
                  attachments: (parsed.attachments || []).map(a => ({
                    filename: a.filename || 'unnamed',
                    contentType: a.contentType,
                    size: a.size,
                    content: a.content,
                    contentId: a.contentId,
                  })),
                });
              } catch (e) {
                console.error('Parse error:', e);
              }
            });
          });

          fetch.once('end', () => {
            imap.end();
            // Wait a tick for all async parsing to complete
            setTimeout(() => resolve(emails), 100);
          });

          fetch.once('error', (err) => {
            imap.end();
            reject(err);
          });
        });
      });
    });
  }

  async getFolders(): Promise<string[]> {
    const imap = await this.connect();

    return new Promise((resolve, reject) => {
      imap.getBoxes((err, boxes) => {
        imap.end();
        if (err) return reject(err);

        const folders: string[] = [];
        function walk(obj: any, prefix = '') {
          for (const key of Object.keys(obj)) {
            const path = prefix ? `${prefix}${obj[key].delimiter}${key}` : key;
            folders.push(path);
            if (obj[key].children) walk(obj[key].children, path);
          }
        }
        walk(boxes);
        resolve(folders);
      });
    });
  }

  async sendEmail(options: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text?: string;
    html?: string;
    attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
    smtpHost: string;
    smtpPort: number;
  }) {
    const transporter = nodemailer.createTransport({
      host: options.smtpHost,
      port: options.smtpPort,
      secure: options.smtpPort === 465,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
    });

    return transporter.sendMail({
      from: this.config.user,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
  }
}

export async function syncAccountEmails(accountId: string, limit?: number) {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive) return;

  let emails: NormalizedEmail[] = [];

  if (account.provider === 'imap' && account.imapHost && account.encryptedPassword) {
    const svc = new ImapService({
      email: account.email,
      encryptedPassword: account.encryptedPassword,
      imapHost: account.imapHost,
      imapPort: account.imapPort!,
    });
    emails = await svc.fetchEmails('INBOX', limit || 500);
  }
  // Gmail and Outlook handled by their respective services

  for (const email of emails) {
    const exists = await prisma.email.findFirst({
      where: { accountId, messageId: email.messageId },
    });
    if (exists) continue;

    await prisma.email.create({
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
        folder: email.folder,
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
  }
}
