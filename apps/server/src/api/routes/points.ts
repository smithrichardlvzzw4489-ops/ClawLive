import { Router, Response } from 'express';
import type { IRouter } from 'express';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  generateVirtualKey,
  increaseVirtualKeyBudget,
  isLitellmConfigured,
  LitellmNotConfiguredError,
} from '../../services/litellm-budget';
import { testLiteLLMWithMasterKey, testLiteLLMWithVirtualKey } from '../../services/llm';

function maskVirtualKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function pointsRoutes(): IRouter {
  const router = Router();

  router.get('/llm', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { clawPoints: true, litellmVirtualKey: true },
      });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({
        clawPoints: user.clawPoints,
        pointsPerUsd: config.points.perUsd,
        minRedeemPoints: config.points.minRedeem,
        litellmConfigured: isLitellmConfigured(),
        litellmProxyBaseUrl: config.litellm.publicBaseUrl || null,
        litellmModels: config.litellm.models,
        virtualKeyMasked: maskVirtualKey(user.litellmVirtualKey),
        hasVirtualKey: Boolean(user.litellmVirtualKey),
      });
    } catch (e) {
      console.error('GET /api/points/llm', e);
      res.status(500).json({ error: 'Failed to load points' });
    }
  });

  /**
   * 调试 LiteLLM：POST body 可选 { message?: string, useVirtualKey?: boolean }
   * - 默认用 Master Key 测通代理+上游
   * - useVirtualKey=true 时用当前用户已保存的虚拟 Key（需先兑换过）
   */
  router.post('/llm/test', authenticateToken, async (req: AuthRequest, res: Response) => {
    const body = req.body as { message?: unknown; useVirtualKey?: unknown; model?: unknown };
    const message = typeof body.message === 'string' ? body.message : undefined;
    const model = typeof body.model === 'string' ? body.model : undefined;
    const useVirtualKey = body.useVirtualKey === true;

    if (!isLitellmConfigured()) {
      return res.status(503).json({ error: 'LITELLM_NOT_CONFIGURED' });
    }

    try {
      if (useVirtualKey) {
        const userId = req.user!.id;
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { litellmVirtualKey: true },
        });
        if (!user?.litellmVirtualKey) {
          return res.status(400).json({ error: 'NO_VIRTUAL_KEY' });
        }
        const result = await testLiteLLMWithVirtualKey(user.litellmVirtualKey, message, model);
        return res.json({ ok: true, mode: 'virtual', ...result });
      }
      const result = await testLiteLLMWithMasterKey(message, model);
      return res.json({ ok: true, mode: 'master', ...result });
    } catch (e) {
      console.error('POST /api/points/llm/test', e);
      const detail = e instanceof Error ? e.message : String(e);
      return res.status(502).json({
        error: `LLM_TEST_FAILED: ${detail}`,
      });
    }
  });

  /** 仅用于前端展示完整虚拟 Key（勿打日志）；需登录 */
  router.get('/llm/virtual-key', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { litellmVirtualKey: true },
      });
      if (!user?.litellmVirtualKey) {
        return res.status(404).json({ error: 'NO_VIRTUAL_KEY' });
      }
      res.json({ virtualKey: user.litellmVirtualKey });
    } catch (e) {
      console.error('GET /api/points/llm/virtual-key', e);
      res.status(500).json({ error: 'Failed to load key' });
    }
  });

  /**
   * body: { clawPoints: number } — 按 POINTS_PER_USD 换算为 USD，调用 LiteLLM 增预算
   */
  router.post('/redeem-llm', authenticateToken, async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;
    const idempotencyKey =
      typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'].trim() : '';

    const raw = (req.body as { clawPoints?: unknown })?.clawPoints;
    const clawPoints = typeof raw === 'number' ? Math.floor(raw) : parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(clawPoints) || clawPoints < config.points.minRedeem) {
      return res.status(400).json({
        error: `INVALID_POINTS`,
        minRedeemPoints: config.points.minRedeem,
      });
    }

    if (!isLitellmConfigured()) {
      return res.status(503).json({ error: 'LITELLM_NOT_CONFIGURED' });
    }

    if (idempotencyKey) {
      const existing = await prisma.pointLedger.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        if (existing.userId !== userId) {
          return res.status(409).json({ error: 'IDEMPOTENCY_CONFLICT' });
        }
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: { clawPoints: true, litellmVirtualKey: true },
        });
        return res.json({
          ok: true,
          idempotent: true,
          clawPoints: u?.clawPoints ?? 0,
          virtualKeyMasked: maskVirtualKey(u?.litellmVirtualKey),
        });
      }
    }

    const usd = clawPoints / config.points.perUsd;
    if (usd <= 0 || !Number.isFinite(usd)) {
      return res.status(400).json({ error: 'INVALID_USD' });
    }

    let newBalance = 0;
    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          throw new Error('NOT_FOUND');
        }
        if (user.clawPoints < clawPoints) {
          throw new Error('INSUFFICIENT_POINTS');
        }
        const updated = await tx.user.update({
          where: { id: userId },
          data: { clawPoints: { decrement: clawPoints } },
          select: { clawPoints: true, litellmVirtualKey: true },
        });
        newBalance = updated.clawPoints;
        await tx.pointLedger.create({
          data: {
            userId,
            delta: -clawPoints,
            balanceAfter: newBalance,
            reason: 'redeem_llm',
            idempotencyKey: idempotencyKey || null,
            metadata: { usd, pointsPerUsd: config.points.perUsd },
          },
        });
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'INSUFFICIENT_POINTS') {
        return res.status(400).json({ error: 'INSUFFICIENT_POINTS' });
      }
      if (msg === 'NOT_FOUND') {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('redeem-llm tx', e);
      return res.status(500).json({ error: 'TRANSACTION_FAILED' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { litellmVirtualKey: true },
      });
      const models = config.litellm.models;
      if (!user?.litellmVirtualKey) {
        const { key } = await generateVirtualKey({
          userId,
          maxBudgetUsd: usd,
          models,
        });
        await prisma.user.update({
          where: { id: userId },
          data: { litellmVirtualKey: key },
        });
      } else {
        await increaseVirtualKeyBudget(user.litellmVirtualKey, usd);
      }
    } catch (e) {
      if (e instanceof LitellmNotConfiguredError) {
        return res.status(503).json({ error: 'LITELLM_NOT_CONFIGURED' });
      }
      console.error('redeem-llm litellm', e);
      try {
        await prisma.$transaction(async (tx) => {
          const updated = await tx.user.update({
            where: { id: userId },
            data: { clawPoints: { increment: clawPoints } },
            select: { clawPoints: true },
          });
          await tx.pointLedger.create({
            data: {
              userId,
              delta: clawPoints,
              balanceAfter: updated.clawPoints,
              reason: 'redeem_llm_refund',
              metadata: { error: e instanceof Error ? e.message : String(e) },
            },
          });
        });
      } catch (refundErr) {
        console.error('redeem-llm refund failed', refundErr);
      }
      return res.status(502).json({
        error: 'LITELLM_ERROR',
        message: e instanceof Error ? e.message : 'LiteLLM request failed',
      });
    }

    const finalUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { clawPoints: true, litellmVirtualKey: true },
    });

    res.json({
      ok: true,
      clawPoints: finalUser?.clawPoints ?? newBalance,
      usdCredited: usd,
      virtualKeyMasked: maskVirtualKey(finalUser?.litellmVirtualKey),
      litellmProxyBaseUrl: config.litellm.publicBaseUrl || null,
    });
  });

  return router;
}
