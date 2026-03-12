import { Router, Response } from 'express';
import { Server } from 'socket.io';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { TelegramBridgeService, bridgeManager } from '../../services/telegram-bridge';
import { mtprotoService } from '../../services/telegram-mtproto';
import { roomInfo, agentConfigs } from './rooms-simple';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-webhook-secret-change-in-production';

export function agentConfigSimpleRoutes(io: Server): Router {
  const router = Router();
  
  /**
   * GET /api/agent-config/:roomId (NO DB, NO AUTH)
   */
  router.get('/:roomId', async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      
      console.log(`📥 GET agent-config for room: ${roomId}`);
      
      // Get config from memory (no auth check for simplicity)
      const config = agentConfigs.get(roomId) || {
        agentType: 'mock',
        agentEnabled: false,
        agentChatId: '',
        agentStatus: 'disconnected',
      };
      
      res.json({
        agentType: config.agentType,
        agentEnabled: config.agentEnabled,
        agentChatId: config.agentChatId || '',
        agentStatus: config.agentStatus,
        hasBotToken: !!config.agentBotToken,
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
      const { agentType, agentEnabled, agentBotToken, agentChatId } = req.body;
      
      // Check room from memory
      const room = roomInfo.get(roomId);
      
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      // Allow host to update
      if (room.hostId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      // Get existing config
      const existingConfig = agentConfigs.get(roomId) || {};
      
      // Update configuration in memory (preserve MTProto fields)
      const newConfig = {
        agentType: agentType || existingConfig.agentType || 'mock',
        agentEnabled: agentEnabled !== undefined ? agentEnabled : existingConfig.agentEnabled || false,
        agentBotToken: agentBotToken || existingConfig.agentBotToken,
        agentChatId: agentChatId || existingConfig.agentChatId,
        agentStatus: existingConfig.agentStatus || 'disconnected',
        // Preserve MTProto session fields
        mtprotoSessionString: (existingConfig as any).mtprotoSessionString,
        mtprotoPhone: (existingConfig as any).mtprotoPhone,
      };
      
      agentConfigs.set(roomId, newConfig);
      
      console.log(`✅ Agent config saved for room ${roomId}:`, {
        type: newConfig.agentType,
        enabled: newConfig.agentEnabled,
        hasToken: !!newConfig.agentBotToken,
        hasChatId: !!newConfig.agentChatId,
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
      
      // Check room from memory
      const room = roomInfo.get(roomId);
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
      const existingConfig = agentConfigs.get(roomId) || {};
      const newConfig = {
        ...existingConfig,
        agentType: 'telegram-user' as any,
        mtprotoPhone: phoneNumber,
        agentChatId: chatId || existingConfig.agentChatId,
      };
      agentConfigs.set(roomId, newConfig);
      
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
      
      // Check room from memory
      const room = roomInfo.get(roomId);
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
      
      // 登录成功，更新配置
      const existingConfig = agentConfigs.get(roomId) || {};
      const newConfig = {
        ...existingConfig,
        agentType: 'telegram-user' as any,
        agentEnabled: true,
        mtprotoSessionString: result.sessionString,
        agentStatus: 'connected',
      };
      agentConfigs.set(roomId, newConfig);
      
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
      
      // Check room from memory
      const room = roomInfo.get(roomId);
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
      
      // 登录成功，更新配置
      const existingConfig = agentConfigs.get(roomId) || {};
      const newConfig = {
        ...existingConfig,
        agentType: 'telegram-user' as any,
        agentEnabled: true,
        mtprotoSessionString: result.sessionString,
        agentStatus: 'connected',
      };
      agentConfigs.set(roomId, newConfig);
      
      console.log(`✅ MTProto 2FA login successful for room ${roomId}`);
      res.json({ success: true, message: 'Login successful' });
      
    } catch (error) {
      console.error('Error submitting password:', error);
      res.status(500).json({ error: 'Failed to submit password' });
    }
  });
  
  return router;
}
