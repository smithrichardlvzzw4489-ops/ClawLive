import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { mtprotoService } from '../../services/telegram-mtproto';
import {
  listByUser,
  getByIdForUser,
  create,
  deleteConnection,
  updateName,
  UserAgentConnection,
} from '../../services/user-agent-connections';
import { roomInfo, agentConfigs } from './rooms-simple';
import { workAgentConfigs } from './work-agent-config';
import { WorkConfigPersistence } from '../../services/work-config-persistence';
import { works } from './rooms-simple';

const TEMP_PREFIX = 'conn_';

export function userAgentConnectionsRoutes(): Router {
  const router = Router();

  // Health check (no auth) - for debugging route registration
  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'user-agent-connections' });
  });

  router.use(authenticateToken);

  /**
   * GET /api/user-agent-connections
   * 获取当前用户的全部连接
   */
  router.get('/', (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const list = listByUser(userId);
    res.json({ connections: list });
  });

  /**
   * POST /api/user-agent-connections/bot-create
   * 新建连接 - Bot Token 模式（无需 API 配置，只需 Bot Token + Agent Chat ID）
   * body: { name, botToken, agentChatId }
   */
  router.post('/bot-create', async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { name, botToken, agentChatId } = req.body;

      if (!name?.trim() || !botToken?.trim() || !agentChatId?.trim()) {
        return res.status(400).json({ error: 'name, botToken, agentChatId are required' });
      }

      const conn = create(userId, {
        name: name.trim(),
        agentType: 'telegram-bot',
        botToken: botToken.trim(),
        agentChatId: agentChatId.trim(),
      });

      res.json({
        success: true,
        connection: {
          id: conn.id,
          name: conn.name,
          agentChatId: conn.agentChatId,
        },
      });
    } catch (error) {
      console.error('user-agent-connections bot-create:', error);
      res.status(500).json({ error: 'Failed to create connection' });
    }
  });

  /**
   * POST /api/user-agent-connections/mtproto-start
   * 新建连接 - 第一步：发送验证码（用户只需手机号 + Agent Chat ID，服务器使用内置默认凭证）
   * body: { name, phoneNumber, agentChatId }
   */
  router.post('/mtproto-start', async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { name, phoneNumber, agentChatId } = req.body;

      if (!name?.trim() || !phoneNumber?.trim() || !agentChatId?.trim()) {
        return res.status(400).json({ error: 'name, phoneNumber, agentChatId are required' });
      }

      const tempId = TEMP_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2);
      const result = await mtprotoService.startLogin(tempId, phoneNumber);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({
        success: true,
        tempId,
        needsCode: true,
        message: 'Verification code sent',
      });
    } catch (error) {
      console.error('user-agent-connections mtproto-start:', error);
      res.status(500).json({ error: 'Failed to start login' });
    }
  });

  /**
   * POST /api/user-agent-connections/mtproto-code
   * 第二步：提交验证码
   * body: { tempId, code }
   */
  router.post('/mtproto-code', async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { tempId, code, name, agentChatId, phoneNumber } = req.body;

      if (!tempId || !code?.trim()) {
        return res.status(400).json({ error: 'tempId and code are required' });
      }

      const result = await mtprotoService.submitCode(tempId, code);

      if (!result.success) {
        if (result.needsPassword) {
          return res.json({
            success: false,
            needsPassword: true,
            passwordHint: result.passwordHint,
            tempId,
          });
        }
        return res.status(400).json({ success: false, error: result.error });
      }

      if (!result.sessionString) {
        return res.status(400).json({ error: 'No session returned' });
      }

      const conn = create(userId, {
        name: name || '未命名连接',
        agentType: 'telegram-mtproto',
        sessionString: result.sessionString,
        agentChatId: agentChatId || '',
        phone: phoneNumber,
      });

      res.json({
        success: true,
        connection: {
          id: conn.id,
          name: conn.name,
          agentChatId: conn.agentChatId,
          phone: conn.phone,
        },
      });
    } catch (error) {
      console.error('user-agent-connections mtproto-code:', error);
      res.status(500).json({ error: 'Failed to submit code' });
    }
  });

  /**
   * POST /api/user-agent-connections/mtproto-password
   * 第三步（可选）：提交两步验证密码
   * body: { tempId, password, name, agentChatId, phoneNumber }
   */
  router.post('/mtproto-password', async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { tempId, password, name, agentChatId, phoneNumber } = req.body;

      if (!tempId || !password?.trim()) {
        return res.status(400).json({ error: 'tempId and password are required' });
      }

      const result = await mtprotoService.submitPassword(tempId, password);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      if (!result.sessionString) {
        return res.status(400).json({ error: 'No session returned' });
      }

      const conn = create(userId, {
        name: name || '未命名连接',
        agentType: 'telegram-mtproto',
        sessionString: result.sessionString,
        agentChatId: agentChatId || '',
        phone: phoneNumber,
      });

      res.json({
        success: true,
        connection: {
          id: conn.id,
          name: conn.name,
          agentChatId: conn.agentChatId,
          phone: conn.phone,
        },
      });
    } catch (error) {
      console.error('user-agent-connections mtproto-password:', error);
      res.status(500).json({ error: 'Failed to submit password' });
    }
  });

  /**
   * DELETE /api/user-agent-connections/:id
   */
  router.delete('/:id', (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const ok = deleteConnection(id, userId);
    if (!ok) return res.status(404).json({ error: 'Connection not found' });
    res.json({ success: true });
  });

  /**
   * PATCH /api/user-agent-connections/:id
   * body: { name }
   */
  router.patch('/:id', (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const ok = updateName(id, userId, name.trim());
    if (!ok) return res.status(404).json({ error: 'Connection not found' });
    res.json({ success: true });
  });

  /**
   * POST /api/user-agent-connections/apply-to-room/:roomId
   * 将连接应用到直播间
   */
  router.post('/apply-to-room/:roomId', async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { roomId } = req.params;
      const { connectionId } = req.body;

      if (!connectionId) {
        return res.status(400).json({ error: 'connectionId is required' });
      }

      const conn = getByIdForUser(connectionId, userId);
      if (!conn) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      // 不再检查 room 是否存在（创建流程中 room 可能尚未完全就绪）
      const room = roomInfo.get(roomId);
      if (room && room.hostId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      if (conn.agentType === 'telegram-bot' && conn.botToken) {
        // Bot Token 模式：无需 API 配置
        const config = {
          agentType: 'telegram' as const,
          agentEnabled: true,
          agentBotToken: conn.botToken,
          agentChatId: conn.agentChatId,
          agentStatus: 'connected' as const,
        };
        agentConfigs.set(roomId, config);
      } else {
        // MTProto 模式
        const result = await mtprotoService.restoreSession(roomId, conn.sessionString!);
        if (!result.success) {
          return res.status(400).json({ error: result.error || 'Failed to restore session' });
        }
        const config = {
          agentType: 'telegram-user' as const,
          agentEnabled: true,
          agentChatId: conn.agentChatId,
          agentStatus: 'connected' as const,
          mtprotoSessionString: conn.sessionString,
          mtprotoPhone: conn.phone,
        };
        agentConfigs.set(roomId, config);
      }

      res.json({ success: true, message: 'Connection applied to room' });
    } catch (error) {
      console.error('apply-to-room:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /api/user-agent-connections/apply-to-work/:workId
   * 将连接应用到作品
   */
  router.post('/apply-to-work/:workId', async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { workId } = req.params;
      const { connectionId } = req.body;

      if (!connectionId) {
        return res.status(400).json({ error: 'connectionId is required' });
      }

      const conn = getByIdForUser(connectionId, userId);
      if (!conn) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      const work = works.get(workId);
      if (!work) return res.status(404).json({ error: 'Work not found' });
      if (work.authorId !== userId) return res.status(403).json({ error: 'Not authorized' });

      if (conn.agentType === 'telegram-bot') {
        return res.status(400).json({ error: 'Bot Token 连接暂不支持应用到作品，请使用真实用户身份连接' });
      }

      const result = await mtprotoService.restoreSession(workId, conn.sessionString!);
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to restore session' });
      }

      const config = {
        agentType: 'telegram-user' as const,
        agentEnabled: true,
        agentChatId: conn.agentChatId,
        agentStatus: 'active' as const,
        sessionString: conn.sessionString,
        phoneNumber: conn.phone,
      };
      workAgentConfigs.set(workId, config);
      WorkConfigPersistence.saveConfig(workId, config);

      res.json({ success: true, message: 'Connection applied to work' });
    } catch (error) {
      console.error('apply-to-work:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
