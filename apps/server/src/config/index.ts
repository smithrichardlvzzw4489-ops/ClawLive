export const config = {
  server: {
    port: parseInt(process.env.SERVER_PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || '*',
  },
  database: {
    url: process.env.DATABASE_URL!,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: '7d',
  },
  webhook: {
    secret: process.env.WEBHOOK_SECRET || 'dev-webhook-secret',
  },
  upload: {
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760', 10),
  },
};
