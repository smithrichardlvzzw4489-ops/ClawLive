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
import { publishedSkillsRoutes } from './published-skills';
import { openApiRoutes } from './open';
import { adminRoutes } from './admin';
import { jobA2ARoutes } from './job-a2a';
import { mpRoutes } from './mp';
import { codernetRoutes } from './codernet';
import { siteMessagesRoutes } from './site-messages';
import { jobPlazaRoutes } from './job-plaza';
import { mathRoutes } from './math';

export function setupRoutes(app: Express, io: Server): void {
  app.use('/api/admin', adminRoutes());
  app.use('/api/mp', mpRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/open', openApiRoutes());
  app.use('/api/points', pointsRoutes());
  app.use('/api/platform', platformRoutes());
  app.use('/api/lobster', lobsterRoutes());
  app.use('/api/agent-viewers', agentViewerRoutes(io));
  app.use('/api/user-agent-connections', userAgentConnectionsRoutes());
  app.use('/api/inbox', inboxRoutes(io));
  app.use('/api/messages', siteMessagesRoutes());
  app.use('/api/job-plaza', jobPlazaRoutes());
  app.use('/api/math', mathRoutes());
  app.use('/api/user-follows', userFollowsRoutes()); // Before works to avoid :id param conflicts
  app.use('/api/recommendations', recommendationRoutes());
  app.use('/api/feed-posts', feedPostsRoutes());
  app.use('/api/job-a2a', jobA2ARoutes());
  app.use('/api/codernet', codernetRoutes());
  app.use('/api/search', searchRoutes());
  app.use('/api/behavior', behaviorRoutes());
  app.use('/api/rooms', roomSimpleRoutes(io));
  app.use('/api/webhooks', webhookRoutes(io));
  app.use('/api/agent-config', agentConfigSimpleRoutes(io));
  app.use('/api/work-agent-config', workAgentConfigRoutes(io));
  app.use('/api/skills', skillsRoutes());
  app.use('/api/published-skills', publishedSkillsRoutes());
  app.use('/api/works', worksRoutes(io));
  app.use('/api/community', communityRoutes());
  app.use('/api/creators', creatorsRoutes());
  app.use('/api/livekit', livekitRoutes());

  // 404 for unmatched /api routes (must be last)
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });
}
