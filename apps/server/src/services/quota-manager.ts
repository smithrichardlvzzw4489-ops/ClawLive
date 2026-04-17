/**
 * 用量配额管理 — 免费增值模型
 *
 * 每个已登录用户按月追踪以下维度的使用量：
 *   - gitlink_mine / gitlink_github / gitlink_link : GITLINK 三入口（免费档有次数上限，与招聘推荐额度分离）
 *   - profile_lookup : 其它画像类消耗（保留兼容）
 *   - search         : 其它语义检索（保留兼容；LINK 主入口已改用 gitlink_link）
 *   - outreach       : 批量触达邮件
 *   - jd_resume_match: MATH 页 JD×简历匹配（LLM）
 *   - recruitment_recommend : 招聘管理「按 JD 智能推荐」（全员月度额度；Pro/Team 更高）
 *
 * 数据持久化到 .data/quota-usage.json，启动时加载。
 */

import fs from 'fs';
import path from 'path';

/* ══════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════ */

export type QuotaDimension =
  | 'gitlink_mine'
  | 'gitlink_github'
  | 'gitlink_link'
  | 'profile_lookup'
  | 'search'
  | 'outreach'
  | 'jd_resume_match'
  | 'recruitment_recommend';

export interface QuotaTier {
  name: string;
  limits: Record<QuotaDimension, number>;
}

export interface UserQuotaUsage {
  userId: string;
  /** YYYY-MM format — used to detect month rollover */
  month: string;
  usage: Record<QuotaDimension, number>;
}

export interface QuotaCheckResult {
  allowed: boolean;
  dimension: QuotaDimension;
  used: number;
  limit: number;
  remaining: number;
  /** 0-1, triggers warning at 0.8+ */
  ratio: number;
  tier: string;
}

export interface QuotaStatus {
  tier: string;
  month: string;
  dimensions: Record<QuotaDimension, {
    used: number;
    limit: number;
    remaining: number;
    ratio: number;
  }>;
}

/* ══════════════════════════════════════════════════════════════
   Tier Definitions
   ══════════════════════════════════════════════════════════════ */

const TIERS: Record<string, QuotaTier> = {
  free: {
    name: 'Free',
    limits: {
      gitlink_mine: 24,
      gitlink_github: 24,
      gitlink_link: 36,
      profile_lookup: 20,
      search: 30,
      outreach: 10,
      jd_resume_match: 15,
      recruitment_recommend: 80,
    },
  },
  pro: {
    name: 'Pro',
    limits: {
      gitlink_mine: 200,
      gitlink_github: 200,
      gitlink_link: 600,
      profile_lookup: 200,
      search: 500,
      outreach: 100,
      jd_resume_match: 150,
      recruitment_recommend: 500,
    },
  },
  team: {
    name: 'Team',
    limits: {
      gitlink_mine: 2000,
      gitlink_github: 2000,
      gitlink_link: 8000,
      profile_lookup: 1000,
      search: 9999,
      outreach: 500,
      jd_resume_match: 2000,
      recruitment_recommend: 4000,
    },
  },
};

const ALL_DIMENSIONS: QuotaDimension[] = [
  'gitlink_mine',
  'gitlink_github',
  'gitlink_link',
  'profile_lookup',
  'search',
  'outreach',
  'jd_resume_match',
  'recruitment_recommend',
];

/* ══════════════════════════════════════════════════════════════
   Persistence
   ══════════════════════════════════════════════════════════════ */

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'quota-usage.json');

const usageMap = new Map<string, UserQuotaUsage>();
const userTierMap = new Map<string, string>();

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function loadFromDisk(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (Array.isArray(raw.usage)) {
        for (const entry of raw.usage) {
          usageMap.set(entry.userId, entry);
        }
      }
      if (raw.tiers && typeof raw.tiers === 'object') {
        for (const [uid, tier] of Object.entries(raw.tiers)) {
          userTierMap.set(uid, tier as string);
        }
      }
    }
  } catch {
    // start fresh
  }
}

function saveToDisk(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const payload = {
      usage: Array.from(usageMap.values()),
      tiers: Object.fromEntries(userTierMap),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2));
  } catch {
    // non-critical
  }
}

loadFromDisk();
setInterval(saveToDisk, 30_000);

/* ══════════════════════════════════════════════════════════════
   Internal helpers
   ══════════════════════════════════════════════════════════════ */

function getOrCreateUsage(userId: string): UserQuotaUsage {
  const month = currentMonth();
  const existing = usageMap.get(userId);

  if (existing && existing.month === month) {
    for (const d of ALL_DIMENSIONS) {
      const v = existing.usage[d];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        existing.usage[d] = 0;
      }
    }
    return existing;
  }

  const fresh: UserQuotaUsage = {
    userId,
    month,
    usage: {
      gitlink_mine: 0,
      gitlink_github: 0,
      gitlink_link: 0,
      profile_lookup: 0,
      search: 0,
      outreach: 0,
      jd_resume_match: 0,
      recruitment_recommend: 0,
    },
  };
  usageMap.set(userId, fresh);
  return fresh;
}

function getTier(userId: string): QuotaTier {
  const tierKey = userTierMap.get(userId) || 'free';
  return TIERS[tierKey] || TIERS.free;
}

/* ══════════════════════════════════════════════════════════════
   Public API
   ══════════════════════════════════════════════════════════════ */

/**
 * Check whether a user can perform an action. Does NOT increment usage.
 */
export function checkQuota(userId: string, dimension: QuotaDimension): QuotaCheckResult {
  const record = getOrCreateUsage(userId);
  const tier = getTier(userId);
  const used = record.usage[dimension] ?? 0;
  const limit = tier.limits[dimension] ?? 0;
  const remaining = Math.max(0, limit - used);
  const ratio = limit > 0 ? used / limit : 1;

  return {
    allowed: limit > 0 && used < limit,
    dimension,
    used,
    limit,
    remaining,
    ratio,
    tier: tier.name,
  };
}

/** 检查是否至少还剩 `need` 点额度（不扣减）。`need <= 0` 视为通过。 */
export function checkQuotaHasRemaining(userId: string, dimension: QuotaDimension, need: number): QuotaCheckResult {
  const base = checkQuota(userId, dimension);
  if (need <= 0) return base;
  const enough = base.remaining >= need;
  return {
    ...base,
    allowed: enough,
  };
}

/**
 * Increment usage by `count` (default 1). Returns the check result AFTER increment.
 * Should only be called after the action succeeds.
 */
export function consumeQuota(userId: string, dimension: QuotaDimension, count = 1): QuotaCheckResult {
  const record = getOrCreateUsage(userId);
  const cur = record.usage[dimension] ?? 0;
  record.usage[dimension] = cur + count;
  return checkQuota(userId, dimension);
}

/**
 * Get full quota status for a user across all dimensions.
 */
export function getQuotaStatus(userId: string): QuotaStatus {
  const record = getOrCreateUsage(userId);
  const tier = getTier(userId);

  const dimensions = {} as QuotaStatus['dimensions'];
  for (const dim of ALL_DIMENSIONS) {
    const used = record.usage[dim] ?? 0;
    const limit = tier.limits[dim];
    dimensions[dim] = {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      ratio: limit > 0 ? used / limit : 1,
    };
  }

  return {
    tier: tier.name,
    month: record.month,
    dimensions,
  };
}

/**
 * Set a user's tier. Mainly for admin / future payment integration.
 */
export function setUserTier(userId: string, tier: 'free' | 'pro' | 'team'): void {
  userTierMap.set(userId, tier);
}

/**
 * Express middleware helper: checks quota and returns 429 if exceeded.
 * Attach after authenticateToken.
 *
 * Usage:
 *   router.post('/search', authenticateToken, requireQuota('search'), handler)
 */
export function requireQuota(dimension: QuotaDimension) {
  return (req: any, res: any, next: any) => {
    const userId: string | undefined = req.user?.id;
    if (!userId) {
      // unauthenticated requests — apply a global IP-based rate limit fallback
      // For now, let them through (public endpoints might not have auth)
      return next();
    }

    const result = checkQuota(userId, dimension);

    // Attach quota headers for the frontend
    res.set('X-Quota-Limit', String(result.limit));
    res.set('X-Quota-Used', String(result.used));
    res.set('X-Quota-Remaining', String(result.remaining));
    res.set('X-Quota-Tier', result.tier);

    if (!result.allowed) {
      return res.status(429).json({
        error: '本月免费额度已用完',
        code: 'QUOTA_EXCEEDED',
        quota: {
          dimension,
          used: result.used,
          limit: result.limit,
          tier: result.tier,
          resetAt: nextMonthReset(),
        },
      });
    }

    next();
  };
}

function nextMonthReset(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toISOString();
}

export const QUOTA_DIMENSIONS = ALL_DIMENSIONS;
export const QUOTA_TIERS = TIERS;
