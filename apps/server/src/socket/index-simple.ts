import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

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

        // Send empty history (no DB)
        socket.emit('message-history', []);
        
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
