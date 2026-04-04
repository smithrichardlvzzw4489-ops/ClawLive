"use client";

import { addBonusXp } from "@/lib/client-gamification";

const POINTS_KEY = "vibekids-creator-points-v1";
const SPOTLIGHT_CREDIT_KEY = "vibekids-spotlight-credit-v1";

export function loadCreatorPoints(): number {
  if (typeof window === "undefined") return 0;
  try {
    const n = Number(localStorage.getItem(POINTS_KEY));
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function savePoints(n: number): void {
  try {
    localStorage.setItem(POINTS_KEY, String(Math.max(0, Math.floor(n))));
    window.dispatchEvent(new CustomEvent("vibekids-creator-points-updated"));
  } catch {
    /* */
  }
}

/** 保存作品等场景发放的创作积分（可兑现） */
export function earnCreatorPoints(amount: number): number {
  const next = loadCreatorPoints() + Math.max(0, Math.floor(amount));
  savePoints(next);
  return next;
}

export const REDEEM = {
  xp50: { cost: 80, label: "兑换 +50 经验" },
  spotlight: { cost: 150, label: "精选曝光券（下次保存加权上首页）" },
} as const;

export function tryRedeem(kind: keyof typeof REDEEM): {
  ok: boolean;
  message: string;
} {
  const cfg = REDEEM[kind];
  const cur = loadCreatorPoints();
  if (cur < cfg.cost) {
    return { ok: false, message: `积分不足（需要 ${cfg.cost}）` };
  }
  savePoints(cur - cfg.cost);

  if (kind === "xp50") {
    addBonusXp(50);
    return { ok: true, message: "已兑换 +50 经验" };
  }

  try {
    localStorage.setItem(SPOTLIGHT_CREDIT_KEY, "1");
  } catch {
    savePoints(cur);
    return { ok: false, message: "写入失败，请重试" };
  }
  return {
    ok: true,
    message: "已获得精选曝光券：下次在创作室保存作品时将自动加权进「精选展示」",
  };
}

export function hasSpotlightCredit(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SPOTLIGHT_CREDIT_KEY) === "1";
  } catch {
    return false;
  }
}

export function consumeSpotlightCredit(): void {
  try {
    localStorage.removeItem(SPOTLIGHT_CREDIT_KEY);
  } catch {
    /* */
  }
}
