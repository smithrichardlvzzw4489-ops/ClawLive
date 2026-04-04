"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CASE_DIFFICULTY_LABEL,
  EXCELLENT_CASES,
  type CaseDifficulty,
} from "@/data/vibekids/cases";
import { VK_BASE } from "@/lib/vibekids/constants";
import { CREATIVE_KINDS } from "@/lib/vibekids/creative";
import type { SavedWorkSummary } from "@/lib/vibekids/works-storage";
import { SavedWorksGrid } from "./SavedWorksGrid";
import { WorkGridClient } from "./WorkGridClient";
import { WorksGalleryClient } from "./WorksGalleryClient";

export type ExploreTab = "cases" | "feed" | "gallery";

function parseTab(raw: string | null): ExploreTab {
  if (raw === "cases" || raw === "gallery") return raw;
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
  saved: SavedWorkSummary[];
  initialTab: ExploreTab;
};

export function ExploreTabsClient({ saved, initialTab }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ExploreTab>(initialTab);

  useEffect(() => {
    setTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  const setExploreTab = useCallback(
    (t: ExploreTab) => {
      setTab(t);
      if (t === "feed") {
        router.replace(`${VK_BASE}/explore`, { scroll: false });
        return;
      }
      if (t === "cases") {
        const d = parseCaseDifficulty(searchParams.get("caseDifficulty"));
        const q = d ? `tab=cases&caseDifficulty=${d}` : "tab=cases";
        router.replace(`${VK_BASE}/explore?${q}`, { scroll: false });
        return;
      }
      router.replace(`${VK_BASE}/explore?tab=${t}`, { scroll: false });
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
          官方向导、热门发现、作品长廊，同一入口；下方切换子页即可。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 sm:justify-start">
          {tabBtn("cases", "优秀案例")}
          {tabBtn("feed", "发现")}
          {tabBtn("gallery", "作品展示区")}
        </div>
      </div>

      {tab === "cases" ? (
        <>
          <p className="mb-8 max-w-2xl text-pretty text-sm text-slate-600">
            官方推荐的灵感方向；你在创作室<strong>保存</strong>的作品也会出现在下方「已保存作品」中，与「作品展示区」子页为同一数据源。
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
          <h2 className="mb-4 text-lg font-semibold text-slate-800">已保存作品</h2>
          <p className="mb-4 text-sm text-slate-600">
            来自本机/服务器上的「保存作品」列表（与
            <button
              type="button"
              onClick={() => setExploreTab("gallery")}
              className="mx-1 font-medium text-violet-600 underline"
            >
              作品展示区
            </button>
            子页相同数据源）。
          </p>
          <SavedWorksGrid works={saved} />
        </>
      ) : null}

      {tab === "feed" ? (
        <>
          <div className="mb-6 rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 px-4 py-3 text-sm text-sky-900">
            想自己做？去{" "}
            <Link href={`${VK_BASE}/studio`} className="font-semibold underline underline-offset-2">
              创作室
            </Link>
            ；完整瀑布流见
            <button
              type="button"
              onClick={() => setExploreTab("gallery")}
              className="mx-1 font-semibold underline underline-offset-2"
            >
              作品展示区
            </button>
            子页。下滑自动加载，越刷越有。
          </div>
          <WorkGridClient works={saved} defaultSort="hot" immersive />
        </>
      ) : null}

      {tab === "gallery" ? (
        <>
          <p className="mb-6 max-w-2xl text-pretty text-slate-600">
            <strong>小红书式瀑布流</strong>：多彩封面卡片、下滑自动加载更多、点心与 Remix 不离手。数据来自{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">data/works.json</code>
            （本地开发长期有效；无盘部署需数据库或对象存储）。
          </p>
          <div className="mb-8 rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 px-4 py-4 text-sm text-violet-900 sm:text-left">
            还没有作品？去{" "}
            <Link href={`${VK_BASE}/studio`} className="font-semibold underline underline-offset-2">
              创作室
            </Link>{" "}
            生成后点「保存作品」。也可先看
            <button
              type="button"
              onClick={() => setExploreTab("feed")}
              className="mx-1 font-semibold underline underline-offset-2"
            >
              发现
            </button>
            或
            <button
              type="button"
              onClick={() => setExploreTab("cases")}
              className="mx-1 font-semibold underline underline-offset-2"
            >
              优秀案例
            </button>
            。
          </div>
          <WorksGalleryClient works={saved} />
        </>
      ) : null}
    </main>
  );
}
