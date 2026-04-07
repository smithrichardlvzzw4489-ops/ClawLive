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
  /** 积分：每 1 USD LLM 额度所需积分（默认 1000） */
  points: {
    perUsd: Math.max(1, parseInt(process.env.POINTS_PER_USD || '1000', 10)),
    minRedeem: Math.max(1, parseInt(process.env.MIN_REDEEM_POINTS || '100', 10)),
  },
  /** LiteLLM Proxy：虚拟 Key + 预算；未配置时兑换接口返回 503 */
  litellm: {
    baseUrl: (process.env.LITELLM_BASE_URL || '').replace(/\/$/, ''),
    masterKey: process.env.LITELLM_MASTER_KEY || '',
    /** 展示给用户配置 OpenClaw 的代理根地址，如 https://llm.example.com */
    publicBaseUrl: (process.env.LITELLM_PUBLIC_BASE_URL || process.env.LITELLM_BASE_URL || '').replace(
      /\/$/,
      ''
    ),
    models: (process.env.LITELLM_MODELS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  /**
   * Darwin 对话与 VibeKids 生成统一使用的 LiteLLM model id。
   * 可通过环境变量 PLATFORM_LLM_MODEL 覆盖（须与代理内已部署 id 一致）。
   */
  platformLlmModel:
    (process.env.PLATFORM_LLM_MODEL || 'openrouter/openai/gpt-4o-mini').trim() ||
    'openrouter/openai/gpt-4o-mini',
};
