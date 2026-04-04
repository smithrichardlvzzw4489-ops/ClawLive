"use client";

import {
  type GamificationState,
  badgeLabel,
  xpIntoCurrentLevel,
} from "@/lib/vibekids/client-gamification";

type Props = {
  state: GamificationState;
  /** 习惯 / 损失厌恶类轻提示（成人向留存） */
  nudge?: string | null;
};

export function GamificationBar({ state, nudge }: Props) {
  const { level, pct } = xpIntoCurrentLevel(state.xp);
  return (
    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-amber-900">Lv.{level}</span>
        <span className="text-amber-800/90">经验 {state.xp}</span>
        <span className="text-amber-800/90">连续 {state.streak} 天</span>
        <span className="text-amber-800/90">生成 {state.generationCount} · 保存 {state.saveCount}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-200/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {nudge ? (
        <p className="mt-2 text-[11px] leading-snug text-amber-950/85">{nudge}</p>
      ) : null}
      {state.badges.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {state.badges.map((id) => (
            <span
              key={id}
              className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-amber-900 shadow-sm"
            >
              {badgeLabel(id)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
