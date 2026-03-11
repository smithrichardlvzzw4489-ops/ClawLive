import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-webhook-secret';

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

  const body = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  if (signature !== expectedSignature) {
    res.status(403).json({ error: 'Invalid webhook signature' });
    return;
  }

  next();
}
