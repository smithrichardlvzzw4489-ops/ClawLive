/**
 * 虾米技能积分计费服务
 *
 * 计费规则：
 *  - 部分工具（调用外部付费 API 或消耗服务器资源）按次收取积分
 *  - 每个工具每天有免费调用次数（存于内存，服务重启重置）
 *  - 积分不足时返回错误，前端/虾米提示用户充值
 *  - 所有扣费写入 PointLedger，便于对账
 */
import { prisma } from '../lib/prisma';

// ─── 工具级别收费配置 ──────────────────────────────────────────────────────────

export interface ToolCreditConfig {
  /** 每次调用扣除的积分（0 = 免费） */
  costPerCall: number;
  /** 每用户每天的免费调用次数 */
  freeDailyQuota: number;
}

/**
 * 工具收费表。
 * 只有使用外部付费 API 或消耗服务器资源的工具才收费。
 * 数字可通过环境变量 SKILL_CREDIT_xxx 覆盖（方便运营调整）。
 */
export const TOOL_CREDIT_CONFIG: Record<string, ToolCreditConfig> = {
  web_search: {
    costPerCall: parseInt(process.env.SKILL_CREDIT_WEB_SEARCH ?? '2', 10),
    freeDailyQuota: parseInt(process.env.SKILL_FREE_WEB_SEARCH ?? '5', 10),
  },
  browser_open: {
    costPerCall: parseInt(process.env.SKILL_CREDIT_BROWSER_OPEN ?? '1', 10),
    freeDailyQuota: parseInt(process.env.SKILL_FREE_BROWSER_OPEN ?? '10', 10),
  },
  browser_get_content: {
    costPerCall: parseInt(process.env.SKILL_CREDIT_BROWSER_GET_CONTENT ?? '1', 10),
    freeDailyQuota: parseInt(process.env.SKILL_FREE_BROWSER_GET_CONTENT ?? '10', 10),
  },
  browser_screenshot: {
    costPerCall: parseInt(process.env.SKILL_CREDIT_BROWSER_SCREENSHOT ?? '2', 10),
    freeDailyQuota: parseInt(process.env.SKILL_FREE_BROWSER_SCREENSHOT ?? '5', 10),
  },
  browser_click: {
    costPerCall: parseInt(process.env.SKILL_CREDIT_BROWSER_CLICK ?? '1', 10),
    freeDailyQuota: parseInt(process.env.SKILL_FREE_BROWSER_CLICK ?? '10', 10),
  },
  browser_type: {
    costPerCall: parseInt(process.env.SKILL_CREDIT_BROWSER_TYPE ?? '1', 10),
    freeDailyQuota: parseInt(process.env.SKILL_FREE_BROWSER_TYPE ?? '10', 10),
  },
};

// ─── 免费额度追踪（内存，重启重置） ────────────────────────────────────────────

/**
 * key 格式：`${userId}::${toolName}::${dateString}`
 * value：今日已使用免费次数
 */
const freeUsageTracker = new Map<string, number>();

function freeUsageKey(userId: string, toolName: string): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${userId}::${toolName}::${today}`;
}

function getFreeUsed(userId: string, toolName: string): number {
  return freeUsageTracker.get(freeUsageKey(userId, toolName)) ?? 0;
}

function incrementFreeUsed(userId: string, toolName: string): void {
  const key = freeUsageKey(userId, toolName);
  freeUsageTracker.set(key, (freeUsageTracker.get(key) ?? 0) + 1);
}

// ─── 积分扣费主函数 ────────────────────────────────────────────────────────────

export interface CreditCheckResult {
  /** true = 允许执行工具 */
  allowed: boolean;
  /** 本次实际扣除积分（0 = 使用免费额度） */
  charged: number;
  /** 扣费后用户积分余额 */
  balanceAfter?: number;
  /** 错误原因（余额不足等） */
  reason?: string;
  /** 是否使用的免费额度 */
  usedFreeQuota: boolean;
}

/**
 * 调用工具前检查并扣除积分。
 * 如果该工具不在收费表中，直接返回 allowed=true。
 */
export async function checkAndChargeCredits(
  userId: string,
  toolName: string,
): Promise<CreditCheckResult> {
  const cfg = TOOL_CREDIT_CONFIG[toolName];

  // 工具不收费
  if (!cfg || cfg.costPerCall <= 0) {
    return { allowed: true, charged: 0, usedFreeQuota: false };
  }

  // 检查免费额度
  const freeUsed = getFreeUsed(userId, toolName);
  if (freeUsed < cfg.freeDailyQuota) {
    incrementFreeUsed(userId, toolName);
    return { allowed: true, charged: 0, usedFreeQuota: true };
  }

  // 需要扣积分
  const cost = cfg.costPerCall;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { clawPoints: true },
      });
      if (!user) throw new Error('USER_NOT_FOUND');
      if (user.clawPoints < cost) throw new Error('INSUFFICIENT_POINTS');

      const updated = await tx.user.update({
        where: { id: userId },
        data: { clawPoints: { decrement: cost } },
        select: { clawPoints: true },
      });

      await tx.pointLedger.create({
        data: {
          userId,
          delta: -cost,
          balanceAfter: updated.clawPoints,
          reason: 'skill_tool_call',
          metadata: { tool: toolName, costPerCall: cost },
        },
      });

      return updated.clawPoints;
    });

    return { allowed: true, charged: cost, balanceAfter: result, usedFreeQuota: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'INSUFFICIENT_POINTS') {
      return {
        allowed: false,
        charged: 0,
        usedFreeQuota: false,
        reason: `积分不足（需 ${cost} 积分）。请前往「积分中心」充值后再使用网页搜索等高级功能。`,
      };
    }
    console.error('[SkillCredits] charge error:', e);
    // 查询失败时放行，避免影响用户体验
    return { allowed: true, charged: 0, usedFreeQuota: false };
  }
}

/**
 * 社区付费技能调用时，向调用方扣费并向作者结算收益。
 * @param callerId   调用技能的用户 ID
 * @param authorId   技能作者 ID
 * @param skillId    技能 ID（用于日志）
 * @param creditCost 技能定价（积分）
 * @param feeRate    平台抽成比例（0-1）
 */
export async function chargeAndSettleCommunitySkill(
  callerId: string,
  authorId: string,
  skillId: string,
  creditCost: number,
  feeRate: number,
): Promise<CreditCheckResult> {
  if (creditCost <= 0) return { allowed: true, charged: 0, usedFreeQuota: false };

  const authorEarns = Math.floor(creditCost * (1 - feeRate));

  try {
    const balanceAfter = await prisma.$transaction(async (tx) => {
      // 扣调用方积分
      const caller = await tx.user.findUnique({
        where: { id: callerId },
        select: { clawPoints: true },
      });
      if (!caller) throw new Error('USER_NOT_FOUND');
      if (caller.clawPoints < creditCost) throw new Error('INSUFFICIENT_POINTS');

      const updatedCaller = await tx.user.update({
        where: { id: callerId },
        data: { clawPoints: { decrement: creditCost } },
        select: { clawPoints: true },
      });
      await tx.pointLedger.create({
        data: {
          userId: callerId,
          delta: -creditCost,
          balanceAfter: updatedCaller.clawPoints,
          reason: 'community_skill_use',
          metadata: { skillId, authorId, creditCost, feeRate },
        },
      });

      // 结算给作者
      if (authorEarns > 0 && authorId !== callerId) {
        const updatedAuthor = await tx.user.update({
          where: { id: authorId },
          data: { clawPoints: { increment: authorEarns } },
          select: { clawPoints: true },
        });
        await tx.pointLedger.create({
          data: {
            userId: authorId,
            delta: authorEarns,
            balanceAfter: updatedAuthor.clawPoints,
            reason: 'community_skill_revenue',
            metadata: { skillId, callerId, creditCost, authorEarns, feeRate },
          },
        });

        // 更新 installCount（调用次数近似）
        await tx.publishedSkill.update({
          where: { id: skillId },
          data: { installCount: { increment: 1 } },
        });
      }

      return updatedCaller.clawPoints;
    });

    return { allowed: true, charged: creditCost, balanceAfter, usedFreeQuota: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'INSUFFICIENT_POINTS') {
      return {
        allowed: false,
        charged: 0,
        usedFreeQuota: false,
        reason: `积分不足（需 ${creditCost} 积分）。此技能由社区创作者提供，每次调用消耗 ${creditCost} 积分。`,
      };
    }
    console.error('[SkillCredits] community settle error:', e);
    return { allowed: true, charged: 0, usedFreeQuota: false };
  }
}

/** 查询工具对当前用户的剩余免费次数（今日） */
export function getRemainingFreeQuota(userId: string, toolName: string): number {
  const cfg = TOOL_CREDIT_CONFIG[toolName];
  if (!cfg) return Infinity;
  const used = getFreeUsed(userId, toolName);
  return Math.max(0, cfg.freeDailyQuota - used);
}

/** 获取所有收费工具的配置（供前端展示） */
export function getToolCreditTable(): Array<ToolCreditConfig & { toolName: string }> {
  return Object.entries(TOOL_CREDIT_CONFIG).map(([toolName, cfg]) => ({
    toolName,
    ...cfg,
  }));
}
