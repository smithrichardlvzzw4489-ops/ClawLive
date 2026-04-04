import Link from "next/link";
import { VK_BASE } from "@/lib/vibekids/constants";
import { playHintLine } from "@/lib/vibekids/work-card-hint";
import type { SavedWorkSummary } from "@/lib/vibekids/works-storage";

type Props = {
  works: SavedWorkSummary[];
};

/** 可传播的展示位：首页横滑精选（按 spotlightRank 由服务端预排序） */
export function FeaturedStrip({ works }: Props) {
  if (works.length === 0) return null;

  return (
    <section className="w-full max-w-4xl text-left">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900">精选展示</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            综合优质分、点赞、曝光券与新鲜度；新作品也有一小段加成，方便被看见
          </p>
        </div>
        <Link
          href={`${VK_BASE}/explore`}
          className="shrink-0 text-sm font-semibold text-violet-600 underline-offset-2 hover:underline"
        >
          去作品广场 →
        </Link>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 pt-0.5 [scrollbar-width:thin]">
        {works.map((w) => (
          <Link
            key={w.id}
            href={`${VK_BASE}/works/${w.id}`}
            className="group min-w-[10rem] max-w-[11rem] shrink-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
          >
            <div className="flex aspect-[4/5] flex-col justify-between bg-gradient-to-br from-violet-100/90 via-fuchsia-50 to-amber-50 p-3">
              <div className="flex flex-wrap gap-1">
                {w.qualityScore != null && w.qualityScore >= 62 ? (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-amber-950 shadow-sm">
                    优质
                  </span>
                ) : null}
                {w.spotlightRequested ? (
                  <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                    精选候选
                  </span>
                ) : null}
              </div>
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 group-hover:text-violet-900">
                {w.title}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-600">
                玩法 · {playHintLine(w, 52)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
