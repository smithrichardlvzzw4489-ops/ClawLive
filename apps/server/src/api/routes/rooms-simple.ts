import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { mtprotoService } from '../../services/telegram-mtproto';
import { RoomAgentConfigPersistence } from '../../services/room-agent-config-persistence';
import { WorksPersistence } from '../../services/works-persistence';
import { prisma } from '../../lib/prisma';
import {
  getRoom,
  setRoom,
  hasRoom,
  getAllRooms,
  getMessageHistory,
  appendMessage,
  setMessageHistory,
  getMemoryRoomsMap,
  getMemoryMessagesMap,
} from '../../lib/rooms-store';

// 兼容旧代码：导出 store 的 memory（仅单实例时正确，多实例请用 getRoom/getMessageHistory）
const roomInfo = getMemoryRoomsMap();
const messageHistory = getMemoryMessagesMap();

const agentConfigs = new Map<string, {
  agentType: string;
  agentEnabled: boolean;
  agentBotToken?: string;
  agentChatId?: string;
  agentStatus: string;
}>();

// History sessions storage - 保存完整的直播历史
const liveHistory = new Map<string, {
  id: string;
  roomId: string;
  hostId: string;
  title: string;
  lobsterName: string;
  description?: string;
  startedAt: Date;
  endedAt: Date;
  messages: Array<{
    id: string;
    sender: 'host' | 'agent';
    content: string;
    timestamp: Date;
  }>;
  viewerCount: number;
}>();

// User profiles storage (主播信息)
const userProfiles = new Map<string, {
  id: string;
  username: string;
  bio?: string;
  avatarUrl?: string;
}>();

// Works storage - 作品存储
const works = new Map<string, {
  id: string;
  authorId: string;
  title: string;
  description?: string;
  lobsterName: string;
  status: 'draft' | 'published';
  messages: Array<{
    id: string;
    sender: 'user' | 'agent';
    content: string;
    videoUrl?: string;
    timestamp: Date;
  }>;
  tags?: string[];
  coverImage?: string;
  videoUrl?: string;
  viewCount: number;
  likeCount: number;
  createdAt: Date;
  publishedAt?: Date;
  updatedAt: Date;
}>();

// Work messages during editing
const workMessages = new Map<string, Array<{
  id: string;
  workId: string;
  sender: 'user' | 'agent';
  content: string;
  videoUrl?: string;
  timestamp: Date;
}>>();

// 从持久化加载作品（配置 Volume 后重启不丢失）
const loaded = WorksPersistence.loadAll();
loaded.works.forEach((w, k) => works.set(k, w));
loaded.workMessages.forEach((msgs, workId) => {
  workMessages.set(workId, msgs.map((m) => ({ ...m, workId })));
});

// 校验 hostId 是否为有效的 UUID（避免触发 Prisma 引擎 panic）
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function isValidHostId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && UUID_REGEX.test(id);
}

// 获取主播信息：优先内存，否则从数据库拉取并缓存
async function getHostInfo(hostId: string): Promise<{ id: string; username: string; avatarUrl?: string | null }> {
  if (!isValidHostId(hostId)) {
    return { id: hostId, username: 'Unknown', avatarUrl: null };
  }
  let host = userProfiles.get(hostId);
  if (host) return { id: host.id, username: host.username, avatarUrl: host.avatarUrl };
  try {
    const user = await prisma.user.findUnique({ where: { id: hostId }, select: { id: true, username: true, avatarUrl: true } });
    if (user) {
      const profile = { id: user.id, username: user.username, avatarUrl: user.avatarUrl ?? undefined };
      userProfiles.set(hostId, { ...profile, bio: undefined });
      return profile;
    }
  } catch (e) {
    console.warn('[getHostInfo] Prisma lookup failed:', e);
  }
  return { id: hostId, username: 'Unknown', avatarUrl: null };
}

// 批量获取主播信息（单次 findMany，避免并行 findUnique 触发 Prisma 引擎 panic）
async function getHostInfoBatch(hostIds: string[]): Promise<Map<string, { id: string; username: string; avatarUrl?: string | null }>> {
  const result = new Map<string, { id: string; username: string; avatarUrl?: string | null }>();
  const toFetch = hostIds.filter((id) => isValidHostId(id));
  const fromCache = toFetch.filter((id) => userProfiles.has(id));
  for (const id of fromCache) {
    const h = userProfiles.get(id)!;
    result.set(id, { id: h.id, username: h.username, avatarUrl: h.avatarUrl });
  }
  const needDb = toFetch.filter((id) => !userProfiles.has(id));
  if (needDb.length === 0) {
    for (const id of hostIds) {
      if (!result.has(id)) result.set(id, { id, username: 'Unknown', avatarUrl: null });
    }
    return result;
  }
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: needDb } },
      select: { id: true, username: true, avatarUrl: true },
    });
    for (const u of users) {
      const profile = { id: u.id, username: u.username, avatarUrl: u.avatarUrl ?? undefined };
      userProfiles.set(u.id, { ...profile, bio: undefined });
      result.set(u.id, { ...profile, avatarUrl: u.avatarUrl ?? null });
    }
  } catch (e) {
    console.warn('[getHostInfoBatch] Prisma lookup failed:', e);
  }
  for (const id of hostIds) {
    if (!result.has(id)) {
      result.set(id, { id, username: 'Unknown', avatarUrl: null });
    }
  }
  return result;
}

// Initialize test user profile
userProfiles.set('a4393af5-f42f-4ac7-a9a3-23ca18aa9733', {
  id: 'a4393af5-f42f-4ac7-a9a3-23ca18aa9733',
  username: 'test-host',
  bio: '这是一个测试主播账号',
  avatarUrl: undefined,
});

// Initialize test room（异步初始化，不阻塞）
setRoom('test', {
  id: 'test',
  hostId: 'a4393af5-f42f-4ac7-a9a3-23ca18aa9733',
  title: 'test',
  lobsterName: '龙虾',
  description: '测试房间',
  isLive: false,
  viewerCount: 0,
  createdAt: new Date(),
}).catch(() => {});

// Initialize sample history sessions for testing
const now = new Date();
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

liveHistory.set('test-history-1', {
  id: 'test-history-1',
  roomId: 'test',
  hostId: 'a4393af5-f42f-4ac7-a9a3-23ca18aa9733',
  title: '测试直播 - 与龙虾的对话',
  lobsterName: '龙虾',
  description: '这是第一场测试直播',
  startedAt: new Date(oneHourAgo.getTime() - 30 * 60 * 1000),
  endedAt: oneHourAgo,
  messages: [
    {
      id: '1',
      sender: 'host' as const,
      content: '你好，龙虾！',
      timestamp: new Date(oneHourAgo.getTime() - 28 * 60 * 1000),
    },
    {
      id: '2',
      sender: 'agent' as const,
      content: '你好！我是你的 AI 助手龙虾，很高兴见到你！',
      timestamp: new Date(oneHourAgo.getTime() - 27 * 60 * 1000),
    },
    {
      id: '3',
      sender: 'host' as const,
      content: '今天天气怎么样？',
      timestamp: new Date(oneHourAgo.getTime() - 25 * 60 * 1000),
    },
    {
      id: '4',
      sender: 'agent' as const,
      content: '今天天气不错！适合出门走走。你有什么计划吗？',
      timestamp: new Date(oneHourAgo.getTime() - 24 * 60 * 1000),
    },
  ],
  viewerCount: 5,
});

liveHistory.set('test-history-2', {
  id: 'test-history-2',
  roomId: 'test',
  hostId: 'a4393af5-f42f-4ac7-a9a3-23ca18aa9733',
  title: '龙虾工作室 - 编程讨论',
  lobsterName: '龙虾',
  description: 'JavaScript 和 TypeScript 技术分享',
  startedAt: new Date(twoDaysAgo.getTime() + 10 * 60 * 60 * 1000),
  endedAt: new Date(twoDaysAgo.getTime() + 11 * 60 * 60 * 1000),
  messages: [
    {
      id: '5',
      sender: 'host' as const,
      content: '今天我们来聊聊 TypeScript',
      timestamp: new Date(twoDaysAgo.getTime() + 10 * 60 * 60 * 1000),
    },
    {
      id: '6',
      sender: 'agent' as const,
      content: 'TypeScript 是一个很棒的语言！它为 JavaScript 添加了类型系统。',
      timestamp: new Date(twoDaysAgo.getTime() + 10 * 60 * 60 * 1000 + 2 * 60 * 1000),
    },
    {
      id: '7',
      sender: 'host' as const,
      content: '你觉得什么时候应该使用 any 类型？',
      timestamp: new Date(twoDaysAgo.getTime() + 10 * 60 * 60 * 1000 + 10 * 60 * 1000),
    },
    {
      id: '8',
      sender: 'agent' as const,
      content: '尽量避免使用 any！可以用 unknown 或者具体的类型。any 会失去类型检查的好处。',
      timestamp: new Date(twoDaysAgo.getTime() + 10 * 60 * 60 * 1000 + 11 * 60 * 1000),
    },
    {
      id: '9',
      sender: 'host' as const,
      content: '说得对！类型安全很重要。',
      timestamp: new Date(twoDaysAgo.getTime() + 10 * 60 * 60 * 1000 + 20 * 60 * 1000),
    },
  ],
  viewerCount: 12,
});

liveHistory.set('test-history-3', {
  id: 'test-history-3',
  roomId: 'test',
  hostId: 'a4393af5-f42f-4ac7-a9a3-23ca18aa9733',
  title: '夜间闲聊',
  lobsterName: '龙虾',
  description: '随便聊聊天',
  startedAt: new Date(threeDaysAgo.getTime() + 20 * 60 * 60 * 1000),
  endedAt: new Date(threeDaysAgo.getTime() + 21 * 60 * 60 * 1000 + 30 * 60 * 1000),
  messages: [
    {
      id: '10',
      sender: 'host' as const,
      content: '晚上好！',
      timestamp: new Date(threeDaysAgo.getTime() + 20 * 60 * 60 * 1000),
    },
    {
      id: '11',
      sender: 'agent' as const,
      content: '晚上好！今天过得怎么样？',
      timestamp: new Date(threeDaysAgo.getTime() + 20 * 60 * 60 * 1000 + 1 * 60 * 1000),
    },
  ],
  viewerCount: 3,
});

// 无持久化数据时使用示例作品
if (works.size === 0) {
  works.set('work-sample-1', {
  id: 'work-sample-1',
  authorId: 'a4393af5-f42f-4ac7-a9a3-23ca18aa9733',
  title: '如何使用 AI 提升编程效率',
  description: '与 AI Agent 深入探讨如何在日常开发中更好地利用 AI 工具',
  lobsterName: '龙虾',
  status: 'published',
  messages: [
    {
      id: '1',
      sender: 'user' as const,
      content: '我想了解如何用 AI 提升编程效率',
      timestamp: new Date(twoDaysAgo.getTime()),
    },
    {
      id: '2',
      sender: 'agent' as const,
      content: 'AI 可以在很多方面帮助你：代码补全、bug 修复、代码审查、文档生成等。让我们逐一探讨。',
      timestamp: new Date(twoDaysAgo.getTime() + 1 * 60 * 1000),
    },
    {
      id: '3',
      sender: 'user' as const,
      content: '代码补全方面有什么推荐吗？',
      timestamp: new Date(twoDaysAgo.getTime() + 5 * 60 * 1000),
    },
    {
      id: '4',
      sender: 'agent' as const,
      content: 'GitHub Copilot 和 Cursor 都很优秀。它们能根据上下文预测你要写的代码，节省大量时间。',
      timestamp: new Date(twoDaysAgo.getTime() + 6 * 60 * 1000),
    },
  ],
  tags: ['编程', 'AI', '效率'],
  coverImage: undefined,
  viewCount: 45,
  likeCount: 12,
  createdAt: new Date(twoDaysAgo.getTime()),
  publishedAt: new Date(twoDaysAgo.getTime() + 30 * 60 * 1000),
  updatedAt: new Date(twoDaysAgo.getTime() + 30 * 60 * 1000),
  });

  works.set('work-sample-2', {
  id: 'work-sample-2',
  authorId: 'a4393af5-f42f-4ac7-a9a3-23ca18aa9733',
  title: 'AI 时代的学习方法',
  description: '探讨在 AI 时代如何更有效地学习新知识',
  lobsterName: '龙虾',
  status: 'published',
  messages: [
    {
      id: '5',
      sender: 'user' as const,
      content: 'AI 这么强大，我们还需要深入学习吗？',
      timestamp: new Date(threeDaysAgo.getTime()),
    },
    {
      id: '6',
      sender: 'agent' as const,
      content: '当然需要！AI 是工具，理解基础原理才能更好地使用它。就像有了计算器，数学思维依然重要。',
      timestamp: new Date(threeDaysAgo.getTime() + 2 * 60 * 1000),
    },
    {
      id: '7',
      sender: 'user' as const,
      content: '那应该怎么学习？',
      timestamp: new Date(threeDaysAgo.getTime() + 8 * 60 * 1000),
    },
    {
      id: '8',
      sender: 'agent' as const,
      content: '建议：1) 理解核心概念 2) 使用 AI 快速实践 3) 深入研究感兴趣的方向。AI 能帮你快速验证想法。',
      timestamp: new Date(threeDaysAgo.getTime() + 9 * 60 * 1000),
    },
  ],
  tags: ['学习', 'AI', '方法论'],
  coverImage: undefined,
  viewCount: 78,
  likeCount: 23,
  createdAt: new Date(threeDaysAgo.getTime()),
  publishedAt: new Date(threeDaysAgo.getTime() + 20 * 60 * 1000),
  updatedAt: new Date(threeDaysAgo.getTime() + 20 * 60 * 1000),
  });
}

export { roomInfo, agentConfigs, messageHistory, liveHistory, userProfiles, works, workMessages, getHostInfo };

export function roomSimpleRoutes(io: Server): Router {
  const router = Router();

  // GET /api/rooms - List all rooms（支持 Redis 多实例）
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { isLive } = req.query;
      
      const roomList = await getAllRooms();
      const hostIds = roomList.map((r) => r.hostId);
      const hostMap = await getHostInfoBatch(hostIds);
      const rooms = roomList.map((room) => {
        const host = hostMap.get(room.hostId) ?? { id: room.hostId, username: 'Unknown', avatarUrl: null };
        return {
          id: room.id,
          title: room.title,
          lobsterName: room.lobsterName,
          description: room.description,
          viewerCount: room.viewerCount,
          isLive: room.isLive,
          startedAt: room.startedAt,
          host: { id: host.id, username: host.username, avatarUrl: host.avatarUrl ?? null },
        };
      });

      let filtered = rooms;
      if (isLive === 'true') {
        filtered = rooms.filter(room => room.isLive);
      }

      res.json({
        rooms: filtered,
        pagination: {
          page: 1,
          limit: 20,
          total: filtered.length,
          pages: 1,
        },
      });
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).json({ error: 'Failed to fetch rooms' });
    }
  });

  // 必须在 GET /:roomId 之前定义，否则 /history/xxx、/host/xxx 会被误匹配为 roomId
  router.get('/history/:historyId', async (req: Request, res: Response) => {
    try {
      const { historyId } = req.params;
      const history = liveHistory.get(historyId);

      if (!history) {
        return res.status(404).json({ error: 'History not found' });
      }

      const host = userProfiles.get(history.hostId);

      res.json({
        ...history,
        host: host ? {
          id: host.id,
          username: host.username,
          avatarUrl: host.avatarUrl,
        } : {
          id: history.hostId,
          username: 'Unknown',
          avatarUrl: null,
        },
      });
    } catch (error) {
      console.error('Error fetching history:', error);
      res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  router.get('/host/:hostId', async (req: Request, res: Response) => {
    try {
      const { hostId } = req.params;

      const host = await getHostInfo(hostId);

      const allRooms = await getAllRooms();
      const liveRooms = allRooms
        .filter(room => room.hostId === hostId && room.isLive)
        .map(room => ({
          id: room.id,
          title: room.title,
          lobsterName: room.lobsterName,
          description: room.description,
          isLive: true,
          startedAt: room.startedAt,
          viewerCount: room.viewerCount,
        }));

      const historySessions = Array.from(liveHistory.values())
        .filter(history => history.hostId === hostId)
        .sort((a, b) => b.endedAt.getTime() - a.endedAt.getTime())
        .map(history => ({
          id: history.id,
          roomId: history.roomId,
          title: history.title,
          lobsterName: history.lobsterName,
          description: history.description,
          isLive: false,
          startedAt: history.startedAt,
          endedAt: history.endedAt,
          viewerCount: history.viewerCount,
          messageCount: history.messages.length,
        }));

      res.json({
        host: {
          id: host.id,
          username: host.username,
          bio: userProfiles.get(hostId)?.bio,
          avatarUrl: host.avatarUrl,
        },
        liveRooms,
        historySessions,
        stats: {
          totalSessions: historySessions.length,
          totalMessages: historySessions.reduce((sum, s) => sum + s.messageCount, 0),
        },
      });
    } catch (error) {
      console.error('Error fetching host rooms:', error);
      res.status(500).json({ error: 'Failed to fetch host rooms' });
    }
  });

  router.get('/user/profile/:userId', async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const user = userProfiles.get(userId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  });

  router.put('/user/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { username, bio, avatarUrl } = req.body;

      let profile = userProfiles.get(userId);

      if (!profile) {
        profile = {
          id: userId,
          username: username || `user-${userId.slice(0, 8)}`,
          bio: bio || '',
          avatarUrl: avatarUrl || null,
        };
      } else {
        if (username) profile.username = username;
        if (bio !== undefined) profile.bio = bio;
        if (avatarUrl !== undefined) profile.avatarUrl = avatarUrl;
      }

      userProfiles.set(userId, profile);
      res.json(profile);
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  });

  // GET /api/rooms/:roomId - 必须在 /history、/host、/user/profile 之后
  router.get('/:roomId', async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const room = await getRoom(roomId);

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      const host = await getHostInfo(room.hostId);

      res.json({
        ...room,
        host: { id: host.id, username: host.username, avatarUrl: host.avatarUrl ?? null },
      });
    } catch (error) {
      console.error('Error fetching room:', error);
      res.status(500).json({ error: 'Failed to fetch room' });
    }
  });

  // POST /api/rooms - Create new room
  router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { id, title, description, lobsterName } = req.body;
      const userId = req.user!.id;

      if (!id || !title || !lobsterName) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Check if room ID already exists
      if (await hasRoom(id)) {
        return res.status(409).json({ error: 'Room ID already exists' });
      }

      const newRoom = {
        id,
        hostId: userId,
        title,
        lobsterName,
        description,
        isLive: false,
        viewerCount: 0,
        createdAt: new Date(),
      };

      await setRoom(id, newRoom);
      console.log(`✅ Room created: ${id} by user ${userId}`);

      res.status(201).json({
        ...newRoom,
        host: {
          id: userId,
          username: 'test-host',
          avatarUrl: null,
        },
        createdAt: new Date(),
      });
    } catch (error) {
      console.error('Error creating room:', error);
      res.status(500).json({ error: 'Failed to create room' });
    }
  });

  router.post('/:roomId/start', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;
      const { liveMode = 'video' } = req.body || {};

      const room = await getRoom(roomId);
      
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      if (room.hostId !== userId) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const updated = {
        ...room,
        isLive: true,
        liveMode: (liveMode === 'audio' ? 'audio' : 'video') as 'video' | 'audio',
        startedAt: new Date(),
      };
      await setRoom(roomId, updated);

      const host = await getHostInfo(room.hostId);
      const roomData = {
        ...updated,
        host: { id: host.id, username: host.username, avatarUrl: host.avatarUrl ?? null },
      };
      io.to(roomId).emit('room-status-change', {
        isLive: true,
        liveMode: updated.liveMode,
        startedAt: updated.startedAt,
      });
      io.to(roomId).emit('room-info', roomData);

      // 内存无配置时，尝试从持久化恢复（服务重启后自动恢复连接）
      let agentConfig = agentConfigs.get(roomId);
      if (!agentConfig) {
        const restored = await RoomAgentConfigPersistence.restoreToMemory(roomId, agentConfigs);
        if (restored) {
          agentConfig = agentConfigs.get(roomId);
          console.log(`✅ [RoomAgent] Restored config for room ${roomId} before start`);
        }
      }

      // Start Telegram bridge if agent is enabled
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

      res.json(updated);
    } catch (error) {
      console.error('Error starting room:', error);
      res.status(500).json({ error: 'Failed to start room' });
    }
  });

  router.post('/:roomId/stop', authenticateToken, async (req: AuthRequest, res: Response) => {
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

      const endedAt = new Date();
      const updated = { ...room, isLive: false, endedAt, liveMode: undefined as undefined };
      await setRoom(roomId, updated);

      io.to(roomId).emit('room-status-change', {
        isLive: false,
        liveMode: undefined,
        endedAt: updated.endedAt,
      });

      // Save to history before clearing
      if (room.startedAt) {
        const messages = await getMessageHistory(roomId);
        const historyId = `${roomId}-${Date.now()}`;
        
        liveHistory.set(historyId, {
          id: historyId,
          roomId: room.id,
          hostId: room.hostId,
          title: room.title,
          lobsterName: room.lobsterName,
          description: room.description,
          startedAt: room.startedAt,
          endedAt: endedAt,
          messages: messages.map(msg => ({
            id: msg.id,
            sender: msg.sender,
            content: msg.content,
            timestamp: msg.timestamp,
          })),
          viewerCount: updated.viewerCount,
        });
        
        console.log(`📚 Live session saved to history: ${historyId} (${messages.length} messages)`);
      }

      // Clear current message history
      await setMessageHistory(roomId, []);

      // Stop Telegram bridge
      const { bridgeManager } = await import('../../services/telegram-bridge');
      bridgeManager.stopBridge(roomId);
      
      const agentConfig = agentConfigs.get(roomId);
      if (agentConfig) {
        agentConfig.agentStatus = 'disconnected';
        agentConfigs.set(roomId, agentConfig);
      }

      console.log(`🧹 Current message history cleared for room ${roomId}`);
      console.log(`🛑 Telegram Agent bridge stopped for room ${roomId}`);

      res.json(updated);
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

      const room = await getRoom(roomId);
      
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
        sender: 'host' as const,
        content,
        timestamp: new Date(),
      };

      await appendMessage(roomId, message);

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
