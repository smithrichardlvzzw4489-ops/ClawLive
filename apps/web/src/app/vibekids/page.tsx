import { Suspense } from "react";
import { SiteNav } from "@/components/vibekids/SiteNav";
import { StudioClient } from "@/components/vibekids/StudioClient";

/** 与 layout 底部留白（固定底栏）一致，避免 100dvh 把整块创作室裁进导航下面看不见 */
const VK_MOBILE_MAIN_H =
  "max-lg:h-[calc(100dvh-3.85rem-env(safe-area-inset-bottom,0px))] max-lg:max-h-[calc(100dvh-3.85rem-env(safe-area-inset-bottom,0px))]";

export default function VibekidsHomePage() {
  return (
    <div
      className={`flex w-full min-h-0 flex-1 flex-col overflow-hidden bg-slate-50 ${VK_MOBILE_MAIN_H} lg:min-h-[100dvh] lg:max-h-none lg:overflow-visible`}
    >
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
