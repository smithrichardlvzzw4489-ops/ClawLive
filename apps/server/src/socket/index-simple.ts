import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { messageHistory, roomInfo, getHostInfo } from '../api/routes/rooms-simple';

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
const videoStreamHosts = new Map<string, string>();

export async function setupSocketIO(io: Server): Promise<void> {
  // Redis 连接放后台，不阻塞服务启动（健康检查需尽快通过）
  if (process.env.REDIS_URL) {
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();
    Promise.all([pubClient.connect(), subClient.connect()])
      .then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('[OK] Socket.io Redis adapter configured');
      })
      .catch((err) => {
        console.warn('[WARN] Redis connection failed, running without Redis adapter:', err instanceof Error ? err.message : 'Unknown error');
        console.log('[OK] Socket.io running in standalone mode (single server)');
      });
  }

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('join-room', async (payload) => {
      try {
        const roomId = typeof payload === 'string' ? payload : payload?.roomId;
        const role = (typeof payload === 'object' && payload?.role) || 'viewer';
        const agentId = typeof payload === 'object' ? payload?.agentId : undefined;

        if (!roomId) {
          socket.emit('error', { message: 'roomId is required' });
          return;
        }

        await socket.join(roomId);
        socket.data.role = role;
        socket.data.agentId = agentId;
        socket.data.roomId = roomId;
        console.log(`Socket ${socket.id} joined room: ${roomId} as ${role}${agentId ? ` (agent: ${agentId})` : ''}`);

        const sockets = await io.in(roomId).fetchSockets();
        const viewerCount = sockets.length;

        io.to(roomId).emit('viewer-count-update', viewerCount);

        // Send message history from memory
        const history = messageHistory.get(roomId) || [];
        socket.emit('message-history', history);
        console.log(`[MSG] Sent ${history.length} historical messages to ${socket.id}`);

        // 发送完整房间信息（含 isLive），否则观众端会一直显示「直播未开始」
        const room = roomInfo.get(roomId);
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
      const roomId = typeof payload === 'string' ? payload : payload?.roomId;
      if (!roomId) return;
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
    socket.on('webrtc-register-host', ({ roomId }: { roomId: string }) => {
      if (roomId) {
        videoStreamHosts.set(roomId, socket.id);
        io.to(roomId).emit('webrtc-host-ready');
        console.log(`[WebRTC] Host registered for room ${roomId}`);
      }
    });

    socket.on('webrtc-unregister-host', ({ roomId }: { roomId: string }) => {
      if (roomId) {
        videoStreamHosts.delete(roomId);
        io.to(roomId).emit('webrtc-stream-ended');
        console.log(`[WebRTC] Host unregistered for room ${roomId}`);
      }
    });

    socket.on('webrtc-viewer-request', ({ roomId }: { roomId: string }) => {
      const hostId = videoStreamHosts.get(roomId);
      if (hostId) {
        io.to(hostId).emit('webrtc-viewer-request', { viewerId: socket.id });
      }
    });

    socket.on('webrtc-offer', ({ roomId, toViewerId, sdp }: { roomId: string; toViewerId: string; sdp: RTCSessionDescriptionInit }) => {
      io.to(toViewerId).emit('webrtc-offer', { sdp, fromHostId: socket.id });
    });

    socket.on('webrtc-answer', ({ roomId, toHostId, sdp }: { roomId: string; toHostId: string; sdp: RTCSessionDescriptionInit }) => {
      io.to(toHostId).emit('webrtc-answer', { sdp, fromViewerId: socket.id });
    });

    socket.on('webrtc-ice', ({ roomId, toId, candidate }: { roomId?: string; toId: string; candidate: RTCIceCandidateInit }) => {
      io.to(toId).emit('webrtc-ice', { candidate, fromId: socket.id });
    });

    socket.on('send-comment', async ({ roomId, content, nickname }) => {
      try {
        if (!content || content.trim().length === 0) {
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
      for (const [rid, hid] of videoStreamHosts) {
        if (hid === socket.id) {
          videoStreamHosts.delete(rid);
          io.to(rid).emit('webrtc-stream-ended');
        }
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
