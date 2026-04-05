import { Suspense } from "react";
import { SiteNav } from "@/components/vibekids/SiteNav";
import { StudioClient } from "@/components/vibekids/StudioClient";

export default function VibekidsHomePage() {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-slate-50">
      <SiteNav active="studio" />
      <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
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
