import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function setupSocketIO(io: Server): Promise<void> {
  if (process.env.REDIS_URL) {
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.io Redis adapter configured');
  }

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('join-room', async ({ roomId, role }) => {
      try {
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          include: {
            host: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        });

        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        await socket.join(roomId);
        console.log(`Socket ${socket.id} joined room: ${roomId} as ${role}`);

        const sockets = await io.in(roomId).fetchSockets();
        const viewerCount = sockets.length;

        await prisma.room.update({
          where: { id: roomId },
          data: { viewerCount },
        });

        io.to(roomId).emit('viewer-count-update', viewerCount);

        const messages = await prisma.message.findMany({
          where: { roomId },
          orderBy: { timestamp: 'desc' },
          take: 50,
        });

        socket.emit('message-history', messages.reverse());
        socket.emit('room-info', {
          ...room,
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

      await prisma.room.update({
        where: { id: roomId },
        data: { viewerCount },
      });

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

        const comment = await prisma.comment.create({
          data: {
            roomId,
            nickname: nickname || 'Anonymous',
            content: content.trim(),
          },
        });

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

          await prisma.room.update({
            where: { id: roomId },
            data: { viewerCount },
          }).catch(() => {});

          io.to(roomId).emit('viewer-count-update', viewerCount);
        }
      }
    });
  });
}

export function broadcastToRoom(io: Server, roomId: string, event: string, data: any): void {
  io.to(roomId).emit(event, data);
}
