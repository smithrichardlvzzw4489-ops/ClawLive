import { Router, Response } from 'express';
import { Server } from 'socket.io';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { TelegramBridgeService, bridgeManager } from '../../services/telegram-bridge';
import { mtprotoService } from '../../services/telegram-mtproto';
import { RoomAgentConfigPersistence } from '../../services/room-agent-config-persistence';
import { agentConfigs } from './rooms-simple';
import { getRoom } from '../../lib/rooms-store';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-webhook-secret-change-in-production';

export function agentConfigSimpleRoutes(io: Server): Router {
  const router = Router();
  
  /**
   * GET /api/agent-config/:roomId/browser-gateway
   * 仅主播可调，返回 OpenClaw Gateway 连接信息供浏览器直连（避免 1008）
   */
  router.get('/:roomId/browser-gateway', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;
      const room = await getRoom(roomId);
      if (!room) return res.status(404).json({ error: 'Room not found' });
      if (room.hostId !== userId) return res.status(403).json({ error: 'Only room host can get gateway credentials' });

      let config = agentConfigs.get(roomId);
      if (!config) {
        const restored = await RoomAgentConfigPersistence.restoreToMemory(roomId, agentConfigs);
        if (restored) config = agentConfigs.get(roomId);
      }

      if (!config || config.agentType !== 'openclaw-direct') {
        return res.json({ openclawGatewayUrl: '', openclawToken: '', agentType: config?.agentType || 'mock' });
      }

      const cfg = config as Record<string, unknown>;
      const gatewayUrl = (cfg.openclawGatewayUrl as string) || '';
      const token = (cfg.openclawToken as string) || '';

      res.json({ openclawGatewayUrl: gatewayUrl, openclawToken: token, agentType: 'openclaw-direct' });
    } catch (error) {
      console.error('Error getting browser gateway config:', error);
      res.status(500).json({ error: 'Failed to get gateway config' });
    }
  });

  /**
   * GET /api/agent-config/:roomId (NO DB, NO AUTH)
   */
  router.get('/:roomId', async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      
      console.log(`📥 GET agent-config for room: ${roomId}`);
      
      // 内存无配置时，尝试从持久化恢复
      let config = agentConfigs.get(roomId);
      if (!config) {
        const restored = await RoomAgentConfigPersistence.restoreToMemory(roomId, agentConfigs);
        if (restored) {
          config = agentConfigs.get(roomId);
          console.log(`✅ [RoomAgent] Restored config for room ${roomId} from persistence`);
        }
      }
      
      config = config || {
        agentType: 'mock',
        agentEnabled: false,
        agentChatId: '',
        agentStatus: 'disconnected',
      };
      
      const cfg = config as Record<string, unknown>;
      res.json({
        agentType: config.agentType,
        agentEnabled: config.agentEnabled,
        agentChatId: config.agentChatId || '',
        agentStatus: config.agentStatus,
        hasBotToken: !!config.agentBotToken,
        openclawGatewayUrl: (cfg.openclawGatewayUrl as string) || '',
        hasOpenclawToken: !!(cfg.openclawToken as string),
      });
    } catch (error) {
      console.error('Error getting agent config:', error);
      res.status(500).json({ error: 'Failed to get agent config' });
    }
  });
  
  /**
   * PUT /api/agent-config/:roomId (NO DB)
   */
  router.put('/:roomId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;
      const { agentType, agentEnabled, agentBotToken, agentChatId, openclawGatewayUrl, openclawToken } = req.body;
      
      // Check room（支持 Redis 多实例）
      const room = await getRoom(roomId);
      
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      // Allow host to update
      if (room.hostId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      // Get existing config
      const existingConfig = agentConfigs.get(roomId) as Record<string, unknown> | undefined;
      const existing = existingConfig || {};
      
      // Update configuration in memory (preserve MTProto + OpenClaw Direct fields)
      const newConfig = {
        agentType: agentType || (existing.agentType as string) || 'mock',
        agentEnabled: agentEnabled !== undefined ? agentEnabled : (existing.agentEnabled as boolean) || false,
        agentBotToken: agentBotToken ?? (existing.agentBotToken as string),
        agentChatId: agentChatId ?? (existing.agentChatId as string),
        agentStatus: (existing.agentStatus as string) || 'disconnected',
        mtprotoSessionString: (existing as Record<string, unknown>).mtprotoSessionString as string | undefined,
        mtprotoPhone: (existing as Record<string, unknown>).mtprotoPhone as string | undefined,
        openclawGatewayUrl: openclawGatewayUrl ?? ((existing as Record<string, unknown>).openclawGatewayUrl as string | undefined),
        openclawToken: openclawToken ?? ((existing as Record<string, unknown>).openclawToken as string | undefined),
      };

      agentConfigs.set(roomId, newConfig);

      if ((newConfig.agentType as string) === 'openclaw-direct' && newConfig.openclawGatewayUrl && newConfig.openclawToken) {
        RoomAgentConfigPersistence.saveConfig(roomId, {
          agentType: 'openclaw-direct',
          agentEnabled: !!newConfig.agentEnabled,
          openclawGatewayUrl: newConfig.openclawGatewayUrl as string,
          openclawToken: newConfig.openclawToken as string,
        });
      }
      
      console.log(`✅ Agent config saved for room ${roomId}:`, {
        type: newConfig.agentType,
        enabled: newConfig.agentEnabled,
        hasToken: !!newConfig.agentBotToken,
        hasChatId: !!newConfig.agentChatId,
        hasOpenclaw: (newConfig.agentType as string) === 'openclaw-direct',
      });
      
      res.json({
        success: true,
        message: 'Agent configuration updated',
      });
    } catch (error) {
      console.error('Error updating agent config:', error);
      res.status(500).json({ error: 'Failed to update agent config' });
    }
  });
  
  /**
   * POST /api/agent-config/test-openclaw-direct
   * 验证 OpenClaw Gateway 是否可连接（云端部署时必测）
   */
  router.post('/test-openclaw-direct', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { gatewayUrl, token } = req.body;
      if (!gatewayUrl?.trim() || !token?.trim()) {
        return res.status(400).json({ success: false, error: 'Gateway URL 和 Token 必填' });
      }
      const base = String(gatewayUrl).replace(/\/$/, '');
      const url = `${base}/health`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (compatible; ClawLive/1.0)',
        'Bypass-Tunnel-Reminder': '1',
      };
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const res2 = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res2.ok) {
        return res.json({ success: true, message: '连接成功' });
      }
      const text = await res2.text();
      let errMsg = text || `HTTP ${res2.status}`;
      if (res2.status === 408) {
        errMsg = `HTTP 408（localtunnel 已知问题：隧道约 60s 后易超时）。建议改用 ngrok：本机执行 ngrok http 18789，复制输出的 https 地址填到 Gateway URL。`;
      }
      return res.status(400).json({
        success: false,
        error: errMsg,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('abort') || msg.includes('timeout');
      const errMsg = isTimeout
        ? '连接超时（云端到本机穿透较慢）。建议：① 换 ngrok 试 ② 确认 gateway 和 localtunnel 窗口都在运行'
        : msg;
      return res.status(400).json({ success: false, error: errMsg });
    }
  });

  /**
   * POST /api/agent-config/test-connection
   */
  router.post('/test-connection', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { botToken, chatId } = req.body;
      
      if (!botToken || !chatId) {
        return res.status(400).json({ error: 'Bot token and chat ID are required' });
      }
      
      console.log('🧪 Testing Telegram connection...');
      const result = await TelegramBridgeService.testConnection(botToken, chatId);
      
      if (result.success) {
        console.log('✅ Connection test successful');
        res.json({ success: true, message: 'Connection successful' });
      } else {
        console.log('❌ Connection test failed:', result.error);
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      res.status(500).json({ error: 'Failed to test connection' });
    }
  });
  
  /**
   * POST /api/agent-config/get-chat-id (NO DB)
   */
  router.post('/get-chat-id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { botToken } = req.body;
      
      if (!botToken) {
        return res.status(400).json({ error: 'Bot token is required' });
      }
      
      console.log('🔍 Auto-getting Chat ID...');
      const result = await TelegramBridgeService.getChatId(botToken);
      
      if (result.chatId) {
        console.log('✅ Chat ID found:', result.chatId);
        res.json({ success: true, chatId: result.chatId });
      } else {
        console.log('❌ Chat ID not found:', result.error);
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error('Error getting chat ID:', error);
      res.status(500).json({ error: 'Failed to get chat ID' });
    }
  });
  
  /**
   * POST /api/agent-config/:roomId/mtproto-start
   * 简化版：第一步 - 发送验证码到手机
   */
  router.post('/:roomId/mtproto-start', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;
      const { phoneNumber, chatId } = req.body;
      
      // Check room（支持 Redis 多实例）
      const room = await getRoom(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      if (room.hostId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
      }
      
      console.log(`📱 Starting MTProto login for room ${roomId}`);
      
      // Start login (send verification code)
      const result = await mtprotoService.startLogin(roomId, phoneNumber);
      
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      
      // Save phone and chatId to config (for later use)
      const existingConfig = agentConfigs.get(roomId);
      agentConfigs.set(roomId, {
        ...(existingConfig || {}),
        agentType: 'telegram-user',
        agentEnabled: existingConfig?.agentEnabled ?? false,
        agentStatus: existingConfig?.agentStatus || 'disconnected',
        agentBotToken: existingConfig?.agentBotToken,
        agentChatId: chatId || existingConfig?.agentChatId || '',
        mtprotoPhone: phoneNumber,
      } as Parameters<typeof agentConfigs.set>[1]);
      
      console.log(`✅ Verification code sent for room ${roomId}`);
      res.json({ success: true, needsCode: true, message: 'Verification code sent to your phone' });
      
    } catch (error) {
      console.error('Error starting MTProto login:', error);
      res.status(500).json({ error: 'Failed to start login' });
    }
  });

  /**
   * POST /api/agent-config/:roomId/mtproto-code
   * 简化版：第二步 - 提交验证码
   */
  router.post('/:roomId/mtproto-code', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;
      const { code } = req.body;
      
      // Check room（支持 Redis 多实例）
      const room = await getRoom(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      if (room.hostId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      if (!code) {
        return res.status(400).json({ error: 'Verification code is required' });
      }
      
      console.log(`📝 Submitting verification code for room ${roomId}`);
      
      // Submit code
      const result = await mtprotoService.submitCode(roomId, code);
      
      if (!result.success) {
        if (result.needsPassword) {
          // 需要两步验证密码
          return res.json({
            success: false,
            needsPassword: true,
            passwordHint: result.passwordHint,
            message: 'Two-factor authentication required'
          });
        }
        return res.status(400).json({ success: false, error: result.error });
      }
      
      // 登录成功，更新配置并持久化
      const existingConfig = agentConfigs.get(roomId) || {};
      const newConfig = {
        ...existingConfig,
        agentType: 'telegram-user' as any,
        agentEnabled: true,
        mtprotoSessionString: result.sessionString,
        agentStatus: 'connected',
      };
      agentConfigs.set(roomId, newConfig);
      RoomAgentConfigPersistence.saveConfig(roomId, {
        agentType: 'telegram-user',
        agentEnabled: true,
        agentChatId: (existingConfig as any).agentChatId || '',
        mtprotoSessionString: result.sessionString,
        mtprotoPhone: (existingConfig as any).mtprotoPhone,
      });
      
      console.log(`✅ MTProto login successful for room ${roomId}`);
      res.json({ success: true, message: 'Login successful' });
      
    } catch (error) {
      console.error('Error submitting code:', error);
      res.status(500).json({ error: 'Failed to submit code' });
    }
  });

  /**
   * POST /api/agent-config/:roomId/mtproto-password
   * 简化版：第三步（可选）- 提交两步验证密码
   */
  router.post('/:roomId/mtproto-password', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;
      const { password } = req.body;
      
      // Check room（支持 Redis 多实例）
      const room = await getRoom(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      if (room.hostId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      if (!password) {
        return res.status(400).json({ error: 'Password is required' });
      }
      
      console.log(`🔐 Submitting 2FA password for room ${roomId}`);
      
      // Submit password
      const result = await mtprotoService.submitPassword(roomId, password);
      
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      
      // 登录成功，更新配置并持久化
      const existingConfig = agentConfigs.get(roomId) || {};
      const newConfig = {
        ...existingConfig,
        agentType: 'telegram-user' as any,
        agentEnabled: true,
        mtprotoSessionString: result.sessionString,
        agentStatus: 'connected',
      };
      agentConfigs.set(roomId, newConfig);
      RoomAgentConfigPersistence.saveConfig(roomId, {
        agentType: 'telegram-user',
        agentEnabled: true,
        agentChatId: (existingConfig as any).agentChatId || '',
        mtprotoSessionString: result.sessionString,
        mtprotoPhone: (existingConfig as any).mtprotoPhone,
      });
      
      console.log(`✅ MTProto 2FA login successful for room ${roomId}`);
      res.json({ success: true, message: 'Login successful' });
      
    } catch (error) {
      console.error('Error submitting password:', error);
      res.status(500).json({ error: 'Failed to submit password' });
    }
  });

  /**
   * POST /api/agent-config/:roomId/clear
   * 仅断开当前 MTProto 会话，不清除持久化配置（Agent 链接信息永久保留，退出登录等任何情况都不删除）
   */
  router.post('/:roomId/clear', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;
      
      const room = await getRoom(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      if (room.hostId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      console.log(`🧹 Disconnecting agent session for room ${roomId} (config kept permanently)`);
      
      // 仅断开 MTProto 会话，不删除持久化
      const config = agentConfigs.get(roomId);
      if (config && config.agentType === 'telegram-user') {
        try {
          await mtprotoService.logout(roomId);
          console.log(`✅ MTProto session disconnected for room ${roomId}`);
        } catch (error) {
          console.error('Error disconnecting MTProto session:', error);
        }
      }
      
      // 仅清除内存，永久保留持久化配置（下次开播/访问时自动恢复）
      agentConfigs.delete(roomId);
      
    } catch (error) {
      console.error('Error clearing agent config:', error);
      res.status(500).json({ error: 'Failed to clear agent config' });
    }
  });
  
  return router;
}
