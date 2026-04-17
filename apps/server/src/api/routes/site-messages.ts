import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { prisma } from '../../lib/prisma';

const MAX_BODY = 20_000;
const MAX_SUBJECT = 300;

function serializeMessage(row: {
  id: string;
  senderId: string;
  recipientId: string;
  subject: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  sender?: { username: string; avatarUrl: string | null };
  recipient?: { username: string; avatarUrl: string | null };
}) {
  return {
    id: row.id,
    senderId: row.senderId,
    recipientId: row.recipientId,
    subject: row.subject,
    body: row.body,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    sender: row.sender,
    recipient: row.recipient,
  };
}

export function siteMessagesRoutes(): Router {
  const router = Router();
  router.use(authenticateToken);

  /** POST /api/site-messages  { toUsername, subject?, body } */
  router.post('/', async (req: AuthRequest, res: Response) => {
    try {
      const senderId = req.user!.id;
      const toUsername =
        typeof req.body?.toUsername === 'string' ? req.body.toUsername.trim().replace(/^@/, '') : '';
      const subject =
        typeof req.body?.subject === 'string' ? req.body.subject.trim().slice(0, MAX_SUBJECT) : '';
      const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
      if (!toUsername || !body) {
        res.status(400).json({ error: '请填写收件人用户名与正文' });
        return;
      }
      if (body.length > MAX_BODY) {
        res.status(400).json({ error: '正文过长' });
        return;
      }

      const recipient = await prisma.user.findFirst({
        where: { username: { equals: toUsername, mode: 'insensitive' } },
        select: { id: true },
      });
      if (!recipient) {
        res.status(404).json({ error: '未找到该用户名的站内账号' });
        return;
      }
      if (recipient.id === senderId) {
        res.status(400).json({ error: '不能给自己发站内信' });
        return;
      }

      const row = await prisma.siteMessage.create({
        data: {
          senderId,
          recipientId: recipient.id,
          subject: subject || '',
          body,
        },
        include: {
          sender: { select: { username: true, avatarUrl: true } },
          recipient: { select: { username: true, avatarUrl: true } },
        },
      });
      res.status(201).json({ message: serializeMessage(row) });
    } catch (e) {
      console.error('[site-messages] create', e);
      res.status(500).json({ error: '发送失败' });
    }
  });

  router.get('/inbox', async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const take = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '40'), 10) || 40));
      const rows = await prisma.siteMessage.findMany({
        where: { recipientId: userId },
        orderBy: { createdAt: 'desc' },
        take,
        include: { sender: { select: { username: true, avatarUrl: true } } },
      });
      const unread = await prisma.siteMessage.count({ where: { recipientId: userId, readAt: null } });
      res.json({ items: rows.map((r) => serializeMessage(r)), unread });
    } catch (e) {
      console.error('[site-messages] inbox', e);
      res.status(500).json({ error: '加载失败' });
    }
  });

  router.get('/sent', async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const take = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '40'), 10) || 40));
      const rows = await prisma.siteMessage.findMany({
        where: { senderId: userId },
        orderBy: { createdAt: 'desc' },
        take,
        include: { recipient: { select: { username: true, avatarUrl: true } } },
      });
      res.json({ items: rows.map((r) => serializeMessage(r)) });
    } catch (e) {
      console.error('[site-messages] sent', e);
      res.status(500).json({ error: '加载失败' });
    }
  });

  router.patch('/:id/read', async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const id = req.params.id;
      const row = await prisma.siteMessage.findFirst({
        where: { id, recipientId: userId },
      });
      if (!row) {
        res.status(404).json({ error: '未找到' });
        return;
      }
      const updated = await prisma.siteMessage.update({
        where: { id },
        data: { readAt: row.readAt ?? new Date() },
        include: { sender: { select: { username: true, avatarUrl: true } } },
      });
      res.json({ message: serializeMessage(updated) });
    } catch (e) {
      console.error('[site-messages] read', e);
      res.status(500).json({ error: '更新失败' });
    }
  });

  return router;
}
