import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many comments, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || 'unknown';
  },
});

export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  message: { error: 'Webhook rate limit exceeded' },
  keyGenerator: (req) => {
    return req.params.roomId || req.ip || 'unknown';
  },
});
