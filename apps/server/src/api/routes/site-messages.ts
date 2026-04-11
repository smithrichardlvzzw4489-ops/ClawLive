import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { prisma } from '../../lib/prisma';
import { extractContactInfo, sendOutreachHtmlToDeveloper } from '../../services/codernet-outreach';
import { checkQuota, consumeQuota } from '../../services/quota-manager';

function getServerGitHubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.CODERNET_GITHUB_TOKEN;
}

const MAX_TARGETS = 40;
const MAX_SUBJECT = 200;
const MAX_BODY = 12_000;

async function trySendOutreachEmail(
  senderId: string,
  githubLogin: string,
  subject: string,
  mailBody: string,
  profileUrl: string,
  fromEmail: string,
  fromName: string,
  token: string | undefined,
): Promise<'sent' | 'skipped' | 'failed' | 'no_address'> {
  const q = checkQuota(senderId, 'outreach');
  if (!q.allowed) return 'skipped';
  try {
    const { contact } = await extractContactInfo(githubLogin, token);
    const to = contact.bestEmail;
    if (!to) return 'no_address';
    const r = await sendOutreachHtmlToDeveloper(to, subject, mailBody, profileUrl, fromEmail, fromName);
    if (r.success) {
      consumeQuota(senderId, 'outreach', 1);
      return 'sent';
    }
    return 'failed';
  } catch (e) {
    console.warn('[link-contact] email', githubLogin, e);
    return 'failed';
  }
}

export function siteMessagesRoutes(): Router {
  const router = Router();
  router.use(authenticateToken);

  router.get('/', async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const rows = await prisma.siteMessage.findMany({
        where: { recipientId: userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          sender: { select: { id: true, username: true, avatarUrl: true, githubUsername: true } },
        },
      });
      res.json({
        messages: rows.map((m) => ({
          id: m.id,
          subject: m.subject,
          body: m.body,
          readAt: m.readAt?.toISOString() ?? null,
          createdAt: m.createdAt.toISOString(),
          source: m.source,
          sender: m.sender,
        })),
      });
    } catch (e) {
      console.error('[messages] list', e);
      res.status(500).json({ error: 'Failed to list messages' });
    }
  });

  router.get('/unread-count', async (req: AuthRequest, res: Response) => {
    try {
      const n = await prisma.siteMessage.count({
        where: { recipientId: req.user!.id, readAt: null },
      });
      res.json({ count: n });
    } catch (e) {
      console.error('[messages] unread-count', e);
      res.status(500).json({ error: 'Failed' });
    }
  });

  router.patch('/:id/read', async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { id } = req.params;
      const msg = await prisma.siteMessage.findFirst({
        where: { id, recipientId: userId },
      });
      if (!msg) return res.status(404).json({ error: 'Not found' });
      await prisma.siteMessage.update({
        where: { id },
        data: { readAt: new Date() },
      });
      res.json({ ok: true });
    } catch (e) {
      console.error('[messages] read', e);
      res.status(500).json({ error: 'Failed to mark read' });
    }
  });

  router.post('/link-contact', async (req: AuthRequest, res: Response) => {
    try {
      const senderId = req.user!.id;
      const body = req.body as {
        githubUsernames?: string[];
        subject?: string;
        message?: string;
        sendEmail?: boolean;
        fromEmail?: string;
      };
      const rawTargets = Array.isArray(body.githubUsernames) ? body.githubUsernames : [];
      const subject = (body.subject || '').trim();
      const message = (body.message || '').trim();
      const sendEmail = Boolean(body.sendEmail);
      const fromEmail = (body.fromEmail || '').trim();

      if (!subject || !message) {
        return res.status(400).json({ error: 'subject and message are required' });
      }
      if (subject.length > MAX_SUBJECT || message.length > MAX_BODY) {
        return res.status(400).json({ error: 'subject or message too long' });
      }

      const targets = [...new Set(rawTargets.map((u) => String(u).replace(/^@/, '').trim()).filter(Boolean))].slice(
        0,
        MAX_TARGETS,
      );
      if (targets.length === 0) {
        return res.status(400).json({ error: 'githubUsernames required' });
      }

      if (sendEmail && !fromEmail) {
        return res.status(400).json({ error: 'fromEmail is required when sendEmail is true' });
      }

      const sender = await prisma.user.findUnique({
        where: { id: senderId },
        select: { username: true, githubUsername: true },
      });
      if (!sender) return res.status(401).json({ error: 'User not found' });

      const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
      const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'clawlab.live';
      const baseUrl = `${protocol}://${host}`;

      const stampedBody = `【GITLINK · LINK】用户 @${sender.username}${
        sender.githubUsername ? `（GitHub: @${sender.githubUsername}）` : ''
      } 向你发来联系：\n\n${message}`;

      const token = getServerGitHubToken();
      const results: Array<{
        githubUsername: string;
        site: 'delivered' | 'queued' | 'skipped';
        email?: 'sent' | 'skipped' | 'failed' | 'no_address';
        detail?: string;
      }> = [];

      for (const gh of targets) {
        const ghLower = gh.toLowerCase();
        if (sender.githubUsername && ghLower === sender.githubUsername.toLowerCase()) {
          results.push({ githubUsername: gh, site: 'skipped', detail: '不能联系自己' });
          continue;
        }

        const recipient = await prisma.user.findFirst({
          where: { githubUsername: { equals: ghLower, mode: 'insensitive' } },
          select: { id: true },
        });

        const profileUrl = `${baseUrl}/codernet/github/${encodeURIComponent(ghLower)}`;
        const mailBody = `${stampedBody}\n\n---\n画像页：${profileUrl}`;

        if (recipient) {
          await prisma.siteMessage.create({
            data: {
              senderId,
              recipientId: recipient.id,
              subject,
              body: stampedBody,
              source: 'link',
            },
          });
          let email: 'sent' | 'skipped' | 'failed' | 'no_address' | undefined = 'skipped';
          let detail: string | undefined;
          if (sendEmail && fromEmail) {
            email = await trySendOutreachEmail(
              senderId,
              ghLower,
              subject,
              mailBody,
              profileUrl,
              fromEmail,
              sender.username,
              token,
            );
            if (email === 'skipped') detail = '外联邮件额度不足，仅站内信已送达';
          }
          results.push({ githubUsername: gh, site: 'delivered', email, detail });
        } else {
          await prisma.linkContactPending.create({
            data: {
              senderId,
              targetGithubUsername: ghLower,
              subject,
              body: stampedBody,
            },
          });
          let email: 'sent' | 'skipped' | 'failed' | 'no_address' | undefined = 'skipped';
          let detail: string | undefined;
          if (sendEmail && fromEmail) {
            email = await trySendOutreachEmail(
              senderId,
              ghLower,
              subject,
              mailBody,
              profileUrl,
              fromEmail,
              sender.username,
              token,
            );
            if (email === 'skipped') detail = '外联邮件额度不足；对方注册后将收到站内信';
          }
          results.push({ githubUsername: gh, site: 'queued', email, detail });
        }
      }

      res.json({ ok: true, results });
    } catch (e) {
      console.error('[messages] link-contact', e);
      res.status(500).json({ error: 'link-contact failed' });
    }
  });

  return router;
}
