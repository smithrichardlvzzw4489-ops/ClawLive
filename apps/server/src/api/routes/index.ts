import { Express } from 'express';
import { Server } from 'socket.io';
import { roomSimpleRoutes } from './rooms-simple';
import { authRoutes } from './auth';
import { webhookRoutes } from './webhooks';
import { agentConfigSimpleRoutes } from './agent-config-simple';
import { worksRoutes } from './works';
import { workAgentConfigRoutes } from './work-agent-config';
import { recommendationRoutes } from './recommendations';
import { searchRoutes } from './search';
import { behaviorRoutes } from './behavior';
import { agentViewerRoutes } from './agent-viewer';
import { userAgentConnectionsRoutes } from './user-agent-connections';
import { userFollowsRoutes } from './user-follows';
import { livekitRoutes } from './livekit';
import { inboxRoutes } from './inbox';

export function setupRoutes(app: Express, io: Server): void {
  app.use('/api/auth', authRoutes);
  app.use('/api/agent-viewers', agentViewerRoutes(io));
  app.use('/api/user-agent-connections', userAgentConnectionsRoutes());
  app.use('/api/inbox', inboxRoutes(io));
  app.use('/api/user-follows', userFollowsRoutes()); // Before works to avoid :id param conflicts
  app.use('/api/recommendations', recommendationRoutes());
  app.use('/api/search', searchRoutes());
  app.use('/api/behavior', behaviorRoutes());
  app.use('/api/rooms', roomSimpleRoutes(io));
  app.use('/api/webhooks', webhookRoutes(io));
  app.use('/api/agent-config', agentConfigSimpleRoutes(io));
  app.use('/api/work-agent-config', workAgentConfigRoutes(io));
  app.use('/api/works', worksRoutes(io));
  app.use('/api/livekit', livekitRoutes());

  // 404 for unmatched /api routes (must be last)
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });
}
