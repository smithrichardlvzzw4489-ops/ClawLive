/**
 * 房间与消息存储：单实例用内存，多实例（REDIS_URL）用 Redis 同步
 * 解决多实例部署时观众端「未知房间」「直播未开始」、主播端收不到 Agent 消息等问题
 */
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

export type RoomData = {
  id: string;
  hostId: string;
  title: string;
  lobsterName: string;
  description?: string;
  isLive: boolean;
  liveMode?: 'video' | 'audio';
  startedAt?: Date;
  endedAt?: Date;
  viewerCount: number;
  createdAt: Date;
};

export type MessageData = {
  id: string;
  roomId: string;
  sender: 'host' | 'agent';
  content: string;
  timestamp: Date;
};

const memoryRooms = new Map<string, RoomData>();
const memoryMessages = new Map<string, MessageData[]>();
let redis: RedisClientType | null = null;
const PREFIX = 'rooms:';
const MSG_PREFIX = 'rooms:msg:';

function revivateRoom(obj: any): RoomData | null {
  if (!obj || typeof obj !== 'object') return null;
  return {
    ...obj,
    startedAt: obj.startedAt ? new Date(obj.startedAt) : undefined,
    endedAt: obj.endedAt ? new Date(obj.endedAt) : undefined,
    createdAt: obj.createdAt ? new Date(obj.createdAt) : new Date(),
  };
}

function revivateMessages(arr: any[]): MessageData[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((m) => ({
    ...m,
    timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
  }));
}

export async function initRoomsStore(): Promise<void> {
  if (process.env.REDIS_URL && !redis) {
    try {
      redis = createClient({ url: process.env.REDIS_URL });
      await redis.connect();
      console.log('[OK] Rooms store Redis connected');
    } catch (err) {
      console.warn('[WARN] Rooms store Redis failed:', err instanceof Error ? err.message : err);
      redis = null;
    }
  }
}

// ---------- Room ----------
export async function getRoom(roomId: string): Promise<RoomData | undefined> {
  let r = memoryRooms.get(roomId);
  if (r) return r;
  if (redis) {
    try {
      const raw = await redis.get(PREFIX + roomId);
      if (raw) {
        const parsed = JSON.parse(raw);
        r = revivateRoom(parsed);
        if (r) {
          memoryRooms.set(roomId, r);
          return r;
        }
      }
    } catch (e) {
      console.warn('[rooms-store] Redis getRoom error:', e);
    }
  }
  return undefined;
}

export async function setRoom(roomId: string, room: RoomData): Promise<void> {
  memoryRooms.set(roomId, room);
  if (redis) {
    try {
      const obj = {
        ...room,
        startedAt: room.startedAt?.toISOString(),
        endedAt: room.endedAt?.toISOString(),
        createdAt: room.createdAt?.toISOString(),
      };
      await redis.set(PREFIX + roomId, JSON.stringify(obj), { EX: 86400 });
    } catch (e) {
      console.warn('[rooms-store] Redis setRoom error:', e);
    }
  }
}

export async function hasRoom(roomId: string): Promise<boolean> {
  return (await getRoom(roomId)) !== undefined;
}

export async function getAllRoomIds(): Promise<string[]> {
  if (redis) {
    try {
      const keys = await redis.keys(PREFIX + '*');
      return keys.map((k) => k.replace(PREFIX, ''));
    } catch {
      return Array.from(memoryRooms.keys());
    }
  }
  return Array.from(memoryRooms.keys());
}

export async function getAllRooms(): Promise<RoomData[]> {
  const ids = await getAllRoomIds();
  const rooms: RoomData[] = [];
  for (const id of ids) {
    const r = await getRoom(id);
    if (r) rooms.push(r);
  }
  return rooms;
}

export async function deleteRoom(roomId: string): Promise<void> {
  memoryRooms.delete(roomId);
  if (redis) {
    try {
      await redis.del(PREFIX + roomId);
    } catch (e) {
      console.warn('[rooms-store] Redis delRoom error:', e);
    }
  }
}

// ---------- Message History ----------
export async function getMessageHistory(roomId: string): Promise<MessageData[]> {
  let msgs = memoryMessages.get(roomId);
  if (msgs) return msgs;
  if (redis) {
    try {
      const raw = await redis.get(MSG_PREFIX + roomId);
      if (raw) {
        const parsed = JSON.parse(raw);
        msgs = revivateMessages(parsed);
        memoryMessages.set(roomId, msgs);
        return msgs;
      }
    } catch (e) {
      console.warn('[rooms-store] Redis getMessageHistory error:', e);
    }
  }
  return [];
}

export async function appendMessage(roomId: string, msg: MessageData): Promise<void> {
  let msgs = memoryMessages.get(roomId) || [];
  msgs = [...msgs, msg];
  if (msgs.length > 100) msgs = msgs.slice(-100);
  memoryMessages.set(roomId, msgs);
  if (redis) {
    try {
      const arr = msgs.map((m) => ({
        ...m,
        timestamp: m.timestamp?.toISOString?.() ?? new Date().toISOString(),
      }));
      await redis.set(MSG_PREFIX + roomId, JSON.stringify(arr), { EX: 86400 });
    } catch (e) {
      console.warn('[rooms-store] Redis appendMessage error:', e);
    }
  }
}

export async function setMessageHistory(roomId: string, msgs: MessageData[]): Promise<void> {
  const trimmed = msgs.length > 100 ? msgs.slice(-100) : msgs;
  memoryMessages.set(roomId, trimmed);
  if (redis) {
    try {
      const arr = trimmed.map((m) => ({
        ...m,
        timestamp: m.timestamp?.toISOString?.() ?? new Date().toISOString(),
      }));
      await redis.set(MSG_PREFIX + roomId, JSON.stringify(arr), { EX: 86400 });
    } catch (e) {
      console.warn('[rooms-store] Redis setMessageHistory error:', e);
    }
  }
}

// 兼容：导出同步 memory 供需要遍历的场景（如 roomInfo.values()）
export function getMemoryRoomsMap(): Map<string, RoomData> {
  return memoryRooms;
}

export function getMemoryMessagesMap(): Map<string, MessageData[]> {
  return memoryMessages;
}
