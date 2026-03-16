import { Router, Request, Response } from 'express';
import type { IRouter } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { LoginRequest } from '@clawlive/shared-types';

const prisma = new PrismaClient();
const router: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email: email || '' },
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
        email,
        passwordHash,
      },
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
    const refreshToken = jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' } as jwt.SignOptions);

    const { passwordHash: _, ...userWithoutPassword } = user;

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
      where: { username },
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
    const refreshToken = jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' } as jwt.SignOptions);

    const { passwordHash: _, ...userWithoutPassword } = user;

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
    // Return user info from JWT token (no DB access)
    const userId = req.user!.id;
    
    // For simplified version, return mock user data
    const user = {
      id: userId,
      username: 'test-host',
      email: 'test@example.com',
      avatarUrl: null,
      telegramId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
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
