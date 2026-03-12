import { Express } from 'express';
import { Server } from 'socket.io';
import { roomSimpleRoutes } from './rooms-simple';
import { authRoutes } from './auth';
import { webhookRoutes } from './webhooks';
import { agentConfigSimpleRoutes } from './agent-config-simple';

export function setupRoutes(app: Express, io: Server): void {
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomSimpleRoutes(io));
  app.use('/api/webhooks', webhookRoutes(io));
  app.use('/api/agent-config', agentConfigSimpleRoutes(io));

  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });
}
