/**
 * Inbox API - 用户级通用 Agent 聊天（不依赖房间/作品）
 * 用于首页浮动聊天框等 Agent Native 入口
 */
import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { mtprotoService } from '../../services/telegram-mtproto';
import { appendMessage } from '../../lib/rooms-store';
import { listByUser, getByIdForUser } from '../../services/user-agent-connections';

const INBOX_PREFIX = 'inbox-';

// 每个用户的 inbox 配置：inbox-{userId} -> { agentChatId }
const inboxConfigs = new Map<string, { agentChatId: string }>();

export function inboxRoutes(io: any): Router {
  const router = Router();

  router.use(authenticateToken);

  /**
   * GET /api/inbox/status
   * 获取 inbox 连接状态（用于 widget 展示）
   */
  router.get('/status', async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const inboxId = INBOX_PREFIX + userId;

      const config = inboxConfigs.get(inboxId);
      const hasSession = mtprotoService.getSession(inboxId);

      res.json({
        connected: !!(config && hasSession),
        hasConnections: listByUser(userId).length > 0,
      });
    } catch (error) {
      console.error('[inbox] status error:', error);
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  /**
   * POST /api/user-agent-connections/apply-to-inbox
   * 将连接应用到 inbox（在 user-agent-connections 中注册）
   */
  // 注：apply-to-inbox 放在 user-agent-connections 更合理，这里用独立 router 调用

  /**
   * POST /api/inbox/message
   * 发送消息到 Agent
   */
  router.post('/message', async (req: AuthRequest, res: Response) => {
    console.log(`📨 [inbox/message] 收到消息请求`);
    try {
      const userId = req.user!.id;
      const { content } = req.body;
      const inboxId = INBOX_PREFIX + userId;

      if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      const config = inboxConfigs.get(inboxId);
      if (!config) {
        return res.status(400).json({
          error: 'Not connected. Please connect your Agent first.',
          code: 'NOT_CONNECTED',
        });
      }

      const userMessage = {
        id: Date.now().toString(),
        roomId: inboxId,
        sender: 'host' as const,
        content: content.trim(),
        timestamp: new Date(),
      };

      await appendMessage(inboxId, userMessage);
      io.to(inboxId).emit('new-message', userMessage);

      const result = await mtprotoService.sendAsUser(
        inboxId,
        config.agentChatId,
        content.trim()
      );

      if (!result.success) {
        return res.status(500).json({
          error: result.error || 'Failed to send message',
          code: 'SEND_FAILED',
        });
      }

      res.json({ message: userMessage });
    } catch (error) {
      console.error('[inbox] message error:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  return router;
}

/**
 * 导出供 user-agent-connections 和 telegram-mtproto 使用
 */
export function getInboxConfig(inboxId: string) {
  return inboxConfigs.get(inboxId);
}

export function setInboxConfig(inboxId: string, config: { agentChatId: string }) {
  inboxConfigs.set(inboxId, config);
}

export async function applyConnectionToInbox(
  userId: string,
  connectionId: string,
  io: any
): Promise<{ success: boolean; error?: string }> {
  const conn = getByIdForUser(connectionId, userId);
  if (!conn) return { success: false, error: 'Connection not found' };

  if (conn.agentType === 'telegram-bot') {
    return { success: false, error: 'Bot Token 连接暂不支持 Inbox，请使用真实用户身份连接' };
  }

  if (!conn.sessionString) {
    return { success: false, error: 'Connection has no session' };
  }

  const inboxId = INBOX_PREFIX + userId;
  const result = await mtprotoService.restoreSession(inboxId, conn.sessionString);
  if (!result.success) {
    return { success: false, error: result.error || 'Failed to restore session' };
  }

  setInboxConfig(inboxId, { agentChatId: conn.agentChatId });
  return { success: true };
}
