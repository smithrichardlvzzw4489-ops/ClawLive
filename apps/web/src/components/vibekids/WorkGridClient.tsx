"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { VK_BASE } from "@/lib/vibekids/constants";
import type { SavedWorkSummary } from "@/lib/vibekids/works-storage";
import type { WorkSortMode } from "@/lib/vibekids/work-sort";
import { sortWorks } from "@/lib/vibekids/work-sort";
import { WorkCard } from "@/components/vibekids/WorkCard";

const PAGE = 8;

type Props = {
  works: SavedWorkSummary[];
  defaultSort?: WorkSortMode;
  showSortTabs?: boolean;
  /** 瀑布流 + 自动无限滚动 + 大图卡片（信息流沉浸） */
  immersive?: boolean;
  emptyHint?: string;
};

export function WorkGridClient({
  works,
  defaultSort = "new",
  showSortTabs = true,
  immersive = false,
  emptyHint,
}: Props) {
  const [sort, setSort] = useState<WorkSortMode>(defaultSort);
  const [visible, setVisible] = useState(PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingLock = useRef(false);
  const visibleRef = useRef(visible);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  visibleRef.current = visible;

  useEffect(() => {
    setSort(defaultSort);
  }, [defaultSort]);

  useEffect(() => {
    setVisible(PAGE);
  }, [sort, works.length]);

  const sorted = useMemo(() => sortWorks(works, sort), [works, sort]);

  const slice = useMemo(
    () => sorted.slice(0, visible),
    [sorted, visible],
  );

  const loadMore = useCallback(() => {
    if (loadingLock.current) return;
    if (visibleRef.current >= sorted.length) return;
    loadingLock.current = true;
    setLoadingMore(true);
    setVisible((v) => Math.min(v + PAGE, sorted.length));
    window.setTimeout(() => {
      loadingLock.current = false;
      setLoadingMore(false);
    }, 420);
  }, [sorted.length]);

  useEffect(() => {
    if (!immersive) return;
    const el = sentinelRef.current;
    if (!el || sorted.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        loadMore();
      },
      { root: null, rootMargin: "480px 0px", threshold: 0 },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [immersive, loadMore, sorted.length, visible]);

  if (works.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
        {emptyHint ?? "还没有保存的作品。"}
      </p>
    );
  }

  const tabs = (
    <div
      className={
        immersive
          ? "sticky top-0 z-20 -mx-1 mb-5 flex flex-wrap gap-2 border-b border-slate-200/80 bg-gradient-to-b from-white via-white/95 to-white/80 px-1 py-3 backdrop-blur-md sm:-mx-2 sm:px-2"
          : "mb-6 flex flex-wrap gap-2"
      }
    >
      {(
        [
          ["new", "最新"],
          ["score", "作品分"],
          ["likes", "最多赞"],
          ["hot", "热门"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setSort(id)}
          className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
            sort === id
              ? "border-violet-500 bg-violet-50 text-violet-900 shadow-sm"
              : "border-slate-200/90 bg-white/90 text-slate-600 hover:border-violet-200"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (immersive) {
    return (
      <div className="pb-16">
        {showSortTabs ? tabs : null}

        <ul className="columns-2 gap-x-4 md:columns-3 md:gap-x-5">
          {slice.map((w, i) => (
            <WorkCard
              key={w.id}
              work={w}
              variant="feed"
              animIndex={i}
            />
          ))}
        </ul>

        {visible < sorted.length ? (
          <div ref={sentinelRef} className="h-2 w-full" aria-hidden />
        ) : null}

        {loadingMore && visible < sorted.length ? (
          <div className="mt-8 flex flex-col items-center gap-2">
            <div
              className="h-9 w-9 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600"
              aria-hidden
            />
            <span className="text-xs text-slate-400">正在加载更多…</span>
          </div>
        ) : null}

        {visible >= sorted.length && sorted.length > PAGE ? (
          <p className="mt-10 text-center text-xs text-slate-400">
            已浏览全部 {sorted.length} 件 · 去{" "}
            <Link href={VK_BASE} className="font-medium text-violet-600 underline">
              创作室
            </Link>{" "}
            再产一批
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {showSortTabs ? tabs : null}

      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {slice.map((w) => (
          <WorkCard key={w.id} work={w} variant="default" />
        ))}
      </ul>

      {visible < sorted.length ? (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
          >
            加载更多（{slice.length} / {sorted.length}）
          </button>
        </div>
      ) : null}
    </div>
  );
}
