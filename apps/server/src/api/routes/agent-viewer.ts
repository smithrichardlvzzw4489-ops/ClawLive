import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import {
  registerAgent,
  verifyAgentApiKey,
  subscribeToRoom,
  unsubscribeFromRoom,
  subscribeToWork,
  unsubscribeFromWork,
  getAgentSubscriptions,
} from '../../services/agent-viewer';
import { liveHistory } from './rooms-simple';
import { works, workMessages } from './rooms-simple';

export interface AuthAgentRequest extends Request {
  agentId?: string;
}

function agentAuthMiddleware(req: AuthAgentRequest, res: Response, next: () => void): void {
  const apiKey = req.headers['x-agent-api-key'] as string
    ?? req.headers.authorization?.replace('Bearer ', '');
  if (!apiKey) {
    res.status(401).json({ error: 'Missing X-Agent-Api-Key or Authorization header' });
    return;
  }
  const agentId = verifyAgentApiKey(apiKey);
  if (!agentId) {
    res.status(401).json({ error: 'Invalid agent API key' });
    return;
  }
  req.agentId = agentId;
  next();
}

export function agentViewerRoutes(io: Server): Router {
  const router = Router();

  /**
   * GET /api/agent-viewers
   * Health check for agent-viewer API
   */
  router.get('/', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'agent-viewers' });
  });

  router.get('/register', (_req: Request, res: Response) => {
    res.status(405).json({ error: 'Use POST to register' });
  });

  /**
   * POST /api/agent-viewers/register
   * Register a new agent viewer. Returns API key for authentication.
   */
  router.post('/register', (req: Request, res: Response) => {
    try {
      const { agentId, name, webhookUrl } = req.body;
      if (!agentId || typeof agentId !== 'string') {
        return res.status(400).json({ error: 'agentId is required' });
      }
      const { apiKey } = registerAgent(agentId, { name, webhookUrl });
      res.status(201).json({
        agentId,
        apiKey,
        message: 'Agent registered. Use X-Agent-Api-Key or Authorization: Bearer <apiKey> for API calls.',
      });
    } catch (error) {
      console.error('Agent registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  });

  // All routes below require agent auth
  router.use(agentAuthMiddleware);

  /**
   * GET /api/agent-viewers/subscriptions
   * Get current subscriptions for the authenticated agent.
   */
  router.get('/subscriptions', (req: AuthAgentRequest, res: Response) => {
    const agentId = req.agentId!;
    const { roomIds, workIds } = getAgentSubscriptions(agentId);
    res.json({ agentId, roomIds, workIds });
  });

  /**
   * POST /api/agent-viewers/subscribe/room/:roomId
   * Subscribe to a live room's content stream.
   */
  router.post('/subscribe/room/:roomId', (req: AuthAgentRequest, res: Response) => {
    const { roomId } = req.params;
    const agentId = req.agentId!;
    subscribeToRoom(agentId, roomId);
    res.json({ agentId, roomId, subscribed: true });
  });

  /**
   * DELETE /api/agent-viewers/unsubscribe/room/:roomId
   */
  router.delete('/unsubscribe/room/:roomId', (req: AuthAgentRequest, res: Response) => {
    const { roomId } = req.params;
    const agentId = req.agentId!;
    unsubscribeFromRoom(agentId, roomId);
    res.json({ agentId, roomId, subscribed: false });
  });

  /**
   * POST /api/agent-viewers/subscribe/work/:workId
   * Subscribe to a work's content stream.
   */
  router.post('/subscribe/work/:workId', (req: AuthAgentRequest, res: Response) => {
    const { workId } = req.params;
    const agentId = req.agentId!;
    subscribeToWork(agentId, workId);
    res.json({ agentId, workId, subscribed: true });
  });

  /**
   * DELETE /api/agent-viewers/unsubscribe/work/:workId
   */
  router.delete('/unsubscribe/work/:workId', (req: AuthAgentRequest, res: Response) => {
    const { workId } = req.params;
    const agentId = req.agentId!;
    unsubscribeFromWork(agentId, workId);
    res.json({ agentId, workId, subscribed: false });
  });

  /**
   * GET /api/agent-viewers/feed/room/:roomId/history
   * Get room history sessions (past live recordings) for learning.
   * Must be defined before /feed/room/:roomId to avoid 'history' being parsed as roomId.
   */
  router.get('/feed/room/:roomId/history', (req: AuthAgentRequest, res: Response) => {
    const { roomId } = req.params;
    const agentId = req.agentId!;

    const { roomIds } = getAgentSubscriptions(agentId);
    if (!roomIds.includes(roomId)) {
      return res.status(403).json({ error: 'Not subscribed to this room' });
    }

    const sessions = Array.from(liveHistory.values())
      .filter(h => h.roomId === roomId)
      .map(h => ({
        id: h.id,
        roomId: h.roomId,
        title: h.title,
        lobsterName: h.lobsterName,
        startedAt: h.startedAt,
        endedAt: h.endedAt,
        messageCount: h.messages.length,
        messages: h.messages,
      }));

    res.json({ roomId, sessions });
  });

  /**
   * GET /api/agent-viewers/feed/room/:roomId
   * Get room content feed for learning. Supports incremental sync via ?since=timestamp&limit=N
   */
  router.get('/feed/room/:roomId', async (req: AuthAgentRequest, res: Response) => {
    const { roomId } = req.params;
    const agentId = req.agentId!;
    const since = req.query.since ? new Date(req.query.since as string) : null;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    const { roomIds } = getAgentSubscriptions(agentId);
    if (!roomIds.includes(roomId)) {
      return res.status(403).json({ error: 'Not subscribed to this room' });
    }

    const { getMessageHistory } = await import('../../lib/rooms-store');
    const messages = await getMessageHistory(roomId);
    let filtered = messages;
    if (since) {
      filtered = messages.filter((m: { timestamp: Date }) => new Date(m.timestamp) > since);
    }
    const items = filtered.slice(-limit).map((m: { id: string; roomId: string; sender: string; content: string; timestamp: Date }) => ({
      id: m.id,
      roomId: m.roomId,
      sender: m.sender,
      content: m.content,
      timestamp: m.timestamp,
      type: 'message' as const,
    }));

    res.json({
      roomId,
      items,
      hasMore: filtered.length > limit,
    });
  });

  /**
   * GET /api/agent-viewers/feed/work/:workId
   * Get work content feed for learning.
   */
  router.get('/feed/work/:workId', (req: AuthAgentRequest, res: Response) => {
    const { workId } = req.params;
    const agentId = req.agentId!;
    const since = req.query.since ? new Date(req.query.since as string) : null;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    const { workIds } = getAgentSubscriptions(agentId);
    if (!workIds.includes(workId)) {
      return res.status(403).json({ error: 'Not subscribed to this work' });
    }

    const work = works.get(workId);
    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }

    const messages = workMessages.get(workId) || (work.messages ?? []);
    let filtered = messages;
    if (since) {
      filtered = messages.filter(m => new Date(m.timestamp) > since);
    }
    const items = filtered.slice(-limit).map((m: { id: string; sender: string; content: string; timestamp: Date }) => ({
      id: m.id,
      workId,
      sender: m.sender,
      content: m.content,
      timestamp: m.timestamp,
      type: 'message' as const,
    }));

    res.json({
      workId,
      workTitle: work.title,
      lobsterName: work.lobsterName,
      items,
      hasMore: filtered.length > limit,
    });
  });

  return router;
}
