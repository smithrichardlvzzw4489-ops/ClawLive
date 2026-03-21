import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// 与 rooms-simple / telegram-bridge 使用同一默认值，否则 Agent 回复 webhook 验证失败 (403)
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-webhook-secret-change-in-production';

export function verifyWebhookSignature(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const signature = req.headers['x-webhook-signature'] as string;

  if (!signature) {
    res.status(401).json({ error: 'Webhook signature required' });
    return;
  }

  // 使用 raw body 验签，避免 JSON 序列化 key 顺序不同导致签名不匹配
  const rawReq = req as Request & { rawBody?: Buffer };
  const bodyToVerify = rawReq.rawBody ? rawReq.rawBody.toString('utf8') : JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(bodyToVerify)
    .digest('hex');

  if (signature !== expectedSignature) {
    console.warn('[Webhook] Invalid signature, body length:', bodyToVerify.length);
    res.status(403).json({ error: 'Invalid webhook signature' });
    return;
  }

  next();
}
