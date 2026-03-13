import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { messageHistory } from '../api/routes/rooms-simple';

export async function setupSocketIO(io: Server): Promise<void> {
  if (process.env.REDIS_URL) {
    try {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('✅ Socket.io Redis adapter configured');
    } catch (error) {
      console.warn('⚠️  Redis connection failed, running without Redis adapter:', error instanceof Error ? error.message : 'Unknown error');
      console.log('✅ Socket.io running in standalone mode (single server)');
    }
  }

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('join-room', async ({ roomId, role }) => {
      try {
        await socket.join(roomId);
        console.log(`Socket ${socket.id} joined room: ${roomId} as ${role}`);

        const sockets = await io.in(roomId).fetchSockets();
        const viewerCount = sockets.length;

        io.to(roomId).emit('viewer-count-update', viewerCount);

        // Send message history from memory
        const history = messageHistory.get(roomId) || [];
        socket.emit('message-history', history);
        console.log(`📨 Sent ${history.length} historical messages to ${socket.id}`);
        
        socket.emit('room-info', {
          id: roomId,
          viewerCount,
        });
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('leave-room', async ({ roomId }) => {
      await socket.leave(roomId);
      console.log(`Socket ${socket.id} left room: ${roomId}`);

      const sockets = await io.in(roomId).fetchSockets();
      const viewerCount = sockets.length;

      io.to(roomId).emit('viewer-count-update', viewerCount);
    });

    socket.on('join-work', async (workId: string) => {
      try {
        await socket.join(workId);
        console.log(`Socket ${socket.id} joined work: ${workId}`);
        
        // Send work message history
        const { workMessages } = require('../api/routes/rooms-simple');
        const messages = workMessages.get(workId) || [];
        socket.emit('work-history', messages);
        console.log(`📨 Sent ${messages.length} work messages to ${socket.id}`);
      } catch (error) {
        console.error('Error joining work:', error);
        socket.emit('error', { message: 'Failed to join work' });
      }
    });

    socket.on('leave-work', async (workId: string) => {
      await socket.leave(workId);
      console.log(`Socket ${socket.id} left work: ${workId}`);
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
