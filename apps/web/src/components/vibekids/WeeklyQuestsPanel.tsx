"use client";

import { useCallback, useEffect, useState } from "react";
import {
  claimWeeklyQuestReward,
  loadWeeklyQuests,
  weeklyProgressComplete,
  WEEKLY_TARGETS,
} from "@/lib/vibekids/client-engagement";
import { loadGamification } from "@/lib/vibekids/client-gamification";

export function WeeklyQuestsPanel() {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const q = loadWeeklyQuests();
  const g = loadGamification();

  useEffect(() => {
    const onW = () => refresh();
    window.addEventListener("vibekids-weekly-updated", onW);
    window.addEventListener("vibekids-gamification-refresh", onW);
    return () => {
      window.removeEventListener("vibekids-weekly-updated", onW);
      window.removeEventListener("vibekids-gamification-refresh", onW);
    };
  }, [refresh]);

  const done = weeklyProgressComplete(q);
  const claim = () => {
    const r = claimWeeklyQuestReward();
    if (r.ok) refresh();
  };

  const bar = (cur: number, max: number) => (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
        style={{ width: `${Math.min(100, (cur / max) * 100)}%` }}
      />
    </div>
  );

  return (
    <div
      key={tick}
      className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-fuchsia-50/50 px-4 py-3 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-violet-900">本周挑战</span>
        <span className="text-xs text-violet-700/80">经验 {g.xp}</span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-violet-800/80">
        三项全满后可领 +80 XP，并到账少量<strong>创作积分</strong>（见琥珀色「创作积分 · 可兑现」板块）。
      </p>
      <ul className="mt-3 space-y-3 text-xs text-violet-900/90">
        <li>
          <div className="mb-1 flex justify-between gap-2">
            <span>成功生成 / 迭代 {WEEKLY_TARGETS.gen} 次</span>
            <span>
              {q.gen}/{WEEKLY_TARGETS.gen}
            </span>
          </div>
          {bar(q.gen, WEEKLY_TARGETS.gen)}
        </li>
        <li>
          <div className="mb-1 flex justify-between gap-2">
            <span>保存作品 {WEEKLY_TARGETS.save} 次</span>
            <span>
              {q.save}/{WEEKLY_TARGETS.save}
            </span>
          </div>
          {bar(q.save, WEEKLY_TARGETS.save)}
        </li>
        <li>
          <div className="mb-1 flex justify-between gap-2">
            <span>在作品广场「发现」点赞 {WEEKLY_TARGETS.likes} 次</span>
            <span>
              {q.likes}/{WEEKLY_TARGETS.likes}
            </span>
          </div>
          {bar(q.likes, WEEKLY_TARGETS.likes)}
        </li>
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {done && !q.claimed ? (
          <button
            type="button"
            onClick={claim}
            className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700"
          >
            领取 +80 XP
          </button>
        ) : null}
        {q.claimed ? (
          <span className="text-xs font-medium text-emerald-700">本周奖励已领</span>
        ) : null}
        {!done ? (
          <span className="text-xs text-violet-700/75">全部完成后可领 +80 XP 与少量创作积分</span>
        ) : null}
      </div>
    </div>
  );
}
