"use client";

import type { AgeBand } from "@/lib/age";
import type { CreativeKind, VibeStyle } from "@/lib/creative";

const STORAGE_KEY = "vibekids-gamification-v1";
const DRAFT_KEY = "vibekids-draft-v1";

export type GamificationState = {
  xp: number;
  generationCount: number;
  saveCount: number;
  streak: number;
  lastStreakDate: string;
  /** 最近一次成功生成的本地日期 YYYY-MM-DD，用于成人向习惯提醒 */
  lastGenDate?: string;
  /** 最近一次保存的本地日期 */
  lastSaveDate?: string;
  badges: string[];
};

const DEFAULT_G: GamificationState = {
  xp: 0,
  generationCount: 0,
  saveCount: 0,
  streak: 0,
  lastStreakDate: "",
  badges: [],
};

export type StudioDraft = {
  prompt: string;
  kind: CreativeKind;
  styles: VibeStyle[];
  age: AgeBand;
  saveTitle: string;
  refinePrompt: string;
  lockHint: string;
  /** 最多保留 2 份 html 草稿，控制体积 */
  versList: string[];
  versIndex: number;
};

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = new Date(ay!, am! - 1, ad!).getTime();
  const db = new Date(by!, bm! - 1, bd!).getTime();
  return Math.round((db - da) / 86400000);
}

export function loadGamification(): GamificationState {
  if (typeof window === "undefined") return { ...DEFAULT_G };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_G };
    const p = JSON.parse(raw) as Partial<GamificationState>;
    return {
      ...DEFAULT_G,
      ...p,
      badges: Array.isArray(p.badges) ? p.badges : [],
      lastGenDate: typeof p.lastGenDate === "string" ? p.lastGenDate : undefined,
      lastSaveDate: typeof p.lastSaveDate === "string" ? p.lastSaveDate : undefined,
    };
  } catch {
    return { ...DEFAULT_G };
  }
}

function saveGamification(g: GamificationState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(g));
  } catch {
    /* quota */
  }
}

function unlockBadges(g: GamificationState): string[] {
  const b = new Set(g.badges);
  if (g.generationCount >= 1) b.add("first_gen");
  if (g.generationCount >= 5) b.add("gen_5");
  if (g.saveCount >= 1) b.add("first_save");
  if (g.saveCount >= 3) b.add("save_3");
  if (g.streak >= 3) b.add("streak_3");
  if (g.streak >= 7) b.add("streak_7");
  if (g.xp >= 500) b.add("xp_500");
  return [...b];
}

/** 每次进入创作室调用：更新连续天数 */
export function touchStreak(): GamificationState {
  const g = loadGamification();
  const t = todayLocal();
  if (!g.lastStreakDate) {
    g.streak = 1;
    g.lastStreakDate = t;
  } else if (g.lastStreakDate === t) {
    /* same day */
  } else {
    const diff = dayDiff(g.lastStreakDate, t);
    if (diff === 1) g.streak += 1;
    else g.streak = 1;
    g.lastStreakDate = t;
  }
  g.badges = unlockBadges(g);
  saveGamification(g);
  return g;
}

export type GamificationReward = {
  state: GamificationState;
  /** 本次在基础经验外的随机加成（变量奖励） */
  bonusXp: number;
};

function rollBonus(max: number): number {
  return Math.floor(Math.random() * (max + 1));
}

function isWeekend(): boolean {
  const d = new Date().getDay();
  return d === 0 || d === 6;
}

export type GamificationRewardDetail = GamificationReward & {
  /** 本次动作获得的总 XP（含基础+随机+暴击+周末倍率） */
  totalXp: number;
  megaCrit: boolean;
  weekendBoost: boolean;
};

/** 成功生成：基础 10 + 随机 0～15；约 5% 超级暴击 +50；周末整体 ×1.5 */
export function recordGenerationSuccess(): GamificationRewardDetail {
  const g = loadGamification();
  const t = todayLocal();
  g.generationCount += 1;
  let add = 10 + rollBonus(15);
  const megaCrit = Math.random() < 0.05;
  if (megaCrit) add += 50;
  const weekendBoost = isWeekend();
  if (weekendBoost) add = Math.round(add * 1.5);
  g.xp += add;
  g.lastGenDate = t;
  g.badges = unlockBadges(g);
  saveGamification(g);
  return {
    state: g,
    bonusXp: add - 10,
    totalXp: add,
    megaCrit,
    weekendBoost,
  };
}

/** 保存作品：基础 25 + 随机 0～20；约 5% 额外 +35；周末 ×1.5 */
export function recordSaveSuccess(): GamificationRewardDetail {
  const g = loadGamification();
  const t = todayLocal();
  g.saveCount += 1;
  let add = 25 + rollBonus(20);
  const megaCrit = Math.random() < 0.05;
  if (megaCrit) add += 35;
  const weekendBoost = isWeekend();
  if (weekendBoost) add = Math.round(add * 1.5);
  g.xp += add;
  g.lastSaveDate = t;
  g.badges = unlockBadges(g);
  saveGamification(g);
  return {
    state: g,
    bonusXp: add - 25,
    totalXp: add,
    megaCrit,
    weekendBoost,
  };
}

/** 周任务等额外奖励 */
export function addBonusXp(amount: number): GamificationState {
  const g = loadGamification();
  g.xp += Math.max(0, Math.floor(amount));
  g.badges = unlockBadges(g);
  saveGamification(g);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("vibekids-gamification-refresh"));
  }
  return g;
}

/** 晚间习惯提醒：连续天数较高且今日尚未生成时，轻量 FOMO */
export function getEngagementNudge(g: GamificationState): string | null {
  const t = todayLocal();
  const h = new Date().getHours();
  if (
    g.streak >= 3 &&
    g.lastGenDate &&
    g.lastGenDate !== t &&
    h >= 19
  ) {
    return `已连续 ${g.streak} 天 · 今晚生成一次可稳住节奏（生成有随机经验加成）`;
  }
  return null;
}

export function levelFromXp(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

export function xpIntoCurrentLevel(xp: number): { level: number; pct: number } {
  const level = levelFromXp(xp);
  const base = (level - 1) * 100;
  const pct = Math.min(100, Math.round(((xp - base) / 100) * 100));
  return { level, pct };
}

export function loadDraft(): StudioDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as StudioDraft;
    if (!d.versList || !Array.isArray(d.versList)) return null;
    return d;
  } catch {
    return null;
  }
}

const MAX_DRAFT_BYTES = 350_000;

export function saveDraft(d: StudioDraft): void {
  try {
    const json = JSON.stringify(d);
    if (json.length > MAX_DRAFT_BYTES) {
      const one = d.versList[d.versIndex];
      if (one) {
        d = { ...d, versList: [one], versIndex: 0 };
      }
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* quota */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* */
  }
}

export function hasUnsavedDraft(d: StudioDraft | null): boolean {
  if (!d) return false;
  return d.versList.length > 0 && d.versList[d.versIndex]!.length > 500;
}

const BADGE_LABELS: Record<string, string> = {
  first_gen: "首次生成",
  gen_5: "生成达人",
  first_save: "首次保存",
  save_3: "收藏三连",
  streak_3: "连击 3 天",
  streak_7: "连击 7 天",
  xp_500: "经验 500+",
};

export function badgeLabel(id: string): string {
  return BADGE_LABELS[id] ?? id;
}
