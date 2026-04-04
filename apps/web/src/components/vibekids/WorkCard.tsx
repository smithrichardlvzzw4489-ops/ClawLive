"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { VK_API_BASE, VK_BASE } from "@/lib/vibekids/constants";
import { bumpWeeklyLike } from "@/lib/vibekids/client-engagement";
import { CREATIVE_KINDS } from "@/lib/vibekids/creative";
import { gradientFromWorkId } from "@/lib/vibekids/work-card-visual";
import { ageLabel } from "@/lib/vibekids/age";
import { playHintLine } from "@/lib/vibekids/work-card-hint";
import type { SavedWorkSummary } from "@/lib/vibekids/works-storage";

function kindLabel(id: string | undefined) {
  if (!id || id === "any") return "不限";
  return CREATIVE_KINDS.find((k) => k.id === id)?.label ?? id;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type Props = {
  work: SavedWorkSummary;
  /** 默认：列表格；feed：瀑布流大图卡片（小红书式） */
  variant?: "default" | "feed";
  /** 用于进入动画错峰 */
  animIndex?: number;
};

export function WorkCard({ work, variant = "default", animIndex = 0 }: Props) {
  const [likes, setLikes] = useState(work.likes ?? 0);
  const [busy, setBusy] = useState(false);

  const like = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setBusy(true);
      try {
        const res = await fetch(`${VK_API_BASE}/works/${work.id}/like`, {
          method: "POST",
        });
        const data = (await res.json()) as { ok?: boolean; likes?: number };
        if (res.ok && typeof data.likes === "number") {
          setLikes(data.likes);
          bumpWeeklyLike();
        }
      } catch {
        /* */
      } finally {
        setBusy(false);
      }
    },
    [work.id],
  );

  if (variant === "feed") {
    const g = gradientFromWorkId(work.id);
    const delay = Math.min(animIndex, 24) * 35;

    return (
      <li
        className="work-card-enter mb-4 break-inside-avoid"
        style={{ animationDelay: `${delay}ms` }}
      >
        <div className="overflow-hidden rounded-2xl border border-white/60 bg-white shadow-md ring-1 ring-slate-200/60 transition duration-300 hover:-translate-y-0.5 hover:shadow-xl">
          <Link
            href={`${VK_BASE}/works/${work.id}`}
            className="relative block w-full overflow-hidden"
            style={{ minHeight: g.minHeightPx }}
          >
            <div
              className="absolute inset-0 bg-gradient-to-br"
              style={{
                backgroundImage: `linear-gradient(135deg, ${g.from}, ${g.to})`,
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
            <div className="absolute left-2 top-2 flex flex-wrap gap-1">
              {work.qualityScore != null && work.qualityScore >= 62 ? (
                <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-950 shadow-sm">
                  优质
                </span>
              ) : null}
              {work.spotlightRequested ? (
                <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  精选候选
                </span>
              ) : null}
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-800 shadow-sm">
                {kindLabel(work.kind)}
              </span>
              <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                {ageLabel(work.ageBand)}
              </span>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
              <h2 className="text-balance text-base font-bold leading-snug drop-shadow-sm line-clamp-2">
                {work.title}
              </h2>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/88">
                玩法 · {playHintLine(work, 56)}
              </p>
              <p className="mt-2 text-[10px] text-white/65">{formatTime(work.createdAt)}</p>
            </div>
          </Link>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-white/95 px-3 py-2.5">
            <button
              type="button"
              onClick={like}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-50 to-pink-50 px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/80 transition hover:from-rose-100 hover:to-pink-100 disabled:opacity-50"
            >
              <span aria-hidden>❤️</span>
              {likes}
            </button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href={`${VK_BASE}/studio?prompt=${encodeURIComponent(work.prompt ?? work.title)}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-violet-300 hover:bg-violet-50"
              >
                Remix
              </Link>
              <Link
                href={`${VK_BASE}/works/${work.id}`}
                className="rounded-full bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-violet-700"
              >
                全屏看
              </Link>
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-col rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800">
          {kindLabel(work.kind)}
        </span>
        <span className="text-xs text-slate-500">
          {ageLabel(work.ageBand)}
        </span>
      </div>
      <h2 className="text-lg font-semibold text-slate-900">{work.title}</h2>
      <p className="mt-1.5 text-xs font-medium text-violet-700/90">
        玩法 · {playHintLine(work, 72)}
      </p>
      <p className="mt-3 text-xs text-slate-400">{formatTime(work.createdAt)}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={like}
          disabled={busy}
          className="rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-medium text-pink-800 transition hover:bg-pink-100 disabled:opacity-50"
        >
          👍 {likes}
        </button>
        <Link
          href={`${VK_BASE}/works/${work.id}`}
          className="inline-flex w-fit items-center rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-100"
        >
          打开作品 →
        </Link>
        <Link
          href={`${VK_BASE}/studio?prompt=${encodeURIComponent(work.prompt ?? work.title)}`}
          className="inline-flex w-fit items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-violet-300 hover:bg-violet-50"
        >
          Remix
        </Link>
      </div>
    </li>
  );
}
