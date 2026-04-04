"use client";

import { useCallback, useEffect, useState } from "react";
import {
  loadCreatorPoints,
  REDEEM,
  tryRedeem,
} from "@/lib/vibekids/client-rewards";

export function CreatorFlywheelPanel() {
  const [pts, setPts] = useState(0);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(
    null,
  );

  const sync = useCallback(() => {
    setPts(loadCreatorPoints());
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener("vibekids-creator-points-updated", sync);
    return () =>
      window.removeEventListener("vibekids-creator-points-updated", sync);
  }, [sync]);

  return (
    <div className="w-full max-w-lg rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-orange-50/50 px-4 py-4 text-sm text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-amber-950">创作积分 · 可兑现</h2>
        <span className="rounded-full bg-white/90 px-3 py-1 text-sm font-bold tabular-nums text-amber-900 shadow-sm">
          {pts} 点
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-amber-900/85">
        保存作品按<strong>优质分</strong>发放积分；完成周任务再送一点。积分可换经验或
        <strong>精选曝光券</strong>（下次保存加权进首页精选）。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const r = tryRedeem("xp50");
            setToast({ text: r.message, ok: r.ok });
            sync();
          }}
          className="rounded-xl border border-amber-300/80 bg-white px-3 py-2 text-xs font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/80"
        >
          {REDEEM.xp50.label}（{REDEEM.xp50.cost} 点）
        </button>
        <button
          type="button"
          onClick={() => {
            const r = tryRedeem("spotlight");
            setToast({ text: r.message, ok: r.ok });
            sync();
          }}
          className="rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 shadow-sm transition hover:bg-violet-100"
        >
          {REDEEM.spotlight.label}（{REDEEM.spotlight.cost} 点）
        </button>
      </div>
      {toast ? (
        <p
          className={
            toast.ok ?
              "mt-2 text-xs font-medium text-emerald-800"
            : "mt-2 text-xs font-medium text-rose-700"
          }
        >
          {toast.text}
        </p>
      ) : null}
    </div>
  );
}
