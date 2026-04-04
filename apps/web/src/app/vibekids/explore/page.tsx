import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ExploreTabsClient,
  type ExploreTab,
} from "@/components/vibekids/ExploreTabsClient";
import { SiteNav } from "@/components/vibekids/SiteNav";
import { getWorkSummaries } from "@/lib/vibekids/works-storage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "作品广场 | VibeKids",
  description: "官方案例与热门发现，浏览保存作品。",
};

function parseTab(raw: string | undefined): ExploreTab {
  if (raw === "cases") return "cases";
  return "feed";
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const saved = await getWorkSummaries();
  const initialTab = parseTab(searchParams.tab);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav active="explore" />
      <Suspense
        fallback={
          <div className="mx-auto flex-1 px-4 py-20 text-center text-slate-500">加载中…</div>
        }
      >
        <ExploreTabsClient saved={saved} initialTab={initialTab} />
      </Suspense>
    </div>
  );
}
