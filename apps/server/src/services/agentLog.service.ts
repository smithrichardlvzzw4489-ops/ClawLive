import { prisma } from '../lib/prisma';
import { AgentLogStatus } from '@clawlive/shared-types';

export class AgentLogService {
  async create(data: {
    roomId: string;
    action: string;
    status: AgentLogStatus;
    details?: Record<string, any>;
  }) {
    return await prisma.agentLog.create({
      data,
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

    return await prisma.agentLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: params.limit || 50,
    });
  }

  async deleteOldLogs(hoursOld: number = 24) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hoursOld);

    return await prisma.agentLog.deleteMany({
      where: {
        timestamp: {
          lt: cutoff,
        },
      },
    });
  }
}

export const agentLogService = new AgentLogService();
