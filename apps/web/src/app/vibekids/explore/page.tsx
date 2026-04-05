import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ExploreTabsClient,
  type ExploreTab,
} from "@/components/vibekids/ExploreTabsClient";
import { SiteNav } from "@/components/vibekids/SiteNav";
import { fetchPublishedWorkSummariesForSsr } from "@/lib/vibekids/works-ssr";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "作品广场 | VibeKids",
  description: "官方案例与已发布作品发现流；保存的作品在「我的作品」中管理与发布。",
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
  const publishedWorks = await fetchPublishedWorkSummariesForSsr();
  const initialTab = parseTab(searchParams.tab);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav active="explore" />
      <Suspense
        fallback={
          <div className="mx-auto flex-1 px-4 py-20 text-center text-slate-500">加载中…</div>
        }
      >
        <ExploreTabsClient publishedWorks={publishedWorks} initialTab={initialTab} />
      </Suspense>
    </div>
  );
}
