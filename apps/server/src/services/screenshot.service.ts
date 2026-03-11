import { prisma } from '../lib/prisma';
import sharp from 'sharp';

export class ScreenshotService {
  async create(data: {
    roomId: string;
    imageUrl: string;
    caption?: string;
  }) {
    return await prisma.screenshot.create({
      data,
    });
  }

  async processAndSave(params: {
    roomId: string;
    imageBase64: string;
    caption?: string;
  }): Promise<string> {
    const buffer = Buffer.from(params.imageBase64, 'base64');
    
    const compressed = await sharp(buffer)
      .resize(1920, 1080, { fit: 'inside' })
      .jpeg({ quality: 80 })
      .toBuffer();

    const dataUrl = `data:image/jpeg;base64,${compressed.toString('base64')}`;

    await this.create({
      roomId: params.roomId,
      imageUrl: dataUrl,
      caption: params.caption,
    });

    return dataUrl;
  }

  async findByRoom(roomId: string, limit: number = 20) {
    return await prisma.screenshot.findMany({
      where: { roomId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  async deleteOldScreenshots(hoursOld: number = 24) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hoursOld);

    return await prisma.screenshot.deleteMany({
      where: {
        timestamp: {
          lt: cutoff,
        },
      },
    });
  }
}

export const screenshotService = new ScreenshotService();
