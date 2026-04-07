import { Suspense } from "react";
import { SiteNav } from "@/components/vibekids/SiteNav";
import { StudioClient } from "@/components/vibekids/StudioClient";

/**
 * 微信 web-view X5 内核对 dvh / flex-1 支持不稳定。
 * 外壳用 vh（回落更好）+ dvh 做双保险，内部创作室不依赖 flex-grow 做主布局。
 */
const VK_SHELL =
  "w-full overflow-hidden bg-slate-50 " +
  "max-lg:h-[calc(100vh-3.85rem-env(safe-area-inset-bottom,0px))] " +
  "max-lg:h-[calc(100dvh-3.85rem-env(safe-area-inset-bottom,0px))] " +
  "lg:min-h-[100dvh] lg:max-h-none lg:overflow-visible";

export default function VibekidsHomePage() {
  return (
    <div className={VK_SHELL} style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <SiteNav active="studio" />
      <div style={{ position: "relative", flex: "1 1 0%", minHeight: 0, overflow: "hidden" }}>
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-10 text-slate-600" style={{ height: "100%" }}>
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
