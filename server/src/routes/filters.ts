import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// --- CRUD for filters ---
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const filters = await prisma.filter.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(filters);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, conditions, actions, isActive } = req.body;

    if (!name || !conditions || !actions) {
      return res.status(400).json({ error: 'name, conditions, and actions are required' });
    }

    // Validate JSON structure
    const parsedConditions = typeof conditions === 'string' ? JSON.parse(conditions) : conditions;
    const parsedActions = typeof actions === 'string' ? JSON.parse(actions) : actions;

    const filter = await prisma.filter.create({
      data: {
        userId: req.userId!,
        name,
        conditions: JSON.stringify(parsedConditions),
        actions: JSON.stringify(parsedActions),
        isActive: isActive !== false,
      },
    });

    return res.status(201).json(filter);
  } catch (error) {
    console.error('Create filter error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const filter = await prisma.filter.findFirst({
      where: { id, userId: req.userId },
    });
    if (!filter) return res.status(404).json({ error: 'Filter not found' });

    const { name, conditions, actions, isActive } = req.body;

    const updated = await prisma.filter.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(conditions !== undefined && {
          conditions: JSON.stringify(typeof conditions === 'string' ? JSON.parse(conditions) : conditions),
        }),
        ...(actions !== undefined && {
          actions: JSON.stringify(typeof actions === 'string' ? JSON.parse(actions) : actions),
        }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const filter = await prisma.filter.findFirst({
      where: { id, userId: req.userId },
    });
    if (!filter) return res.status(404).json({ error: 'Filter not found' });

    await prisma.filter.delete({ where: { id } });
    return res.json({ message: 'Filter deleted' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Labels ---
router.get('/labels', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const labels = await prisma.label.findMany({
      where: { userId: req.userId },
    });
    return res.json(labels);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/labels', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const label = await prisma.label.create({
      data: { userId: req.userId!, name, color: color || '#6B7280' },
    });
    return res.status(201).json(label);
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/labels/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const label = await prisma.label.findFirst({
      where: { id, userId: req.userId },
    });
    if (!label) return res.status(404).json({ error: 'Label not found' });

    await prisma.label.delete({ where: { id } });
    return res.json({ message: 'Label deleted' });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
