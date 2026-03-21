import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import { getHostInfo } from '../api/routes/rooms-simple';
import { getRoom, getMessageHistory } from '../lib/rooms-store';

// WebRTC types (not in Node lib, define locally)
interface RTCSessionDescriptionInit {
  type?: string;
  sdp?: string;
}
interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

// roomId -> host socket id（视频直播推流方）
// 单实例用内存；多实例（REDIS_URL）用 Redis，否则观众无法获取主播 WebRTC 信令
const videoStreamHostsMemory = new Map<string, string>();
let redisClient: RedisClientType | null = null;
const WEBRTC_HOST_PREFIX = 'webrtc:host:';

async function getVideoHost(roomId: string): Promise<string | undefined> {
  if (redisClient) {
    try {
      const v = await redisClient.get(WEBRTC_HOST_PREFIX + roomId);
      return v ?? undefined;
    } catch {
      return videoStreamHostsMemory.get(roomId);
    }
  }
  return videoStreamHostsMemory.get(roomId);
}

async function setVideoHost(roomId: string, socketId: string): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.set(WEBRTC_HOST_PREFIX + roomId, socketId, { EX: 3600 });
    } catch {
      videoStreamHostsMemory.set(roomId, socketId);
    }
  } else {
    videoStreamHostsMemory.set(roomId, socketId);
  }
}

async function deleteVideoHost(roomId: string): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.del(WEBRTC_HOST_PREFIX + roomId);
    } catch {
      videoStreamHostsMemory.delete(roomId);
    }
  } else {
    videoStreamHostsMemory.delete(roomId);
  }
}

async function findRoomIdByHost(socketId: string): Promise<string | undefined> {
  if (redisClient) {
    try {
      const keys = await redisClient.keys(WEBRTC_HOST_PREFIX + '*');
      for (const k of keys) {
        const v = await redisClient.get(k);
        if (v === socketId) return k.replace(WEBRTC_HOST_PREFIX, '');
      }
      return undefined;
    } catch {
      for (const [rid, hid] of videoStreamHostsMemory) {
        if (hid === socketId) return rid;
      }
      return undefined;
    }
  }
  for (const [rid, hid] of videoStreamHostsMemory) {
    if (hid === socketId) return rid;
  }
  return undefined;
}

export async function setupSocketIO(io: Server): Promise<void> {
  // Redis 连接放后台，不阻塞服务启动（健康检查需尽快通过）
  if (process.env.REDIS_URL) {
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();
    redisClient = createClient({ url: process.env.REDIS_URL });
    Promise.all([pubClient.connect(), subClient.connect(), redisClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('[OK] Socket.io Redis adapter + WebRTC host store configured');
      })
      .catch(async (err) => {
        if (redisClient) {
          try {
            await redisClient.quit();
          } catch {
            // ignore
          }
          redisClient = null;
        }
        console.warn('[WARN] Redis connection failed, running without Redis adapter:', err instanceof Error ? err.message : 'Unknown error');
        console.log('[OK] Socket.io running in standalone mode (single server)');
      });
  }

  /** 规范化 roomId：客户端可能发 URL 编码，MTProto/Redis 用解码形式，必须统一 */
  function normalizeRoomId(id: string): string {
    if (!id || typeof id !== 'string') return id;
    try {
      return decodeURIComponent(id);
    } catch {
      return id;
    }
  }

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('join-room', async (payload) => {
      try {
        let roomId = typeof payload === 'string' ? payload : payload?.roomId;
        const role = (typeof payload === 'object' && payload?.role) || 'viewer';
        const agentId = typeof payload === 'object' ? payload?.agentId : undefined;

        if (!roomId) {
          socket.emit('error', { message: 'roomId is required' });
          return;
        }
        roomId = normalizeRoomId(roomId);

        await socket.join(roomId);
        socket.data.role = role;
        socket.data.agentId = agentId;
        socket.data.roomId = roomId;
        console.log(`Socket ${socket.id} joined room: ${roomId} as ${role}${agentId ? ` (agent: ${agentId})` : ''}`);

        const sockets = await io.in(roomId).fetchSockets();
        const viewerCount = sockets.length;

        io.to(roomId).emit('viewer-count-update', viewerCount);

        // Send message history（支持 Redis 多实例）
        const history = await getMessageHistory(roomId);
        socket.emit('message-history', history);
        console.log(`[MSG] Sent ${history.length} historical messages to ${socket.id} room=${roomId}`);

        // 发送完整房间信息（含 isLive），支持 Redis 多实例
        const room = await getRoom(roomId);
        let roomData: Record<string, unknown>;
        if (room) {
          const host = await getHostInfo(room.hostId);
          roomData = {
            id: room.id,
            hostId: room.hostId,
            title: room.title,
            lobsterName: room.lobsterName,
            description: room.description,
            isLive: room.isLive,
            liveMode: room.liveMode ?? 'video',
            startedAt: room.startedAt,
            endedAt: room.endedAt,
            viewerCount,
            createdAt: room.createdAt,
            host: { id: host.id, username: host.username, avatarUrl: host.avatarUrl ?? null },
          };
        } else {
          roomData = {
            id: roomId,
            viewerCount,
            isLive: false,
            title: '未知房间',
            lobsterName: '龙虾',
            hostId: '',
            host: { id: '', username: 'Unknown', avatarUrl: null },
            createdAt: new Date(),
          };
        }
        socket.emit('room-info', roomData);
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('leave-room', async (payload) => {
      let roomId = typeof payload === 'string' ? payload : payload?.roomId;
      if (!roomId) return;
      roomId = normalizeRoomId(roomId);
      await socket.leave(roomId);
      delete socket.data.roomId;
      delete socket.data.role;
      delete socket.data.agentId;
      console.log(`Socket ${socket.id} left room: ${roomId}`);

      const sockets = await io.in(roomId).fetchSockets();
      const viewerCount = sockets.length;

      io.to(roomId).emit('viewer-count-update', viewerCount);
    });

    socket.on('join-work', async (payload) => {
      try {
        const workId = typeof payload === 'string' ? payload : payload?.workId;
        const role = (typeof payload === 'object' && payload?.role) || 'viewer';
        const agentId = typeof payload === 'object' ? payload?.agentId : undefined;

        if (!workId) {
          socket.emit('error', { message: 'workId is required' });
          return;
        }

        await socket.join(workId);
        socket.data.role = role;
        socket.data.agentId = agentId;
        socket.data.workId = workId;
        console.log(`Socket ${socket.id} joined work: ${workId} as ${role}${agentId ? ` (agent: ${agentId})` : ''}`);

        // Send work message history
        const { workMessages } = require('../api/routes/rooms-simple');
        const messages = workMessages.get(workId) || [];
        socket.emit('work-history', messages);
        console.log(`[MSG] Sent ${messages.length} work messages to ${socket.id}`);
      } catch (error) {
        console.error('Error joining work:', error);
        socket.emit('error', { message: 'Failed to join work' });
      }
    });

    socket.on('leave-work', async (payload) => {
      const workId = typeof payload === 'string' ? payload : payload?.workId;
      if (!workId) return;
      await socket.leave(workId);
      delete socket.data.workId;
      delete socket.data.role;
      delete socket.data.agentId;
      console.log(`Socket ${socket.id} left work: ${workId}`);
    });

    // ========== WebRTC 视频直播信令 ==========
    socket.on('webrtc-register-host', async (payload: { roomId?: string }) => {
      const roomId = payload?.roomId ? normalizeRoomId(payload.roomId) : undefined;
      if (roomId) {
        await setVideoHost(roomId, socket.id);
        io.to(roomId).emit('webrtc-host-ready');
        console.log(`[WebRTC] Host ${socket.id} registered for room ${roomId}`);
      }
    });

    socket.on('webrtc-unregister-host', async (payload: { roomId?: string }) => {
      const roomId = payload?.roomId ? normalizeRoomId(payload.roomId) : undefined;
      if (roomId) {
        await deleteVideoHost(roomId);
        io.to(roomId).emit('webrtc-stream-ended');
        console.log(`[WebRTC] Host unregistered for room ${roomId}`);
      }
    });

    socket.on('webrtc-viewer-request', async (payload: { roomId?: string }) => {
      const roomId = payload?.roomId ? normalizeRoomId(payload.roomId) : undefined;
      if (!roomId) return;
      const hostId = await getVideoHost(roomId);
      if (hostId) {
        io.to(hostId).emit('webrtc-viewer-request', { viewerId: socket.id });
        console.log(`[WebRTC] viewer ${socket.id} requested stream for room ${roomId}, forwarding to host ${hostId}`);
      } else {
        console.log(`[WebRTC] viewer ${socket.id} requested stream for room ${roomId}, but NO HOST REGISTERED`);
        io.to(socket.id).emit('webrtc-no-host', { roomId });
      }
    });

    socket.on('webrtc-offer', ({ roomId, toViewerId, sdp }: { roomId: string; toViewerId: string; sdp: RTCSessionDescriptionInit }) => {
      io.to(toViewerId).emit('webrtc-offer', { sdp, fromHostId: socket.id });
      console.log(`[WebRTC] offer sent from host ${socket.id} to viewer ${toViewerId} room ${roomId}`);
    });

    socket.on('webrtc-answer', ({ roomId, toHostId, sdp }: { roomId: string; toHostId: string; sdp: RTCSessionDescriptionInit }) => {
      io.to(toHostId).emit('webrtc-answer', { sdp, fromViewerId: socket.id });
    });

    socket.on('webrtc-ice', ({ roomId, toId, candidate }: { roomId?: string; toId: string; candidate: RTCIceCandidateInit }) => {
      io.to(toId).emit('webrtc-ice', { candidate, fromId: socket.id });
    });

    socket.on('send-comment', async (payload: { roomId?: string; content?: string; nickname?: string }) => {
      try {
        let roomId = payload?.roomId ? normalizeRoomId(payload.roomId) : undefined;
        const { content, nickname } = payload || {};
        if (!roomId || !content || typeof content !== 'string' || content.trim().length === 0) {
          socket.emit('error', { message: 'Comment cannot be empty' });
          return;
        }

        if (content.length > 500) {
          socket.emit('error', { message: 'Comment too long (max 500 characters)' });
          return;
        }

        const comment = {
          id: Date.now().toString(),
          roomId,
          nickname: nickname || 'Anonymous',
          content: content.trim(),
          timestamp: new Date(),
        };

        io.to(roomId).emit('new-comment', comment);
      } catch (error) {
        console.error('Error sending comment:', error);
        socket.emit('error', { message: 'Failed to send comment' });
      }
    });

    socket.on('disconnect', async () => {
      // 清理视频直播 host 注册
      const roomId = await findRoomIdByHost(socket.id);
      if (roomId) {
        await deleteVideoHost(roomId);
        io.to(roomId).emit('webrtc-stream-ended');
      }
      console.log(`Client disconnected: ${socket.id}`);

      const rooms = Array.from(socket.rooms);
      for (const roomId of rooms) {
        if (roomId !== socket.id) {
          const sockets = await io.in(roomId).fetchSockets();
          const viewerCount = sockets.length;

          io.to(roomId).emit('viewer-count-update', viewerCount);
        }
      }
    });
  });
}

export function broadcastToRoom(io: Server, roomId: string, event: string, data: any): void {
  io.to(roomId).emit(event, data);
}
