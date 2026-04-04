import { Suspense } from "react";
import { SiteNav } from "@/components/vibekids/SiteNav";
import { StudioClient } from "@/components/vibekids/StudioClient";

export default function StudioPage() {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col">
      <SiteNav active="studio" />
      <p className="shrink-0 border-b border-slate-100 bg-white/30 px-4 py-2 text-center text-xs text-slate-500 sm:px-6">
        创作室 · 任意场景，一句话开做
      </p>
      <div className="flex min-h-0 flex-1 flex-col">
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
