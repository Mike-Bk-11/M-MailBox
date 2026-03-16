import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// --- Overview stats ---
router.get('/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days as string));

    const accounts = await prisma.emailAccount.findMany({
      where: { userId: req.userId },
      select: { id: true, email: true, displayName: true, provider: true, color: true },
    });

    const accountIds = accounts.map(a => a.id);

    // Total counts
    const [totalEmails, unreadCount, starredCount, spamCount] = await Promise.all([
      prisma.email.count({ where: { accountId: { in: accountIds } } }),
      prisma.email.count({ where: { accountId: { in: accountIds }, isRead: false, folder: 'INBOX' } }),
      prisma.email.count({ where: { accountId: { in: accountIds }, isStarred: true } }),
      prisma.email.count({ where: { accountId: { in: accountIds }, isSpam: true } }),
    ]);

    // Per-account unread
    const accountStats = await Promise.all(
      accounts.map(async (account) => {
        const unread = await prisma.email.count({
          where: { accountId: account.id, isRead: false, folder: 'INBOX' },
        });
        const total = await prisma.email.count({
          where: { accountId: account.id },
        });
        return { ...account, unread, total };
      })
    );

    // Emails over time (last N days)
    const emailsOverTime = await prisma.email.groupBy({
      by: ['folder'],
      where: { accountId: { in: accountIds }, date: { gte: since } },
      _count: true,
    });

    // Category breakdown
    const categoryBreakdown = await prisma.email.groupBy({
      by: ['aiCategory'],
      where: { accountId: { in: accountIds }, aiCategory: { not: null } },
      _count: true,
    });

    // Top contacts (senders)
    const topSenders = await prisma.email.groupBy({
      by: ['fromAddress'],
      where: { accountId: { in: accountIds }, folder: 'INBOX' },
      _count: true,
      orderBy: { _count: { fromAddress: 'desc' } },
      take: 10,
    });

    // Attachment stats
    const attachmentStats = await prisma.attachment.aggregate({
      where: { email: { accountId: { in: accountIds } } },
      _count: true,
      _sum: { size: true },
    });

    // AI action stats
    const aiStats = await prisma.aILog.groupBy({
      by: ['action'],
      where: { userId: req.userId },
      _count: true,
    });

    return res.json({
      totalEmails,
      unreadCount,
      starredCount,
      spamCount,
      accountStats,
      emailsOverTime,
      categoryBreakdown: categoryBreakdown.map(c => ({
        category: c.aiCategory || 'Uncategorized',
        count: c._count,
      })),
      topSenders: topSenders.map(s => ({
        email: s.fromAddress,
        count: s._count,
      })),
      attachmentStats: {
        totalCount: attachmentStats._count,
        totalSize: attachmentStats._sum.size || 0,
      },
      aiStats: aiStats.map(a => ({
        action: a.action,
        count: a._count,
      })),
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Emails per day chart data ---
router.get('/emails-over-time', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days as string));

    const accounts = await prisma.emailAccount.findMany({
      where: { userId: req.userId },
      select: { id: true },
    });
    const accountIds = accounts.map(a => a.id);

    const emails = await prisma.email.findMany({
      where: { accountId: { in: accountIds }, date: { gte: since } },
      select: { date: true, folder: true },
      orderBy: { date: 'asc' },
    });

    // Group by date
    const byDate: Record<string, { received: number; sent: number }> = {};
    for (const email of emails) {
      const dateKey = email.date.toISOString().split('T')[0];
      if (!byDate[dateKey]) byDate[dateKey] = { received: 0, sent: 0 };
      if (email.folder === 'SENT') byDate[dateKey].sent++;
      else byDate[dateKey].received++;
    }

    const data = Object.entries(byDate).map(([date, counts]) => ({
      date,
      ...counts,
    }));

    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Response time analytics ---
router.get('/response-time', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.emailAccount.findMany({
      where: { userId: req.userId },
      select: { id: true, email: true },
    });
    const accountEmails = accounts.map(a => a.email);
    const accountIds = accounts.map(a => a.id);

    // Get sent emails and match replies
    const sentEmails = await prisma.email.findMany({
      where: { accountId: { in: accountIds }, folder: 'SENT' },
      select: { threadId: true, date: true },
      orderBy: { date: 'asc' },
    });

    const receivedEmails = await prisma.email.findMany({
      where: { accountId: { in: accountIds }, folder: 'INBOX' },
      select: { threadId: true, date: true },
      orderBy: { date: 'asc' },
    });

    // Simple avg response time estimation
    let totalResponseTime = 0;
    let responseCount = 0;

    for (const sent of sentEmails) {
      if (!sent.threadId) continue;
      const received = receivedEmails.find(r => r.threadId === sent.threadId && r.date < sent.date);
      if (received) {
        const diff = sent.date.getTime() - received.date.getTime();
        totalResponseTime += diff;
        responseCount++;
      }
    }

    const avgResponseTimeMs = responseCount > 0 ? totalResponseTime / responseCount : 0;
    const avgResponseTimeHours = avgResponseTimeMs / (1000 * 60 * 60);

    return res.json({
      avgResponseTimeHours: Math.round(avgResponseTimeHours * 10) / 10,
      totalReplies: responseCount,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
