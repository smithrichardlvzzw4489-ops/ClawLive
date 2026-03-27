/**
 * /api/platform — 平台配置
 *   GET  /api/platform/models       公开，返回模型列表
 *   POST /api/platform/models       写入（需 ADMIN_SECRET 或 LITELLM_MASTER_KEY）
 */
import { Router, Request, Response } from 'express';
import {
  loadPlatformModels,
  savePlatformModels,
  PlatformModel,
} from '../../services/platform-models';

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
    const config = loadPlatformModels();
    return res.json(config);
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

  return router;
}
