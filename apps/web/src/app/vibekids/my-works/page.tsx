import type { Metadata } from "next";
import Link from "next/link";
import { MyWorksClient } from "@/components/vibekids/MyWorksClient";
import { SiteNav } from "@/components/vibekids/SiteNav";
import { VK_BASE } from "@/lib/vibekids/constants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "我的作品 | VibeKids",
  description: "查看已保存的作品，发布到作品广场或撤回。",
};

export default function MyWorksPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav active="myworks" />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">我的作品</h1>
        <p className="mt-3 max-w-2xl text-pretty text-sm text-slate-600">
          创作室保存的作品都会出现在这里。<strong>未发布</strong>时只有自己能打开预览链接；点击「发布到广场」后，作品会出现在{" "}
          <Link href={`${VK_BASE}/explore`} className="font-semibold text-violet-700 underline">
            作品广场 · 发现
          </Link>
          。
        </p>
        <div className="mt-8">
          <MyWorksClient />
        </div>
      </main>
    </div>
  );
}
