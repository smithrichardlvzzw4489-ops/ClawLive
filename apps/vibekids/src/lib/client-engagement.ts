"use client";

import { earnCreatorPoints } from "@/lib/client-rewards";
import { addBonusXp, loadGamification } from "@/lib/client-gamification";

const WEEKLY_KEY = "vibekids-weekly-quests-v1";
const PROMPT_HIST_KEY = "vibekids-prompt-history-v1";
const REMINDER_KEY = "vibekids-streak-reminder-v1";

/** 以周一日期作为「周」标识 */
export function currentWeekId(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
}

export const WEEKLY_TARGETS = {
  gen: 3,
  save: 1,
  likes: 5,
} as const;

export type WeeklyQuestState = {
  weekId: string;
  gen: number;
  save: number;
  likes: number;
  /** 是否已领取本周通关奖励 */
  claimed: boolean;
};

function defaultWeekly(): WeeklyQuestState {
  return {
    weekId: currentWeekId(),
    gen: 0,
    save: 0,
    likes: 0,
    claimed: false,
  };
}

export function loadWeeklyQuests(): WeeklyQuestState {
  if (typeof window === "undefined") return defaultWeekly();
  try {
    const raw = localStorage.getItem(WEEKLY_KEY);
    if (!raw) return defaultWeekly();
    const p = JSON.parse(raw) as Partial<WeeklyQuestState>;
    const w = currentWeekId();
    if (p.weekId !== w) return defaultWeekly();
    return {
      weekId: w,
      gen: Math.max(0, Number(p.gen) || 0),
      save: Math.max(0, Number(p.save) || 0),
      likes: Math.max(0, Number(p.likes) || 0),
      claimed: Boolean(p.claimed),
    };
  } catch {
    return defaultWeekly();
  }
}

function saveWeekly(s: WeeklyQuestState): void {
  try {
    localStorage.setItem(WEEKLY_KEY, JSON.stringify(s));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("vibekids-weekly-updated"));
    }
  } catch {
    /* */
  }
}

export function weeklyProgressComplete(q: WeeklyQuestState): boolean {
  return (
    q.gen >= WEEKLY_TARGETS.gen &&
    q.save >= WEEKLY_TARGETS.save &&
    q.likes >= WEEKLY_TARGETS.likes
  );
}

/** 导航红点：本周任务未全部完成且未领奖励 */
export function shouldShowQuestNavBadge(): boolean {
  const q = loadWeeklyQuests();
  if (q.claimed) return false;
  return !weeklyProgressComplete(q);
}

export function bumpWeeklyGen(): WeeklyQuestState {
  const q = loadWeeklyQuests();
  q.gen += 1;
  saveWeekly(q);
  return q;
}

export function bumpWeeklySave(): WeeklyQuestState {
  const q = loadWeeklyQuests();
  q.save += 1;
  saveWeekly(q);
  return q;
}

export function bumpWeeklyLike(): WeeklyQuestState {
  const q = loadWeeklyQuests();
  q.likes += 1;
  saveWeekly(q);
  return q;
}

/** 领取周任务奖励（+80 XP），仅一次 */
export function claimWeeklyQuestReward(): {
  ok: boolean;
  xp?: number;
  reason?: string;
} {
  const q = loadWeeklyQuests();
  if (q.claimed) return { ok: false, reason: "already_claimed" };
  if (!weeklyProgressComplete(q)) return { ok: false, reason: "incomplete" };
  q.claimed = true;
  saveWeekly(q);
  const XP = 80;
  addBonusXp(XP);
  earnCreatorPoints(25);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("vibekids-gamification-refresh"));
  }
  return { ok: true, xp: XP };
}

const MAX_PROMPTS = 20;

export function getPromptHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROMPT_HIST_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

export function pushPromptHistory(prompt: string): void {
  const t = prompt.trim();
  if (t.length < 2) return;
  let list = getPromptHistory().filter((x) => x !== t);
  list = [t, ...list].slice(0, MAX_PROMPTS);
  try {
    localStorage.setItem(PROMPT_HIST_KEY, JSON.stringify(list));
  } catch {
    /* */
  }
}

/** 连续登录提醒：每日最多弹一次（需通知权限） */
export function maybeFireStreakReminder(): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  const g = loadGamification();
  if (g.streak < 2) return;
  const today = new Date().toDateString();
  try {
    const last = localStorage.getItem(REMINDER_KEY);
    if (last === today) return;
    const h = new Date().getHours();
    if (h < 19 || h > 21) return;
    if (Notification.permission !== "granted") return;
    new Notification("VibeKids", {
      body: `已连续 ${g.streak} 天 · 打开创作室延续节奏`,
    });
    localStorage.setItem(REMINDER_KEY, today);
  } catch {
    /* */
  }
}
