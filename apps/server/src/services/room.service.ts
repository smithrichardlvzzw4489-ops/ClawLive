import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export class RoomService {
  async findAll(params?: { page?: number; limit?: number; isLive?: boolean }) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const skip = (page - 1) * limit;

    const where = params?.isLive !== undefined ? { isLive: params.isLive } : {};

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
        take: limit,
      }),
      prisma.room.count({ where }),
    ]);

    return {
      rooms,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findById(roomId: string) {
    return await prisma.room.findUnique({
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
  }

  async create(data: {
    id: string;
    hostId: string;
    title: string;
    description?: string;
    lobsterName: string;
    dashboardUrl?: string;
  }) {
    return await prisma.room.create({
      data,
    });
  }

  async update(roomId: string, data: Prisma.RoomUpdateInput) {
    return await prisma.room.update({
      where: { id: roomId },
      data,
    });
  }

  async delete(roomId: string) {
    return await prisma.room.delete({
      where: { id: roomId },
    });
  }

  async updateViewerCount(roomId: string, count: number) {
    return await prisma.room.update({
      where: { id: roomId },
      data: { viewerCount: count },
    });
  }
}

export const roomService = new RoomService();
