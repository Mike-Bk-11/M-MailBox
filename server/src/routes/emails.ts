import { Router, Response } from 'express';
import multer from 'multer';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { syncAllAccounts } from '../services/sync.service';
import { ImapService } from '../services/imap.service';
import { GmailService } from '../services/gmail.service';
import { sendOutlookEmail } from '../services/outlook.service';
import { decrypt } from '../utils/crypto';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// --- Sync all accounts ---
router.post('/sync', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const quick = req.query.quick === 'true';
    const results = await syncAllAccounts(req.userId!, quick ? 20 : undefined);
    return res.json({ results });
  } catch (error) {
    console.error('Sync error:', error);
    return res.status(500).json({ error: 'Sync failed' });
  }
});

// --- Sync single account ---
router.post('/sync/:accountId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const accountId = req.params.accountId as string;
    const account = await prisma.emailAccount.findFirst({
      where: { id: accountId, userId: req.userId },
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    // First sync: fetch up to 5000; subsequent syncs: 500
    const limit = account.lastSyncedAt ? 500 : 5000;

    switch (account.provider) {
      case 'gmail':
        const { syncGmailAccount: syncGmail } = await import('../services/gmail.service');
        await syncGmail(account.id, limit);
        break;
      case 'outlook':
        const { syncOutlookAccount: syncOutlook } = await import('../services/outlook.service');
        await syncOutlook(account.id, limit);
        break;
      case 'imap':
        const { syncAccountEmails: syncImap } = await import('../services/imap.service');
        await syncImap(account.id, limit);
        break;
    }

    await prisma.emailAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date() },
    });

    return res.json({ message: `Synced ${account.email}` });
  } catch (error) {
    console.error('Sync account error:', error);
    return res.status(500).json({ error: 'Sync failed' });
  }
});

// --- List emails ---
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const {
      accountId,
      folder = 'INBOX',
      page = '1',
      limit = '50',
      search,
      isRead,
      isStarred,
      category,
      priority,
      sortBy = 'date',
      sortOrder = 'desc',
    } = req.query;

    const where: any = {
      account: { userId: req.userId },
    };

    if (accountId) where.accountId = accountId;
    if (folder) where.folder = folder;
    if (isRead !== undefined) where.isRead = isRead === 'true';
    if (isStarred !== undefined) where.isStarred = isStarred === 'true';
    if (category) where.aiCategory = category;
    if (priority) where.aiPriority = parseInt(priority as string);

    if (search) {
      where.OR = [
        { subject: { contains: search as string } },
        { fromAddress: { contains: search as string } },
        { fromName: { contains: search as string } },
        { bodyText: { contains: search as string } },
        { snippet: { contains: search as string } },
      ];
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where,
        include: {
          account: { select: { email: true, provider: true, color: true, displayName: true } },
          attachments: { select: { id: true, filename: true, contentType: true, size: true } },
        },
        orderBy: { [sortBy as string]: sortOrder },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.email.count({ where }),
    ]);

    return res.json({
      emails,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('List emails error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Get custom folders ---
router.get('/folders', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { accountId } = req.query;
    const accounts = await prisma.emailAccount.findMany({
      where: { userId: req.userId },
      select: { id: true },
    });
    const accountIds = accountId
      ? [accountId as string].filter(id => accounts.some(a => a.id === id))
      : accounts.map(a => a.id);

    const results = await prisma.email.findMany({
      where: { accountId: { in: accountIds } },
      select: { folder: true },
      distinct: ['folder'],
    });

    const systemFolders = ['INBOX', 'SENT', 'DRAFTS', 'STARRED', 'SPAM', 'TRASH'];
    const customFolders = results.map(r => r.folder).filter(f => !systemFolders.includes(f));

    return res.json(customFolders);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Get single email ---
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const email = await prisma.email.findFirst({
      where: { id, account: { userId: req.userId } },
      include: {
        account: { select: { email: true, provider: true, color: true, displayName: true } },
        attachments: true,
      },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Mark as read
    if (!email.isRead) {
      await prisma.email.update({ where: { id: email.id }, data: { isRead: true } });
    }

    return res.json(email);
  } catch (error) {
    console.error('Get email error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Send email ---
router.post('/send', authMiddleware, upload.array('attachments', 10), async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, to, cc, bcc, subject, text, html } = req.body;
    const files = (req.files as Express.Multer.File[]) || [];

    if (!accountId || !to || !subject) {
      return res.status(400).json({ error: 'accountId, to, and subject are required' });
    }

    const account = await prisma.emailAccount.findFirst({
      where: { id: accountId, userId: req.userId },
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const attachments = files.map((f) => ({
      filename: f.originalname,
      content: f.buffer,
      contentType: f.mimetype,
    }));

    switch (account.provider) {
      case 'imap':
        if (!account.smtpHost || !account.smtpPort || !account.encryptedPassword) {
          return res.status(400).json({ error: 'SMTP not configured for this account' });
        }
        const imapSvc = new ImapService({
          email: account.email,
          encryptedPassword: account.encryptedPassword,
          imapHost: account.imapHost!,
          imapPort: account.imapPort!,
        });
        await imapSvc.sendEmail({
          to, cc, bcc, subject, text, html,
          smtpHost: account.smtpHost,
          smtpPort: account.smtpPort,
          attachments,
        });
        break;

      case 'gmail':
        const gmailSvc = new GmailService(account.accessToken!, account.refreshToken, account.id);
        await gmailSvc.sendEmail({ to, cc, bcc, subject, text, html });
        break;

      case 'outlook':
        await sendOutlookEmail(account.id, { to, cc, bcc, subject, text, html });
        break;
    }

    return res.json({ message: 'Email sent' });
  } catch (error) {
    console.error('Send email error:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

// --- Bulk actions ---
router.post('/bulk', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { ids, action, value } = req.body;

    if (!ids || !Array.isArray(ids) || !action) {
      return res.status(400).json({ error: 'ids array and action are required' });
    }

    const where = { id: { in: ids }, account: { userId: req.userId } };

    switch (action) {
      case 'markRead':
        await prisma.email.updateMany({ where, data: { isRead: true } });
        break;
      case 'markUnread':
        await prisma.email.updateMany({ where, data: { isRead: false } });
        break;
      case 'star':
        await prisma.email.updateMany({ where, data: { isStarred: true } });
        break;
      case 'unstar':
        await prisma.email.updateMany({ where, data: { isStarred: false } });
        break;
      case 'moveToFolder':
        await prisma.email.updateMany({ where, data: { folder: value || 'INBOX' } });
        break;
      case 'delete':
        await prisma.email.updateMany({ where, data: { folder: 'TRASH' } });
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    return res.json({ message: `Action '${action}' applied to ${ids.length} emails` });
  } catch (error) {
    console.error('Bulk action error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Toggle star ---
router.patch('/:id/star', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const email = await prisma.email.findFirst({
      where: { id, account: { userId: req.userId } },
    });
    if (!email) return res.status(404).json({ error: 'Email not found' });

    const updated = await prisma.email.update({
      where: { id: email.id },
      data: { isStarred: !email.isStarred },
    });
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Move email ---
router.patch('/:id/move', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { folder } = req.body;
    const email = await prisma.email.findFirst({
      where: { id, account: { userId: req.userId } },
    });
    if (!email) return res.status(404).json({ error: 'Email not found' });

    const updated = await prisma.email.update({
      where: { id: email.id },
      data: { folder },
    });
    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Save draft ---
router.post('/drafts', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { accountId, to, cc, bcc, subject, text, html, draftId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    const account = await prisma.emailAccount.findFirst({
      where: { id: accountId, userId: req.userId },
    });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const draftData = {
      accountId,
      fromAddress: account.email,
      fromName: account.displayName || account.email,
      toAddresses: to ? JSON.stringify(to.split(',').map((e: string) => e.trim())) : '[]',
      ccAddresses: cc ? JSON.stringify(cc.split(',').map((e: string) => e.trim())) : null,
      bccAddresses: bcc ? JSON.stringify(bcc.split(',').map((e: string) => e.trim())) : null,
      subject: subject || null,
      bodyText: text || null,
      bodyHtml: html || null,
      snippet: text ? text.substring(0, 200) : null,
      folder: 'DRAFTS',
      date: new Date(),
      isRead: true,
    };

    let draft;
    if (draftId) {
      // Update existing draft
      const existing = await prisma.email.findFirst({
        where: { id: draftId, folder: 'DRAFTS', account: { userId: req.userId } },
      });
      if (existing) {
        draft = await prisma.email.update({ where: { id: existing.id }, data: draftData });
      } else {
        draft = await prisma.email.create({ data: draftData });
      }
    } else {
      draft = await prisma.email.create({ data: draftData });
    }

    return res.json(draft);
  } catch (error) {
    console.error('Save draft error:', error);
    return res.status(500).json({ error: 'Failed to save draft' });
  }
});

// --- Delete draft ---
router.delete('/drafts/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const draft = await prisma.email.findFirst({
      where: { id, folder: 'DRAFTS', account: { userId: req.userId } },
    });
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    await prisma.email.delete({ where: { id: draft.id } });
    return res.json({ message: 'Draft deleted' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Apply filters to existing emails ---
router.post('/apply-filters', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { applyFiltersToEmail } = await import('../services/filter.service');

    const accounts = await prisma.emailAccount.findMany({
      where: { userId: req.userId },
      select: { id: true },
    });
    const accountIds = accounts.map(a => a.id);

    const emails = await prisma.email.findMany({
      where: { accountId: { in: accountIds }, folder: 'INBOX' },
    });

    let applied = 0;
    for (const email of emails) {
      const actions = await applyFiltersToEmail(email, req.userId!);
      if (actions.length > 0) applied++;
    }

    return res.json({ message: `Filters applied to ${applied} emails`, applied, total: emails.length });
  } catch (error) {
    console.error('Apply filters error:', error);
    return res.status(500).json({ error: 'Failed to apply filters' });
  }
});

export default router;
