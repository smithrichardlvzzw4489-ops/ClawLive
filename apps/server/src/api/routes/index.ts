import { Express } from 'express';
import { Server } from 'socket.io';
import { roomRoutes } from './rooms';
import { authRoutes } from './auth';
import { webhookRoutes } from './webhooks';

export function setupRoutes(app: Express, io: Server): void {
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes(io));
  app.use('/api/webhooks', webhookRoutes(io));

  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });
}
