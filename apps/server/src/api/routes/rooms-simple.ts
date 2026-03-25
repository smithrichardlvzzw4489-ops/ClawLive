import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { mtprotoService } from '../../services/telegram-mtproto';
import { RoomAgentConfigPersistence } from '../../services/room-agent-config-persistence';
import { WorksPersistence } from '../../services/works-persistence';
import { SkillsPersistence } from '../../services/skills-persistence';
import { getFollowerCount } from '../../services/user-follows';
import { CommunityPersistence } from '../../services/community-persistence';
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
import { getFeedPostsMap } from '../../services/feed-posts-store';

/** 与 web excerptPlainText 对齐的摘要，用于主播页作品卡片（含发作品图文） */
function excerptForHostCard(content: string, maxLen: number): string {
  const t = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/[*_~]{1,2}([^*_~]+)[*_~]{1,2}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

function publishedTimeMs(publishedAt: Date | string | undefined): number {
  if (!publishedAt) return 0;
  return publishedAt instanceof Date ? publishedAt.getTime() : new Date(publishedAt).getTime();
}

// 兼容旧代码：导出 store 的 memory（仅单实例时正确，多实例请用 getRoom/getMessageHistory）
const roomInfo = getMemoryRoomsMap();
const messageHistory = getMemoryMessagesMap();

const agentConfigs = new Map<string, {
  agentType: string;
  agentEnabled: boolean;
  agentBotToken?: string;
  agentChatId?: string;
  agentStatus: string;
  mtprotoSessionString?: string;
  mtprotoPhone?: string;
  openclawGatewayUrl?: string;
  openclawToken?: string;
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
  resultSummary?: string;
  skillMarkdown?: string;
  partition?: string;
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

type HostInfoPublic = { id: string; username: string; avatarUrl?: string | null; bio?: string | null };

// 获取主播信息：以数据库为准，避免内存缓存与 Prisma 不一致；bio 合并 DB 与旧内存
async function getHostInfo(hostId: string): Promise<HostInfoPublic> {
  if (!isValidHostId(hostId)) {
    return { id: hostId, username: 'Unknown', avatarUrl: null, bio: null };
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: hostId },
      select: { id: true, username: true, avatarUrl: true, bio: true },
    });
    if (user) {
      const existing = userProfiles.get(hostId);
      const bio = user.bio ?? existing?.bio ?? undefined;
      const profile = {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl ?? undefined,
        bio,
      };
      userProfiles.set(hostId, profile);
      return {
        id: profile.id,
        username: profile.username,
        avatarUrl: profile.avatarUrl ?? null,
        bio: profile.bio ?? null,
      };
    }
  } catch (e) {
    console.warn('[getHostInfo] Prisma lookup failed:', e);
  }
  const host = userProfiles.get(hostId);
  if (host) {
    return { id: host.id, username: host.username, avatarUrl: host.avatarUrl ?? null, bio: host.bio ?? null };
  }
  return { id: hostId, username: 'Unknown', avatarUrl: null, bio: null };
}

// 批量获取主播信息（单次 findMany，避免并行 findUnique 触发 Prisma 引擎 panic）；以 DB 为准刷新缓存
async function getHostInfoBatch(hostIds: string[]): Promise<Map<string, { id: string; username: string; avatarUrl?: string | null }>> {
  const result = new Map<string, { id: string; username: string; avatarUrl?: string | null }>();
  const toFetch = [...new Set(hostIds.filter((id) => isValidHostId(id)))];
  if (toFetch.length === 0) {
    for (const id of hostIds) {
      if (!result.has(id)) result.set(id, { id, username: 'Unknown', avatarUrl: null });
    }
    return result;
  }
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: toFetch } },
      select: { id: true, username: true, avatarUrl: true, bio: true },
    });
    for (const u of users) {
      const existing = userProfiles.get(u.id);
      const bio = u.bio ?? existing?.bio ?? undefined;
      const profile = {
        id: u.id,
        username: u.username,
        avatarUrl: u.avatarUrl ?? undefined,
        bio,
      };
      userProfiles.set(u.id, profile);
      result.set(u.id, { id: profile.id, username: profile.username, avatarUrl: profile.avatarUrl ?? null });
    }
  } catch (e) {
    console.warn('[getHostInfoBatch] Prisma lookup failed:', e);
  }
  for (const id of hostIds) {
    if (!result.has(id)) {
      const h = userProfiles.get(id);
      if (h) {
        result.set(id, { id: h.id, username: h.username, avatarUrl: h.avatarUrl ?? null });
      } else {
        result.set(id, { id, username: 'Unknown', avatarUrl: null });
      }
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

// 移除旧的示例作品（如有持久化残留则启动时清理）
let removedSamples = false;
['work-sample-1', 'work-sample-2'].forEach((id) => {
  if (works.has(id)) {
    works.delete(id);
    workMessages.delete(id);
    removedSamples = true;
  }
});
if (removedSamples) {
  WorksPersistence.saveAll(works, workMessages);
}

export { roomInfo, agentConfigs, messageHistory, liveHistory, userProfiles, works, workMessages, getHostInfo, getHostInfoBatch };

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
      if (process.env.DIAG_LIVE === '1') {
        console.log(`[DIAG] GET /api/rooms isLive=${isLive} total=${rooms.length} filtered=${filtered.length} ids=${filtered.map((r) => r.id).join(',')}`);
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

      const publishedClassicWorks = Array.from(works.values()).filter(
        w => w.authorId === hostId && w.status === 'published'
      );
      const classicAsHostWorks = publishedClassicWorks.map(w => ({
        id: w.id,
        kind: 'work' as const,
        title: w.title,
        resultSummary: w.resultSummary,
        partition: w.partition,
        coverImage: w.coverImage,
        videoUrl: w.videoUrl,
        viewCount: w.viewCount,
        likeCount: w.likeCount,
        publishedAt: w.publishedAt,
      }));

      const feedPostsForHost = Array.from(getFeedPostsMap().values()).filter((p) => p.authorId === hostId);
      const feedAsHostWorks = feedPostsForHost.map((p) => ({
        id: p.id,
        kind: 'feedPost' as const,
        title: p.title,
        resultSummary: excerptForHostCard(p.content, 120),
        partition: undefined as string | undefined,
        coverImage: p.imageUrls?.[0],
        videoUrl: undefined as string | undefined,
        viewCount: p.viewCount,
        likeCount: p.likeCount ?? 0,
        publishedAt: new Date(p.createdAt),
      }));

      const hostWorks = [...classicAsHostWorks, ...feedAsHostWorks]
        .sort((a, b) => publishedTimeMs(b.publishedAt) - publishedTimeMs(a.publishedAt))
        .slice(0, 12);

      const skillsMap = SkillsPersistence.loadAll();
      const hostSkills = Array.from(skillsMap.values())
        .filter(s => s.authorId === hostId)
        .sort((a, b) => (b.viewCount + b.useCount * 2) - (a.viewCount + a.useCount * 2))
        .slice(0, 8)
        .map(s => ({
          id: s.id,
          title: s.title,
          description: s.description,
          viewCount: s.viewCount,
          useCount: s.useCount,
          sourceWorkId: s.sourceWorkId,
        }));

      // 粉丝数、社区数据（回答、经验/复盘）
      const followerCount = getFollowerCount(hostId);
      const allPosts = CommunityPersistence.loadPosts();
      const allCommentsMap = CommunityPersistence.loadComments();
      let answerCount = 0;
      const creatorComments: Array<{ postId: string; postTitle?: string; id: string; content: string; likeCount: number; createdAt: Date }> = [];
      for (const [, arr] of allCommentsMap) {
        for (const c of arr) {
          if (c.authorId === hostId) {
            answerCount++;
            const post = allPosts.get(c.postId);
            creatorComments.push({
              postId: c.postId,
              postTitle: post?.title,
              id: c.id,
              content: c.content,
              likeCount: c.likeCount,
              createdAt: c.createdAt,
            });
          }
        }
      }
      creatorComments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const creatorPosts = Array.from(allPosts.values())
        .filter(p => p.authorId === hostId && (p.type === 'experience' || p.type === 'retrospective'))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20)
        .map(p => ({
          id: p.id,
          type: p.type,
          title: p.title,
          content: p.content,
          tags: p.tags,
          likeCount: p.likeCount,
          commentCount: p.commentCount,
          viewCount: p.viewCount,
          createdAt: p.createdAt,
        }));

      const bio = host.bio ?? userProfiles.get(hostId)?.bio;
      const tagline = bio ? (bio.includes('\n') ? bio.split('\n')[0].trim() : bio.trim()).slice(0, 80) : undefined;
      const tagsSet = new Set<string>();
      for (const w of hostWorks) {
        if (w.partition && w.partition.trim()) tagsSet.add(w.partition.trim());
      }
      const tags = Array.from(tagsSet).slice(0, 8);

      const historyRoomIds = new Set(historySessions.map((h) => h.roomId));
      let extraLiveSessionsFromRooms = 0;
      for (const r of allRooms) {
        if (r.hostId !== hostId) continue;
        if (historyRoomIds.has(r.id)) continue;
        if (r.startedAt || r.isLive) extraLiveSessionsFromRooms++;
      }
      const totalSessions = historySessions.length + extraLiveSessionsFromRooms;

      const publishedWorksCount = publishedClassicWorks.length;
      const workCount = publishedWorksCount + feedPostsForHost.length;

      res.json({
        host: {
          id: host.id,
          username: host.username,
          bio,
          tagline,
          tags,
          avatarUrl: host.avatarUrl,
        },
        liveRooms,
        historySessions,
        hostWorks,
        hostSkills,
        creatorAnswers: creatorComments.slice(0, 12),
        creatorPosts,
        stats: {
          followerCount,
          workCount,
          skillCount: Array.from(skillsMap.values()).filter(s => s.authorId === hostId).length,
          answerCount,
          totalSessions,
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
      if (!isValidHostId(userId)) {
        return res.status(404).json({ error: 'User not found' });
      }
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, email: true, avatarUrl: true, bio: true, createdAt: true, updatedAt: true },
      });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const mem = userProfiles.get(userId);
      res.json({
        ...user,
        bio: user.bio ?? mem?.bio ?? null,
      });
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ error: 'Failed to fetch user profile' });
    }
  });

  router.put('/user/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { username, bio, avatarUrl } = req.body;

      const existing = await prisma.user.findUnique({ where: { id: userId } });
      if (!existing) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (username && username !== existing.username) {
        const taken = await prisma.user.findFirst({
          where: { username, NOT: { id: userId } },
        });
        if (taken) {
          return res.status(409).json({ error: 'Username already taken' });
        }
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(username !== undefined && username !== '' && { username }),
          ...(bio !== undefined && { bio }),
          ...(avatarUrl !== undefined && { avatarUrl }),
        },
        select: { id: true, username: true, email: true, avatarUrl: true, bio: true, createdAt: true, updatedAt: true },
      });

      userProfiles.set(userId, {
        id: updated.id,
        username: updated.username,
        bio: updated.bio ?? undefined,
        avatarUrl: updated.avatarUrl ?? undefined,
      });

      res.json(updated);
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Failed to update user profile' });
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

      // Start Telegram bridge if agent is enabled (telegram 类型)
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
      // OpenClaw Direct：无需 bridge，开播即就绪
      else if (agentConfig && agentConfig.agentEnabled && 
          agentConfig.agentType === 'openclaw-direct') {
        if (agentConfig.openclawGatewayUrl && agentConfig.openclawToken) {
          agentConfig.agentStatus = 'connected';
          agentConfigs.set(roomId, agentConfig);
          console.log(`🤖 OpenClaw Direct ready for room ${roomId}`);
        }
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
    const { roomId } = req.params;
    console.log(`📨 [rooms/message] 收到消息请求 roomId=${roomId}`);
    try {
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

      // Forward to Agent if enabled (Telegram or OpenClaw Direct)
      let agentConfig = agentConfigs.get(roomId);
      if (!agentConfig) {
        const restored = await RoomAgentConfigPersistence.restoreToMemory(roomId, agentConfigs as unknown as Map<string, Record<string, unknown>>);
        if (restored) agentConfig = agentConfigs.get(roomId);
      }
      if (agentConfig && agentConfig.agentEnabled) {
        if (agentConfig.agentType === 'telegram') {
          // Use Telegram Bot API (保留原有实现)
          const { bridgeManager } = await import('../../services/telegram-bridge');
          const bridge = bridgeManager.getBridge(roomId);
          if (bridge) {
            console.log(`📤 [Bot API] Forwarding to Telegram: "${content}"`);
            await bridge.sendToTelegram(content);
          } else {
            console.log('⚠️ Telegram bridge not active');
          }
        } else if (agentConfig.agentType === 'telegram-user') {
          // Use MTProto (User API) (保留原有实现)
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
        } else if (agentConfig.agentType === 'openclaw-direct') {
          // OpenClaw 直连：改为浏览器端 WebSocket 直连（避免 1008 配对问题）
          // 主播浏览器直接连 Gateway，收到回复后通过 POST /agent-message 同步
          // 此处仅记录：不再由服务器转发
          console.log(`📤 [OpenClaw Direct] 用户消息已广播，Agent 回复由主播浏览器直连 Gateway 获取`);
        }
      }

      res.json({ message });
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  /**
   * POST /api/rooms/:roomId/agent-message
   * 供主播浏览器直连 OpenClaw 时，将 Agent 回复同步到服务器并广播给观众
   * 仅主播可调用
   */
  router.post('/:roomId/agent-message', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const { content } = req.body;
      const userId = req.user!.id;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Agent message content is required' });
      }

      const room = await getRoom(roomId);
      if (!room) return res.status(404).json({ error: 'Room not found' });
      if (room.hostId !== userId) return res.status(403).json({ error: 'Only room host can post agent messages' });
      if (!room.isLive) return res.status(400).json({ error: 'Room is not live' });

      const agentMessage = {
        id: Date.now().toString(),
        roomId,
        sender: 'agent' as const,
        content,
        timestamp: new Date(),
      };

      await appendMessage(roomId, agentMessage);
      io.to(roomId).emit('new-message', agentMessage);

      res.json({ message: agentMessage });
    } catch (error) {
      console.error('Error posting agent message:', error);
      res.status(500).json({ error: 'Failed to post agent message' });
    }
  });

  return router;
}
