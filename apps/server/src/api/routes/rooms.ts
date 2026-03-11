import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { CreateRoomRequest, UpdateRoomRequest } from '@clawlive/shared-types';

const prisma = new PrismaClient();

export function roomRoutes(io: Server): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const { page = '1', limit = '20', isLive } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where = isLive !== undefined ? { isLive: isLive === 'true' } : {};

      const [rooms, total] = await Promise.all([
        prisma.room.findMany({
          where,
          include: {
            host: {
              select: {
                username: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: [
            { isLive: 'desc' },
            { startedAt: 'desc' },
            { createdAt: 'desc' },
          ],
          skip,
          take: parseInt(limit as string),
        }),
        prisma.room.count({ where }),
      ]);

      res.json({
        rooms: rooms.map(room => ({
          id: room.id,
          title: room.title,
          lobsterName: room.lobsterName,
          hostUsername: room.host.username,
          viewerCount: room.viewerCount,
          isLive: room.isLive,
          startedAt: room.startedAt,
          description: room.description,
        })),
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string)),
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
        return res.status(404).json({ error: 'Room not found' });
      }

      res.json(room);
    } catch (error) {
      console.error('Error fetching room:', error);
      res.status(500).json({ error: 'Failed to fetch room' });
    }
  });

  router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { id, title, description, lobsterName, dashboardUrl }: CreateRoomRequest = req.body;

      if (!id || !title || !lobsterName) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const existingRoom = await prisma.room.findUnique({
        where: { id },
      });

      if (existingRoom) {
        return res.status(409).json({ error: 'Room ID already exists' });
      }

      const room = await prisma.room.create({
        data: {
          id,
          hostId: req.user!.id,
          title,
          description,
          lobsterName,
          dashboardUrl,
        },
      });

      res.status(201).json(room);
    } catch (error) {
      console.error('Error creating room:', error);
      res.status(500).json({ error: 'Failed to create room' });
    }
  });

  router.patch('/:roomId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;
      const updates: UpdateRoomRequest = req.body;

      const room = await prisma.room.findUnique({
        where: { id: roomId },
      });

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      if (room.hostId !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to update this room' });
      }

      const updatedRoom = await prisma.room.update({
        where: { id: roomId },
        data: updates,
      });

      res.json(updatedRoom);
    } catch (error) {
      console.error('Error updating room:', error);
      res.status(500).json({ error: 'Failed to update room' });
    }
  });

  router.delete('/:roomId', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;

      const room = await prisma.room.findUnique({
        where: { id: roomId },
      });

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      if (room.hostId !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized to delete this room' });
      }

      await prisma.room.delete({
        where: { id: roomId },
      });

      io.to(roomId).emit('room-status-change', { isLive: false, endedAt: new Date() });

      res.json({ message: 'Room deleted successfully' });
    } catch (error) {
      console.error('Error deleting room:', error);
      res.status(500).json({ error: 'Failed to delete room' });
    }
  });

  router.post('/:roomId/start', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;

      const room = await prisma.room.findUnique({
        where: { id: roomId },
      });

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      if (room.hostId !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const updatedRoom = await prisma.room.update({
        where: { id: roomId },
        data: {
          isLive: true,
          startedAt: new Date(),
        },
      });

      io.to(roomId).emit('room-status-change', {
        isLive: true,
        startedAt: updatedRoom.startedAt,
      });

      res.json(updatedRoom);
    } catch (error) {
      console.error('Error starting room:', error);
      res.status(500).json({ error: 'Failed to start room' });
    }
  });

  router.post('/:roomId/stop', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { roomId } = req.params;

      const room = await prisma.room.findUnique({
        where: { id: roomId },
      });

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      if (room.hostId !== req.user!.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const updatedRoom = await prisma.room.update({
        where: { id: roomId },
        data: {
          isLive: false,
          endedAt: new Date(),
        },
      });

      io.to(roomId).emit('room-status-change', {
        isLive: false,
        endedAt: updatedRoom.endedAt,
      });

      res.json(updatedRoom);
    } catch (error) {
      console.error('Error stopping room:', error);
      res.status(500).json({ error: 'Failed to stop room' });
    }
  });

  router.get('/:roomId/messages', async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const { limit = '50', before } = req.query;

      const where: any = { roomId };
      if (before) {
        where.timestamp = { lt: new Date(before as string) };
      }

      const messages = await prisma.message.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: parseInt(limit as string),
      });

      res.json(messages.reverse());
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  router.get('/:roomId/logs', async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const { limit = '50', before } = req.query;

      const where: any = { roomId };
      if (before) {
        where.timestamp = { lt: new Date(before as string) };
      }

      const logs = await prisma.agentLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: parseInt(limit as string),
      });

      res.json(logs.reverse());
    } catch (error) {
      console.error('Error fetching logs:', error);
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  });

  return router;
}
