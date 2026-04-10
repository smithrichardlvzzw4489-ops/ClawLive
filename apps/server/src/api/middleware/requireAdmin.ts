import { Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import type { AuthRequest } from './auth';

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  if (!row?.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
