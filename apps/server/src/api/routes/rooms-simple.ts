import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { mtprotoService } from '../../services/telegram-mtproto';

// In-memory storage
const roomInfo = new Map<string, {
  id: string;
  hostId: string;
  title: string;
  lobsterName: string;
  isLive: boolean;
  startedAt?: Date;
  endedAt?: Date;
  viewerCount: number;
}>();

const agentConfigs = new Map<string, {
  agentType: string;
  agentEnabled: boolean;
  agentBotToken?: string;
  agentChatId?: string;
  agentStatus: string;
}>();

// Initialize test room
roomInfo.set('test', {
  id: 'test',
  hostId: 'a4393af5-f42f-4ac7-a9a3-23ca18aa9733',
  title: 'test',
  lobsterName: '龙虾',
  isLive: true,
  viewerCount: 0,
});

export { roomInfo, agentConfigs };

export function roomSimpleRoutes(io: Server): Router {
  const router = Router();

  // GET /api/rooms - List all rooms
  router.get('/', async (req: Request, res: Response) => {
    try {
      const rooms = Array.from(roomInfo.values()).map(room => ({
        id: room.id,
        title: room.title,
        lobsterName: room.lobsterName,
        hostUsername: 'test-host',
        viewerCount: room.viewerCount,
        isLive: room.isLive,
        startedAt: room.startedAt,
      }));

      res.json({
        rooms,
        pagination: {
          page: 1,
          limit: 20,
          total: rooms.length,
          pages: 1,
        },
      });
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).json({ error: 'Failed to fetch rooms' });
    }
  });

  router.get('/:roomId', async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const room = roomInfo.get(roomId);

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      res.json({
        ...room,
        host: {
          id: room.hostId,
          username: 'test-host',
          avatarUrl: null,
        },
        createdAt: new Date(),
      });
    } catch (error) {
      console.error('Error fetching room:', error);
      res.status(500).json({ error: 'Failed to fetch room' });
    }
  });

  router.post('/:roomId/start', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;

      const room = roomInfo.get(roomId);
      
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      if (room.hostId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      room.isLive = true;
      room.startedAt = new Date();
      roomInfo.set(roomId, room);

      io.to(roomId).emit('room-status-change', {
        isLive: true,
        startedAt: room.startedAt,
      });

      // Start Telegram bridge if agent is enabled
      const agentConfig = agentConfigs.get(roomId);
      if (agentConfig && agentConfig.agentEnabled && 
          agentConfig.agentType === 'telegram' &&
          agentConfig.agentBotToken &&
          agentConfig.agentChatId) {
        
        const { bridgeManager } = await import('../../services/telegram-bridge');
        const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-webhook-secret-change-in-production';
        
        bridgeManager.startBridge(
          roomId,
          agentConfig.agentBotToken,
          agentConfig.agentChatId,
          WEBHOOK_SECRET,
          io
        );
        
        agentConfig.agentStatus = 'connected';
        agentConfigs.set(roomId, agentConfig);
        
        console.log(`🤖 Telegram Agent bridge started for room ${roomId}`);
      }

      res.json(room);
    } catch (error) {
      console.error('Error starting room:', error);
      res.status(500).json({ error: 'Failed to start room' });
    }
  });

  router.post('/:roomId/stop', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;

      const room = roomInfo.get(roomId);

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      if (room.hostId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      room.isLive = false;
      room.endedAt = new Date();
      roomInfo.set(roomId, room);

      io.to(roomId).emit('room-status-change', {
        isLive: false,
        endedAt: room.endedAt,
      });

      // Stop Telegram bridge
      const { bridgeManager } = await import('../../services/telegram-bridge');
      bridgeManager.stopBridge(roomId);
      
      const agentConfig = agentConfigs.get(roomId);
      if (agentConfig) {
        agentConfig.agentStatus = 'disconnected';
        agentConfigs.set(roomId, agentConfig);
      }

      console.log(`🛑 Telegram Agent bridge stopped for room ${roomId}`);

      res.json(room);
    } catch (error) {
      console.error('Error stopping room:', error);
      res.status(500).json({ error: 'Failed to stop room' });
    }
  });

  router.post('/:roomId/message', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const { content } = req.body;
      const userId = req.user!.id;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Message content is required' });
      }

      const room = roomInfo.get(roomId);
      
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      if (room.hostId !== userId) {
        return res.status(403).json({ error: 'Only room host can send messages' });
      }

      if (!room.isLive) {
        return res.status(400).json({ error: 'Room is not live' });
      }

      const message = {
        id: Date.now().toString(),
        roomId,
        sender: 'user',
        content,
        timestamp: new Date(),
      };

      io.to(roomId).emit('new-message', message);

      // Forward to Telegram Agent if enabled
      const agentConfig = agentConfigs.get(roomId);
      if (agentConfig && agentConfig.agentEnabled) {
        if (agentConfig.agentType === 'telegram') {
          // Use Telegram Bot API
          const { bridgeManager } = await import('../../services/telegram-bridge');
          const bridge = bridgeManager.getBridge(roomId);
          if (bridge) {
            console.log(`📤 [Bot API] Forwarding to Telegram: "${content}"`);
            await bridge.sendToTelegram(content);
          } else {
            console.log('⚠️ Telegram bridge not active');
          }
        } else if (agentConfig.agentType === 'telegram-user') {
          // Use MTProto (User API)
          const chatId = agentConfig.agentChatId;
          if (!chatId) {
            console.log('⚠️ No Chat ID configured for MTProto');
          } else {
            console.log(`📤 [MTProto User] Sending to Telegram: "${content}"`);
            const result = await mtprotoService.sendAsUser(roomId, chatId, content);
            if (!result.success) {
              console.error('❌ MTProto send failed:', result.error);
            } else {
              console.log('✅ Message sent as user successfully');
            }
          }
        }
      }

      res.json({ message });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  return router;
}
