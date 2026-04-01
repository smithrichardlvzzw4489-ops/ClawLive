import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { UPLOADS_DIR } from '../../lib/data-path';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { LoginRequest } from '@clawlive/shared-types';
import {
  provisionExternalLobsterJobPack,
  getExternalLobsterBridgeDocument,
} from '../../services/external-lobster-job-pack';
const router: IRouter = Router();

/** 注册头像：≤2MB，data URL */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function parseAvatarDataUrl(dataUrl: string): { buf: Buffer; ext: string } | null {
  if (!dataUrl.startsWith('data:')) return null;
  const m = dataUrl.match(/^data:image\/([\w+.-]+);base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  let ext = 'png';
  if (mime.includes('jpeg') || mime === 'jpg') ext = 'jpg';
  else if (mime === 'png') ext = 'png';
  else if (mime === 'gif') ext = 'gif';
  else if (mime === 'webp') ext = 'webp';
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0 || buf.length > MAX_AVATAR_BYTES) return null;
  return { buf, ext };
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password, avatar } = req.body as {
      username?: string;
      email?: string;
      password?: string;
      avatar?: string;
    };

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (typeof avatar !== 'string' || !avatar.trim()) {
      return res.status(400).json({ error: 'AVATAR_REQUIRED' });
    }

    const parsed = parseAvatarDataUrl(avatar);
    if (!parsed) {
      return res.status(400).json({ error: 'INVALID_AVATAR' });
    }

    const emailNorm = email && String(email).trim() ? String(email).trim() : undefined;

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          ...(emailNorm ? [{ email: emailNorm }] : []),
        ],
      },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        email: emailNorm,
        passwordHash,
      },
    });

    const dir = join(UPLOADS_DIR, 'avatars');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const filename = `${user.id}.${parsed.ext}`;
    const filepath = join(dir, filename);
    writeFileSync(filepath, parsed.buf);
    const avatarUrl = `/uploads/avatars/${filename}`;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl },
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
    const refreshToken = jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' } as jwt.SignOptions);

    const { passwordHash: _, litellmVirtualKey: __vk, ...userWithoutPassword } = updated;

    let externalLobsterJobPack: Awaited<ReturnType<typeof provisionExternalLobsterJobPack>> | null =
      null;
    try {
      externalLobsterJobPack = await provisionExternalLobsterJobPack(updated.id, updated.username);
    } catch (e) {
      console.error('[auth/register] provisionExternalLobsterJobPack:', e);
    }

    res.status(201).json({
      user: userWithoutPassword,
      token,
      refreshToken,
      ...(externalLobsterJobPack && {
        externalLobsterJobPack: {
          ...externalLobsterJobPack,
          note:
            'Open API Key 已写入你的「小龙虾接入」专属文档（含全文）。登录后打开顶部导航「小龙虾接入」或 /external-lobster-doc 一键复制发给外部小龙虾即可。',
        },
      }),
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password }: LoginRequest = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { username: String(username).trim() },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'USER_NOT_FOUND' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
    const refreshToken = jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' } as jwt.SignOptions);

    const { passwordHash: _, litellmVirtualKey: __vk, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
      token,
      refreshToken,
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

/**
 * GET /api/auth/external-lobster-doc
 * 返回注册时生成的接入文档全文（Markdown，内含真实 clw_ Key），仅本人可访问。
 */
router.get('/external-lobster-doc', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const doc = await getExternalLobsterBridgeDocument(req.user!.id);
    if (!doc) {
      return res.status(404).json({
        error: 'NO_DOCUMENT',
        message: '未找到接入文档（仅新注册用户会自动生成）',
      });
    }
    res.json(doc);
  } catch (error) {
    console.error('GET /api/auth/external-lobster-doc', error);
    res.status(500).json({ error: 'Failed to load document' });
  }
});

router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        bio: true,
        telegramId: true,
        clawPoints: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

const USERNAME_RE = /^[\w\u4e00-\u9fff]+$/;

router.patch('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const body = req.body as { username?: unknown; bio?: unknown };
    const data: { username?: string; bio?: string | null } = {};

    if (body.username !== undefined) {
      const u = String(body.username).trim();
      if (u.length < 2 || u.length > 32) {
        return res.status(400).json({ error: 'USERNAME_LENGTH' });
      }
      if (!USERNAME_RE.test(u)) {
        return res.status(400).json({ error: 'USERNAME_INVALID' });
      }
      data.username = u;
    }

    if (body.bio !== undefined) {
      if (body.bio === null || body.bio === '') {
        data.bio = null;
      } else {
        const b = String(body.bio).trim();
        if (b.length > 500) {
          return res.status(400).json({ error: 'BIO_TOO_LONG' });
        }
        data.bio = b || null;
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'NO_FIELDS' });
    }

    if (data.username) {
      const taken = await prisma.user.findFirst({
        where: { username: data.username, NOT: { id: userId } },
      });
      if (taken) {
        return res.status(409).json({ error: 'USERNAME_TAKEN' });
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        bio: true,
        telegramId: true,
        clawPoints: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(user);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const newToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);

    res.json({ token: newToken });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

export { router as authRoutes };
