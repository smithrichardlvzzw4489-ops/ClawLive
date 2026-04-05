import { Suspense } from "react";
import { SiteNav } from "@/components/vibekids/SiteNav";
import { StudioClient } from "@/components/vibekids/StudioClient";

export default function VibekidsHomePage() {
  return (
    <div className="flex w-full min-h-[100dvh] flex-col bg-slate-50 max-lg:h-[100dvh] max-lg:max-h-[100dvh] max-lg:overflow-hidden">
      <SiteNav active="studio" />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 lg:overflow-visible">
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center p-10 text-slate-600">
              加载中…
            </div>
          }
        >
          <StudioClient />
        </Suspense>
      </div>
    </div>
  );
}
