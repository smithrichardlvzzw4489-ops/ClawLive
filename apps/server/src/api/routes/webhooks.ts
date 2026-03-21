import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { PrivacyFilter } from '@clawlive/privacy-filter';
import { WebhookMessagePayload, WebhookLogPayload, WebhookScreenshotPayload } from '@clawlive/shared-types';
import { verifyWebhookSignature } from '../middleware/webhookAuth';
import { getRoom, appendMessage } from '../lib/rooms-store';
import sharp from 'sharp';

const prisma = new PrismaClient();

export function webhookRoutes(io: Server): Router {
  const router = Router();

  router.post('/openclaw/:roomId/message', verifyWebhookSignature, async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const payload: WebhookMessagePayload = req.body;

      const room = await prisma.room.findUnique({
        where: { id: roomId },
      });

      if (room) {
        // Prisma 房间：写入 DB 并推送
        const privacyFilter = new PrivacyFilter(room.privacyFilters);
        const { filtered, hadSensitive } = privacyFilter.filter(payload.content);

        const message = await prisma.message.create({
          data: {
            roomId,
            sender: payload.sender,
            content: filtered,
            metadata: {
              ...payload.metadata,
              filtered: hadSensitive,
            },
            timestamp: new Date(payload.timestamp),
          },
        });

        io.to(roomId).emit('new-message', message);
        return res.status(201).json({ success: true, messageId: message.id });
      }

      // rooms-simple 房间（支持 Redis 多实例）：Agent 回复从 Telegram 经 bridge 推送到此
      const room = await getRoom(roomId);
      if (room) {
        const content = payload.content || '';
        const message = {
          id: Date.now().toString(),
          roomId,
          sender: payload.sender === 'agent' ? 'agent' : ('host' as const),
          content,
          timestamp: new Date(payload.timestamp || Date.now()),
        };
        await appendMessage(roomId, message);

        io.to(roomId).emit('new-message', message);
        console.log(`✅ [Webhook] Agent message pushed to room ${roomId}`);
        return res.status(201).json({ success: true, messageId: message.id });
      }

      return res.status(404).json({ error: 'Room not found' });
    } catch (error) {
      console.error('Error processing webhook message:', error);
      res.status(500).json({ error: 'Failed to process message' });
    }
  });

  router.post('/openclaw/:roomId/log', verifyWebhookSignature, async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const payload: WebhookLogPayload = req.body;

      const room = await prisma.room.findUnique({
        where: { id: roomId },
      });

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      const log = await prisma.agentLog.create({
        data: {
          roomId,
          action: payload.action,
          status: payload.status,
          details: payload.details || {},
        },
      });

      io.to(roomId).emit('new-log', log);

      res.status(201).json({ success: true, logId: log.id });
    } catch (error) {
      console.error('Error processing webhook log:', error);
      res.status(500).json({ error: 'Failed to process log' });
    }
  });

  router.post('/openclaw/:roomId/screenshot', verifyWebhookSignature, async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const payload: WebhookScreenshotPayload = req.body;

      const room = await prisma.room.findUnique({
        where: { id: roomId },
      });

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      const buffer = Buffer.from(payload.imageBase64, 'base64');
      const compressed = await sharp(buffer)
        .resize(1920, 1080, { fit: 'inside' })
        .jpeg({ quality: 80 })
        .toBuffer();

      const dataUrl = `data:image/jpeg;base64,${compressed.toString('base64')}`;

      const screenshot = await prisma.screenshot.create({
        data: {
          roomId,
          imageUrl: dataUrl,
          caption: payload.caption,
        },
      });

      io.to(roomId).emit('new-screenshot', screenshot);

      res.status(201).json({ success: true, screenshotId: screenshot.id });
    } catch (error) {
      console.error('Error processing screenshot:', error);
      res.status(500).json({ error: 'Failed to process screenshot' });
    }
  });

  return router;
}
