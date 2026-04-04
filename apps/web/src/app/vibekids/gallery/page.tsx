import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/vibekids/SiteNav";
import { WorksGalleryClient } from "@/components/vibekids/WorksGalleryClient";
import { VK_BASE } from "@/lib/vibekids/constants";
import { getWorkSummaries } from "@/lib/vibekids/works-storage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "作品展示区 | VibeKids",
  description: "查看在创作室保存的单页作品。",
};

export default async function GalleryPage() {
  const saved = await getWorkSummaries();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav active="gallery" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-10 text-center sm:text-left">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            作品展示区
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-slate-600">
            <strong>小红书式瀑布流</strong>：多彩封面卡片、下滑自动加载更多、点心与 Remix 不离手。数据来自{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">data/works.json</code>
            （本地开发长期有效；无盘部署需数据库或对象存储）。
          </p>
        </div>

        <div className="mb-8 rounded-2xl border border-dashed border-violet-200 bg-violet-50/50 px-4 py-4 text-sm text-violet-900 sm:text-left">
          还没有作品？去{" "}
          <Link href={`${VK_BASE}/studio`} className="font-semibold underline underline-offset-2">
            创作室
          </Link>{" "}
          生成后点「保存作品」。也可先看{" "}
          <Link href={`${VK_BASE}/feed`} className="font-semibold underline underline-offset-2">
            发现
          </Link>{" "}
          或{" "}
          <Link href={`${VK_BASE}/cases`} className="font-semibold underline underline-offset-2">
            优秀案例
          </Link>
          。
        </div>

        <WorksGalleryClient works={saved} />
      </main>
    </div>
  );
}
