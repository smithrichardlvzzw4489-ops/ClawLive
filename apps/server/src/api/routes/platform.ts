/**
 * /api/platform — 平台配置 + Token 用量
 *   GET  /api/platform/models             公开，返回模型列表
 *   POST /api/platform/models             写入（需 ADMIN_SECRET）
 *   GET  /api/platform/token-usage        Token 用量概要
 *   GET  /api/platform/token-usage/:user  某用户画像的 Token 消耗
 */
import { Router, Request, Response } from 'express';
import {
  loadPlatformModels,
  savePlatformModels,
  PlatformModel,
} from '../../services/platform-models';
import {
  getTokenUsageSummary,
  getProfileTokenCost,
  type TokenFeature,
} from '../../services/token-tracker';

function isAdminRequest(req: Request): boolean {
  // 只使用独立的 ADMIN_SECRET，绝不暴露 LITELLM_MASTER_KEY
  const adminSecret = process.env.ADMIN_SECRET || '';
  if (!adminSecret) return true; // 未配置时开发模式放行
  const provided =
    req.headers['x-admin-secret'] as string | undefined ||
    (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '');
  return provided === adminSecret;
}

export function platformRoutes(): Router {
  const router = Router();

  /** GET /api/platform/models */
  router.get('/models', (_req: Request, res: Response) => {
    const cfg = loadPlatformModels();
    return res.json(cfg);
  });

  /** GET /api/platform/litellm-models — 查询 LiteLLM 实际部署的模型列表 */
  router.get('/litellm-models', async (_req: Request, res: Response) => {
    const { config } = await import('../../config/index');
    const base = config.litellm.baseUrl;
    const masterKey = config.litellm.masterKey;
    if (!base || !masterKey) {
      return res.json({ models: [] });
    }
    try {
      const resp = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${masterKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return res.json({ models: [] });
      const data = (await resp.json()) as { data?: Array<{ id: string }> };
      const models = (data.data || []).map((m) => ({ id: m.id, name: m.id }));
      return res.json({ models });
    } catch {
      return res.json({ models: [] });
    }
  });

  /** POST /api/platform/models */
  router.post('/models', async (req: Request, res: Response) => {
    if (!isAdminRequest(req)) {
      return res.status(403).json({ error: '需要管理员权限' });
    }
    const { models } = req.body as { models?: PlatformModel[] };
    if (!Array.isArray(models)) {
      return res.status(400).json({ error: 'models 必须是数组' });
    }
    // 简单校验每条记录
    const valid = models.every(
      (m) => typeof m.id === 'string' && typeof m.name === 'string' && typeof m.enabled === 'boolean',
    );
    if (!valid) {
      return res.status(400).json({ error: '每条模型需包含 id(string)、name(string)、enabled(boolean)' });
    }
    await savePlatformModels(models);
    return res.json({ success: true, models });
  });

  /* ── Token Usage ────────────────────────────────────────── */

  /**
   * GET /api/platform/token-usage
   * Returns aggregated token consumption stats.
   * Query params: since (epoch ms), feature (TokenFeature), limit (number)
   */
  router.get('/token-usage', (req: Request, res: Response) => {
    const since = req.query.since ? Number(req.query.since) : undefined;
    const feature = req.query.feature as TokenFeature | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const summary = getTokenUsageSummary({ since, feature, limit });
    return res.json(summary);
  });

  /**
   * GET /api/platform/token-usage/profile/:username
   * Returns token cost for generating a specific user's profile.
   */
  router.get('/token-usage/profile/:username', (req: Request, res: Response) => {
    const cost = getProfileTokenCost(req.params.username);
    return res.json(cost);
  });

  return router;
}
