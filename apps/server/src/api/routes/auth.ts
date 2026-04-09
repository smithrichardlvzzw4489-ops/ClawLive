import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { UPLOADS_DIR } from '../../lib/data-path';
import { encrypt } from '../../lib/crypto';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { LoginRequest } from '@clawlive/shared-types';
import { runCrawlAndAnalysis } from './codernet';
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

    res.status(201).json({
      user: userWithoutPassword,
      token,
      refreshToken,
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
        githubUsername: true,
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

// ── GitHub OAuth ──────────────────────────────────────────────
const GITHUB_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET || '';

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  email: string | null;
  name: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

router.post('/github', async (req: Request, res: Response) => {
  try {
    const { code } = req.body as { code?: string };
    if (!code) {
      return res.status(400).json({ error: 'GitHub authorization code is required' });
    }
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return res.status(500).json({ error: 'GitHub OAuth is not configured on the server' });
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenData = (await tokenRes.json()) as GitHubTokenResponse;
    if (tokenData.error || !tokenData.access_token) {
      return res.status(401).json({
        error: 'GITHUB_AUTH_FAILED',
        detail: tokenData.error_description || tokenData.error || 'Failed to exchange code',
      });
    }

    const ghHeaders = {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/json',
      'User-Agent': 'ClawLab-OAuth',
    };

    const [userRes, emailsRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers: ghHeaders }),
      fetch('https://api.github.com/user/emails', { headers: ghHeaders }),
    ]);
    if (!userRes.ok) {
      return res.status(401).json({ error: 'GITHUB_AUTH_FAILED', detail: 'Failed to fetch GitHub user' });
    }
    const ghUser = (await userRes.json()) as GitHubUser;
    const githubId = String(ghUser.id);

    let primaryEmail: string | null = ghUser.email;
    if (!primaryEmail && emailsRes.ok) {
      const emails = (await emailsRes.json()) as GitHubEmail[];
      const primary = emails.find((e) => e.primary && e.verified);
      if (primary) primaryEmail = primary.email;
      else if (emails.length > 0 && emails[0].verified) primaryEmail = emails[0].email;
    }

    const encryptedGhToken = encrypt(tokenData.access_token);

    let user = await prisma.user.findUnique({ where: { githubId } });

    if (!user) {
      let username = ghUser.login;
      const taken = await prisma.user.findUnique({ where: { username } });
      if (taken) {
        username = `${ghUser.login}_gh`;
        const taken2 = await prisma.user.findUnique({ where: { username } });
        if (taken2) username = `gh_${githubId.slice(-6)}`;
      }

      user = await prisma.user.create({
        data: {
          githubId,
          username,
          email: primaryEmail || undefined,
          avatarUrl: ghUser.avatar_url || undefined,
          githubUsername: ghUser.login,
          githubAccessToken: encryptedGhToken,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          githubUsername: ghUser.login,
          githubAccessToken: encryptedGhToken,
          avatarUrl: user.avatarUrl || ghUser.avatar_url || undefined,
        },
      });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
    const refreshToken = jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' } as jwt.SignOptions);

    const { passwordHash: _, litellmVirtualKey: __vk, githubAccessToken: __gat, ...userWithoutSensitive } = user;

    res.json({ user: userWithoutSensitive, token, refreshToken });

    runCrawlAndAnalysis(user.id, encryptedGhToken, ghUser.login, user.username).catch((err) =>
      console.error('[Auth] post-login Codernet crawl failed:', err),
    );
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    res.status(500).json({ error: 'GitHub login failed' });
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
