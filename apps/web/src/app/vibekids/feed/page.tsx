import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/vibekids/SiteNav";
import { WorkGridClient } from "@/components/vibekids/WorkGridClient";
import { VK_BASE } from "@/lib/vibekids/constants";
import { getWorkSummaries } from "@/lib/vibekids/works-storage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "发现 | VibeKids",
  description: "按热度与最新浏览社区保存的作品。",
};

export default async function FeedPage() {
  const saved = await getWorkSummaries();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav active="feed" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-10 text-center sm:text-left">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            发现
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-slate-600">
            双列/三列<strong>瀑布流</strong>，默认<strong>热门</strong>（赞 + 新鲜度）；切「最新」「最多赞」换一批口味。
            <strong className="text-violet-700"> 触底自动加载</strong>，不用点按钮。
          </p>
        </div>

        <div className="mb-6 rounded-2xl border border-dashed border-sky-200 bg-sky-50/40 px-4 py-3 text-sm text-sky-900">
          想自己做？去{" "}
          <Link href={`${VK_BASE}/studio`} className="font-semibold underline underline-offset-2">
            创作室
          </Link>
          ；全列表见{" "}
          <Link href={`${VK_BASE}/gallery`} className="font-semibold underline underline-offset-2">
            作品展示区
          </Link>
          。下滑自动加载，越刷越有。
        </div>

        <WorkGridClient works={saved} defaultSort="hot" immersive />
      </main>
    </div>
  );
}
