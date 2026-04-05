import type { Metadata } from "next";
import { MyWorksClient } from "@/components/vibekids/MyWorksClient";
import { SiteNav } from "@/components/vibekids/SiteNav";

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
        <div className="mt-8">
          <MyWorksClient />
        </div>
      </main>
    </div>
  );
}
