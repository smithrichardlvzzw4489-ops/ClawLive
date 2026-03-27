import { Express } from 'express';
import { Server } from 'socket.io';
import { roomSimpleRoutes } from './rooms-simple';
import { authRoutes } from './auth';
import { webhookRoutes } from './webhooks';
import { agentConfigSimpleRoutes } from './agent-config-simple';
import { worksRoutes } from './works';
import { skillsRoutes } from './skills';
import { workAgentConfigRoutes } from './work-agent-config';
import { recommendationRoutes } from './recommendations';
import { searchRoutes } from './search';
import { behaviorRoutes } from './behavior';
import { agentViewerRoutes } from './agent-viewer';
import { userAgentConnectionsRoutes } from './user-agent-connections';
import { userFollowsRoutes } from './user-follows';
import { livekitRoutes } from './livekit';
import { inboxRoutes } from './inbox';
import { communityRoutes } from './community';
import { creatorsRoutes } from './creators';
import { feedPostsRoutes } from './feed-posts';
import { pointsRoutes } from './points';
import { lobsterRoutes } from './lobster';
import { platformRoutes } from './platform';

export function setupRoutes(app: Express, io: Server): void {
  app.use('/api/auth', authRoutes);
  app.use('/api/points', pointsRoutes());
  app.use('/api/platform', platformRoutes());
  app.use('/api/lobster', lobsterRoutes());
  app.use('/api/agent-viewers', agentViewerRoutes(io));
  app.use('/api/user-agent-connections', userAgentConnectionsRoutes());
  app.use('/api/inbox', inboxRoutes(io));
  app.use('/api/user-follows', userFollowsRoutes()); // Before works to avoid :id param conflicts
  app.use('/api/recommendations', recommendationRoutes());
  app.use('/api/feed-posts', feedPostsRoutes());
  app.use('/api/search', searchRoutes());
  app.use('/api/behavior', behaviorRoutes());
  app.use('/api/rooms', roomSimpleRoutes(io));
  app.use('/api/webhooks', webhookRoutes(io));
  app.use('/api/agent-config', agentConfigSimpleRoutes(io));
  app.use('/api/work-agent-config', workAgentConfigRoutes(io));
  app.use('/api/skills', skillsRoutes());
  app.use('/api/works', worksRoutes(io));
  app.use('/api/community', communityRoutes());
  app.use('/api/creators', creatorsRoutes());
  app.use('/api/livekit', livekitRoutes());

  // 404 for unmatched /api routes (must be last)
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });
}
