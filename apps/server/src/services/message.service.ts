import { prisma } from '../lib/prisma';
import { MessageSender } from '@clawlive/shared-types';

export class MessageService {
  async create(data: {
    roomId: string;
    sender: MessageSender;
    content: string;
    metadata?: Record<string, any>;
    timestamp?: Date;
  }) {
    return await prisma.message.create({
      data: {
        ...data,
        timestamp: data.timestamp || new Date(),
      },
    });
  }

  async findByRoom(params: {
    roomId: string;
    limit?: number;
    before?: Date;
  }) {
    const where: any = { roomId: params.roomId };
    if (params.before) {
      where.timestamp = { lt: params.before };
    }

    return await prisma.message.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: params.limit || 50,
    });
  }

  async deleteOldMessages(daysOld: number = 7) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    return await prisma.message.deleteMany({
      where: {
        timestamp: {
          lt: cutoff,
        },
      },
    });
  }
}

export const messageService = new MessageService();
