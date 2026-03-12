import { Router, Response } from 'express';
import { Server } from 'socket.io';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { TelegramBridgeService, bridgeManager } from '../../services/telegram-bridge';
import { agentConfigs, roomInfo } from './rooms';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-webhook-secret-change-in-production';

export function agentConfigRoutes(io: Server): Router {
  const router = Router();
  
  /**
   * GET /api/agent-config/:roomId
   * Get agent configuration for a room
   */
  router.get('/:roomId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;
      
      // Check room info from memory
      const room = roomInfo.get(roomId);
      
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      if (room.hostId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      // Get config from memory
      const config = agentConfigs.get(roomId) || {
        agentType: 'mock',
        agentEnabled: false,
        agentChatId: '',
        agentStatus: 'disconnected',
      };
      
      // Return config (without sensitive token)
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
   * PUT /api/agent-config/:roomId
   * Update agent configuration
   */
  router.put('/:roomId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;
      const { agentType, agentEnabled, agentBotToken, agentChatId } = req.body;
      
      // Check room info from memory
      const room = roomInfo.get(roomId);
      
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }
      
      if (room.hostId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      
      // Get existing config
      const existingConfig = agentConfigs.get(roomId) || {};
      
      // Update configuration in memory
      const newConfig = {
        agentType: agentType || existingConfig.agentType || 'mock',
        agentEnabled: agentEnabled !== undefined ? agentEnabled : existingConfig.agentEnabled || false,
        agentBotToken: agentBotToken || existingConfig.agentBotToken,
        agentChatId: agentChatId || existingConfig.agentChatId,
        agentStatus: 'disconnected',
      };
      
      agentConfigs.set(roomId, newConfig);
      
      // If telegram agent is enabled and room is live, start bridge
      if (newConfig.agentEnabled && 
          newConfig.agentType === 'telegram' && 
          room.isLive &&
          newConfig.agentBotToken &&
          newConfig.agentChatId) {
        
        bridgeManager.startBridge(
          roomId,
          newConfig.agentBotToken,
          newConfig.agentChatId,
          WEBHOOK_SECRET,
          io
        );
        
        // Update status
        newConfig.agentStatus = 'connected';
        agentConfigs.set(roomId, newConfig);
      } else {
        // Stop bridge if disabled
        bridgeManager.stopBridge(roomId);
        
        newConfig.agentStatus = 'disconnected';
        agentConfigs.set(roomId, newConfig);
      }
      
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
   * Test Telegram connection
   */
  router.post('/test-connection', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { botToken, chatId } = req.body;
      
      if (!botToken || !chatId) {
        return res.status(400).json({ error: 'Bot token and chat ID are required' });
      }
      
      const result = await TelegramBridgeService.testConnection(botToken, chatId);
      
      if (result.success) {
        res.json({ success: true, message: 'Connection successful' });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      res.status(500).json({ error: 'Failed to test connection' });
    }
  });
  
  /**
   * POST /api/agent-config/get-chat-id
   * Auto-get Chat ID from Bot Token
   */
  router.post('/get-chat-id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { botToken } = req.body;
      
      if (!botToken) {
        return res.status(400).json({ error: 'Bot token is required' });
      }
      
      const result = await TelegramBridgeService.getChatId(botToken);
      
      if (result.chatId) {
        res.json({ success: true, chatId: result.chatId });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      console.error('Error getting chat ID:', error);
      res.status(500).json({ error: 'Failed to get chat ID' });
    }
  });
  
  return router;
}
