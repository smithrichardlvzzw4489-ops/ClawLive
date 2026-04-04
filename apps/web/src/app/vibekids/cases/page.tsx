import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";
import { CREATIVE_KINDS } from "@/lib/vibekids/creative";
import { SiteNav } from "@/components/vibekids/SiteNav";
import { SavedWorksGrid } from "@/components/vibekids/SavedWorksGrid";
import { EXCELLENT_CASES } from "@/data/vibekids/cases";
import { VK_BASE } from "@/lib/vibekids/constants";
import { getWorkSummaries } from "@/lib/vibekids/works-storage";

export const metadata: Metadata = {
  title: "优秀案例 | VibeKids",
  description: "精选氛围编程灵感与示例；保存的作品也会出现在这里。",
};

function kindLabel(id: string) {
  return CREATIVE_KINDS.find((k) => k.id === id)?.label ?? id;
}

export default async function CasesPage() {
  const saved = await getWorkSummaries();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav active="cases" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-10 text-center sm:text-left">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            优秀案例
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-slate-600">
            官方推荐的灵感方向；你在创作室<strong>保存</strong>的作品也会出现在下方「已保存作品」中，与作品展示区同步。
          </p>
        </div>

        <h2 className="mb-4 text-lg font-semibold text-slate-800">官方推荐</h2>
        <ul className="mb-14 grid gap-5 sm:grid-cols-2">
          {EXCELLENT_CASES.map((c) => (
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
                <span className="text-xs text-slate-500">
                  {c.age === "primary" ? "小学" : "初中"}向
                </span>
              </div>
              <h3 className="text-xl font-semibold text-slate-900">{c.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                {c.description}
              </p>
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                描述预览：{c.prompt}
              </p>
              <Link
                href={`${VK_BASE}/studio?age=${c.age}&prompt=${encodeURIComponent(c.prompt)}`}
                className="mt-4 inline-flex w-fit items-center rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
              >
                去试试 →
              </Link>
            </li>
          ))}
        </ul>

        <h2 className="mb-4 text-lg font-semibold text-slate-800">已保存作品</h2>
        <p className="mb-4 text-sm text-slate-600">
          来自本机/服务器上的「保存作品」列表（与{" "}
          <Link href={`${VK_BASE}/gallery`} className="font-medium text-violet-600 underline">
            作品展示区
          </Link>{" "}
          相同数据源）。
        </p>
        <SavedWorksGrid works={saved} />
      </main>
    </div>
  );
}
