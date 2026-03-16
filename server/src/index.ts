import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';

import authRoutes from './routes/auth';
import accountRoutes from './routes/accounts';
import emailRoutes from './routes/emails';
import filterRoutes from './routes/filters';
import aiRoutes from './routes/ai';
import dashboardRoutes from './routes/dashboard';
import settingsRoutes from './routes/settings';
import { syncAllAccounts } from './services/sync.service';
import prisma from './lib/prisma';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5174',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5174',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/filters', filterRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join', (userId: string) => {
    socket.join(`user:${userId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Background sync every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    const users = await prisma.user.findMany({ select: { id: true } });
    for (const user of users) {
      try {
        await syncAllAccounts(user.id);
        io.to(`user:${user.id}`).emit('sync:complete');
      } catch (e) {
        console.error(`Sync failed for user ${user.id}:`, e);
      }
    }
  } catch (e) {
    console.error('Cron sync error:', e);
  }
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`M-MailBox server running on port ${PORT}`);
});

export { io };
