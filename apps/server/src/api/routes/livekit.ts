import { Router, Request, Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { authenticateToken, AuthRequest } from '../middleware/auth';

export function livekitRoutes(): Router {
  const router = Router();

  /**
   * POST /api/livekit/token
   * 生成 LiveKit 房间访问令牌（需登录）
   * Body: { roomId, participantName, isHost }
   */
  router.post('/token', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId, participantName, isHost } = req.body;
      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;

      if (!apiKey || !apiSecret) {
        return res.status(503).json({
          error: 'LiveKit 未配置',
          hint: '请在服务器设置 LIVEKIT_API_KEY 和 LIVEKIT_API_SECRET',
        });
      }

      if (!roomId || !participantName) {
        return res.status(400).json({ error: 'roomId 和 participantName 必填' });
      }

      const at = new AccessToken(apiKey, apiSecret, {
        identity: participantName,
        name: participantName,
        ttl: '2h',
      });

      at.addGrant({
        roomJoin: true,
        room: String(roomId),
        canPublish: !!isHost,
        canSubscribe: true,
        canPublishData: true,
      });

      const token = await at.toJwt();
      const url = process.env.LIVEKIT_URL || '';

      res.json({ token, url });
    } catch (error: any) {
      console.error('[LiveKit] Token error:', error);
      res.status(500).json({ error: error.message || '生成令牌失败' });
    }
  });

  /**
   * POST /api/livekit/token-viewer
   * 观众令牌（无需登录，仅可订阅）
   * Body: { roomId }
   */
  router.post('/token-viewer', async (req: Request, res: Response) => {
    try {
      const { roomId } = req.body;
      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;

      if (!apiKey || !apiSecret) {
        return res.status(503).json({ error: 'LiveKit 未配置' });
      }

      if (!roomId) {
        return res.status(400).json({ error: 'roomId 必填' });
      }

      const at = new AccessToken(apiKey, apiSecret, {
        identity: `viewer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: '观众',
        ttl: '1h',
      });

      at.addGrant({
        roomJoin: true,
        room: String(roomId),
        canPublish: false,
        canSubscribe: true,
        canPublishData: false,
      });

      const token = await at.toJwt();
      const url = process.env.LIVEKIT_URL || '';

      res.json({ token, url });
    } catch (error: any) {
      console.error('[LiveKit] Token viewer error:', error);
      res.status(500).json({ error: error.message || '生成令牌失败' });
    }
  });

  /**
   * POST /api/livekit/token-speaker
   * 观众连麦令牌（无需登录，可发布音视频）
   * Body: { roomId, participantName? } 未登录时 participantName 可省略，自动生成
   */
  router.post('/token-speaker', async (req: Request, res: Response) => {
    try {
      const { roomId, participantName } = req.body;
      const apiKey = process.env.LIVEKIT_API_KEY;
      const apiSecret = process.env.LIVEKIT_API_SECRET;

      if (!apiKey || !apiSecret) {
        return res.status(503).json({ error: 'LiveKit 未配置' });
      }

      if (!roomId) {
        return res.status(400).json({ error: 'roomId 必填' });
      }

      const identity = participantName?.trim() || `speaker-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const name = participantName?.trim() || '连麦观众';

      const at = new AccessToken(apiKey, apiSecret, {
        identity,
        name,
        ttl: '1h',
      });

      at.addGrant({
        roomJoin: true,
        room: String(roomId),
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const token = await at.toJwt();
      const url = process.env.LIVEKIT_URL || '';

      res.json({ token, url });
    } catch (error: any) {
      console.error('[LiveKit] Token speaker error:', error);
      res.status(500).json({ error: error.message || '生成令牌失败' });
    }
  });

  return router;
}
