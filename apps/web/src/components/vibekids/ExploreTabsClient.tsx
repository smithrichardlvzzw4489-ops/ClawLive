"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CASE_DIFFICULTY_LABEL,
  EXCELLENT_CASES,
  type CaseDifficulty,
} from "@/data/vibekids/cases";
import { VK_API_BASE, VK_BASE } from "@/lib/vibekids/constants";
import { CREATIVE_KINDS } from "@/lib/vibekids/creative";
import type { SavedWorkSummary } from "@/lib/vibekids/works-storage";
import { WorkGridClient } from "./WorkGridClient";

export type ExploreTab = "cases" | "feed";

function parseTab(raw: string | null): ExploreTab {
  if (raw === "cases") return "cases";
  return "feed";
}

function parseCaseDifficulty(raw: string | null): CaseDifficulty | null {
  if (raw === "beginner" || raw === "intermediate" || raw === "advanced") return raw;
  return null;
}

function kindLabel(id: string) {
  return CREATIVE_KINDS.find((k) => k.id === id)?.label ?? id;
}

type Props = {
  /** 仅已发布，用于「发现」瀑布流 */
  publishedWorks: SavedWorkSummary[];
  initialTab: ExploreTab;
};

function filterPublished(list: SavedWorkSummary[]): SavedWorkSummary[] {
  return list.filter((w) => w.published === true);
}

export function ExploreTabsClient({ publishedWorks, initialTab }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ExploreTab>(initialTab);
  /** 发现流：客户端拉取，避免从「我的作品」发布后仍沿用导航缓存里的旧 RSC 数据 */
  const [feedWorks, setFeedWorks] = useState<SavedWorkSummary[]>(publishedWorks);

  useEffect(() => {
    setTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  const refreshFeedWorks = useCallback(async () => {
    try {
      const res = await fetch(`${VK_API_BASE}/works`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { works?: SavedWorkSummary[] };
      const all = Array.isArray(data.works) ? data.works : [];
      setFeedWorks(filterPublished(all));
    } catch {
      /* 保留当前 feedWorks */
    }
  }, []);

  useEffect(() => {
    if (tab !== "feed") return;
    void refreshFeedWorks();
  }, [tab, refreshFeedWorks]);

  const setExploreTab = useCallback(
    (t: ExploreTab) => {
      setTab(t);
      if (t === "feed") {
        router.replace(`${VK_BASE}/explore`, { scroll: false });
        return;
      }
      const d = parseCaseDifficulty(searchParams.get("caseDifficulty"));
      const q = d ? `tab=cases&caseDifficulty=${d}` : "tab=cases";
      router.replace(`${VK_BASE}/explore?${q}`, { scroll: false });
    },
    [router, searchParams],
  );

  const setCaseDifficultyFilter = useCallback(
    (d: CaseDifficulty | null) => {
      setTab("cases");
      const q = d ? `tab=cases&caseDifficulty=${d}` : "tab=cases";
      router.replace(`${VK_BASE}/explore?${q}`, { scroll: false });
    },
    [router],
  );

  const caseDifficultyFilter = useMemo(
    () => parseCaseDifficulty(searchParams.get("caseDifficulty")),
    [searchParams],
  );

  const filteredCases = useMemo(() => {
    if (!caseDifficultyFilter) return EXCELLENT_CASES;
    return EXCELLENT_CASES.filter((c) => c.difficulty === caseDifficultyFilter);
  }, [caseDifficultyFilter]);

  const tabBtn = (t: ExploreTab, label: string) => {
    const active = tab === t;
    return (
      <button
        type="button"
        key={t}
        onClick={() => setExploreTab(t)}
        className={
          active
            ? "rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800"
            : "rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        }
      >
        {label}
      </button>
    );
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 text-center sm:text-left">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">作品广场</h1>
        <p className="mt-3 max-w-2xl text-pretty text-slate-600">
          优秀案例与发现：「发现」仅展示<strong>已发布</strong>作品；保存后请在{" "}
          <Link href={`${VK_BASE}/my-works`} className="font-semibold text-violet-700 underline">
            我的作品
          </Link>{" "}
          中发布到广场。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 sm:justify-start">
          {tabBtn("cases", "优秀案例")}
          {tabBtn("feed", "发现")}
        </div>
      </div>

      {tab === "cases" ? (
        <>
          <p className="mb-8 max-w-2xl text-pretty text-sm text-slate-600">
            官方推荐的灵感方向。创作室<strong>保存</strong>的作品会进入{" "}
            <Link href={`${VK_BASE}/my-works`} className="font-semibold text-violet-700 underline">
              我的作品
            </Link>
            ；在「我的作品」里点击「发布到广场」后，才会出现在「发现」瀑布流。
          </p>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-800">官方推荐</h2>
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="案例难度筛选"
            >
              {(
                [
                  { key: "all" as const, label: "全部" },
                  { key: "beginner" as const, label: CASE_DIFFICULTY_LABEL.beginner },
                  { key: "intermediate" as const, label: CASE_DIFFICULTY_LABEL.intermediate },
                  { key: "advanced" as const, label: CASE_DIFFICULTY_LABEL.advanced },
                ] as const
              ).map(({ key, label }) => {
                const active =
                  key === "all" ? caseDifficultyFilter === null : caseDifficultyFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCaseDifficultyFilter(key === "all" ? null : key)}
                    className={
                      active
                        ? "rounded-full bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-900 ring-1 ring-violet-200"
                        : "rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {filteredCases.length === 0 ? (
            <p className="mb-14 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
              该难度下暂无案例，请切换筛选。
            </p>
          ) : (
            <ul className="mb-14 grid gap-5 sm:grid-cols-2">
              {filteredCases.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col rounded-2xl border border-slate-200/90 bg-white/90 p-5 shadow-sm transition hover:border-sky-200 hover:shadow-md"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800">
                      {c.tag}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                      {kindLabel(c.kind)}
                    </span>
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-100">
                      {CASE_DIFFICULTY_LABEL[c.difficulty]}
                    </span>
                    <span className="text-xs text-slate-500">{c.age === "primary" ? "小学" : "初中"}向</span>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900">{c.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{c.description}</p>
                  <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">描述预览：{c.prompt}</p>
                  <Link
                    href={`${VK_BASE}/studio?prompt=${encodeURIComponent(c.prompt)}`}
                    className="mt-4 inline-flex w-fit items-center rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
                  >
                    去试试 →
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <h2 className="mb-3 text-lg font-semibold text-slate-800">我的保存作品</h2>
          <p className="mb-4 max-w-xl text-pretty text-sm text-slate-600">
            保存的作品统一在「我的作品」中查看、预览与发布；未发布时不会出现在「发现」页。
          </p>
          <Link
            href={`${VK_BASE}/my-works`}
            className="mb-14 inline-flex items-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
          >
            打开我的作品 →
          </Link>
        </>
      ) : null}

      {tab === "feed" ? (
        <>
          <div className="mb-6 rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 px-4 py-3 text-sm text-sky-900">
            想自己做？去{" "}
            <Link href={`${VK_BASE}/studio`} className="font-semibold underline underline-offset-2">
              创作室
            </Link>
            ；保存后请到{" "}
            <Link href={`${VK_BASE}/my-works`} className="font-semibold underline underline-offset-2">
              我的作品
            </Link>{" "}
            发布后再出现在这里。下滑自动加载，越刷越有。
          </div>
          <WorkGridClient
            works={feedWorks}
            defaultSort="hot"
            immersive
            emptyHint="还没有已发布的作品。在创作室保存后，到「我的作品」点击「发布到广场」即可出现在此。"
          />
        </>
      ) : null}
    </main>
  );
}
