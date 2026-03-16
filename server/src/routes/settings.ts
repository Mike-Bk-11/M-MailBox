import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// --- Get settings ---
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    let settings = await prisma.userSettings.findUnique({ where: { userId: req.userId } });
    if (!settings) {
      settings = await prisma.userSettings.create({ data: { userId: req.userId! } });
    }
    // Don't expose API key fully
    return res.json({
      ...settings,
      openaiApiKey: settings.openaiApiKey ? '••••' + settings.openaiApiKey.slice(-4) : null,
      hasOpenaiKey: !!settings.openaiApiKey,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Update settings ---
router.patch('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const {
      openaiApiKey,
      aiAutoReply,
      aiSummarize,
      aiCategorize,
      aiSentiment,
      aiPriority,
      aiSpamDetect,
      autoReplyMaxPerDay,
      autoReplyRequireApproval,
      theme,
      notifications,
    } = req.body;

    const data: any = {};
    if (openaiApiKey !== undefined) {
      // Skip if it's the masked value sent back from the frontend
      const cleaned = openaiApiKey ? openaiApiKey.replace(/[^\x20-\x7E]/g, '').trim() : openaiApiKey;
      if (cleaned && !cleaned.includes('****') && cleaned.startsWith('sk-')) {
        data.openaiApiKey = cleaned;
      } else if (cleaned === '' || cleaned === null) {
        data.openaiApiKey = null;
      }
    }
    if (aiAutoReply !== undefined) data.aiAutoReply = aiAutoReply;
    if (aiSummarize !== undefined) data.aiSummarize = aiSummarize;
    if (aiCategorize !== undefined) data.aiCategorize = aiCategorize;
    if (aiSentiment !== undefined) data.aiSentiment = aiSentiment;
    if (aiPriority !== undefined) data.aiPriority = aiPriority;
    if (aiSpamDetect !== undefined) data.aiSpamDetect = aiSpamDetect;
    if (autoReplyMaxPerDay !== undefined) data.autoReplyMaxPerDay = autoReplyMaxPerDay;
    if (autoReplyRequireApproval !== undefined) data.autoReplyRequireApproval = autoReplyRequireApproval;
    if (theme !== undefined) data.theme = theme;
    if (notifications !== undefined) data.notifications = notifications;

    const settings = await prisma.userSettings.upsert({
      where: { userId: req.userId },
      update: data,
      create: { userId: req.userId!, ...data },
    });

    return res.json({
      ...settings,
      openaiApiKey: settings.openaiApiKey ? '••••' + settings.openaiApiKey.slice(-4) : null,
      hasOpenaiKey: !!settings.openaiApiKey,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
