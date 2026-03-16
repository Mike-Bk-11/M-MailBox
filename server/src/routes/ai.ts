import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { suggestReplies, summarizeEmail, categorizeEmail, analyzeSentiment, scorePriority, processEmailWithAI, composeEmailWithAI } from '../services/ai.service';

const router = Router();

// --- AI compose email ---
router.post('/compose', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { instruction, to, subject } = req.body;
    if (!instruction) return res.status(400).json({ error: 'instruction is required' });
    const result = await composeEmailWithAI(req.userId!, instruction, { to, subject });
    if (!result) return res.status(400).json({ error: 'AI not configured. Add your OpenAI API key in Settings.' });
    return res.json(result);
  } catch (error: any) {
    console.error('AI compose error:', error?.message || error);
    const msg = error?.status === 429
      ? 'OpenAI rate limit exceeded. Please wait a moment and try again.'
      : error?.message || 'AI processing failed';
    return res.status(500).json({ error: msg });
  }
});

// --- Suggest replies ---
router.post('/suggest-replies/:emailId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const emailId = req.params.emailId as string;
    const replies = await suggestReplies(req.userId!, emailId);
    if (!replies) return res.status(400).json({ error: 'AI not configured or email not found' });
    return res.json({ replies });
  } catch (error) {
    console.error('Suggest replies error:', error);
    return res.status(500).json({ error: 'AI processing failed' });
  }
});

// --- Summarize email ---
router.post('/summarize/:emailId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const emailId = req.params.emailId as string;
    const summary = await summarizeEmail(req.userId!, emailId);
    if (!summary) return res.status(400).json({ error: 'AI not configured or email not found' });
    return res.json({ summary });
  } catch (error) {
    console.error('Summarize error:', error);
    return res.status(500).json({ error: 'AI processing failed' });
  }
});

// --- Categorize email ---
router.post('/categorize/:emailId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const emailId = req.params.emailId as string;
    const category = await categorizeEmail(req.userId!, emailId);
    if (!category) return res.status(400).json({ error: 'AI not configured or email not found' });
    return res.json({ category });
  } catch (error) {
    console.error('Categorize error:', error);
    return res.status(500).json({ error: 'AI processing failed' });
  }
});

// --- Sentiment analysis ---
router.post('/sentiment/:emailId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const emailId = req.params.emailId as string;
    const sentiment = await analyzeSentiment(req.userId!, emailId);
    if (!sentiment) return res.status(400).json({ error: 'AI not configured or email not found' });
    return res.json({ sentiment });
  } catch (error) {
    console.error('Sentiment error:', error);
    return res.status(500).json({ error: 'AI processing failed' });
  }
});

// --- Priority scoring ---
router.post('/priority/:emailId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const emailId = req.params.emailId as string;
    const priority = await scorePriority(req.userId!, emailId);
    if (priority === null) return res.status(400).json({ error: 'AI not configured or email not found' });
    return res.json({ priority });
  } catch (error) {
    console.error('Priority error:', error);
    return res.status(500).json({ error: 'AI processing failed' });
  }
});

// --- Process all AI features on an email ---
router.post('/process/:emailId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const emailId = req.params.emailId as string;
    const results = await processEmailWithAI(req.userId!, emailId);
    return res.json(results);
  } catch (error) {
    console.error('AI process error:', error);
    return res.status(500).json({ error: 'AI processing failed' });
  }
});

// --- AI action log ---
router.get('/logs', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [logs, total] = await Promise.all([
      prisma.aILog.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.aILog.count({ where: { userId: req.userId } }),
    ]);

    return res.json({ logs, total });
  } catch (error) {
    console.error('AI logs error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
