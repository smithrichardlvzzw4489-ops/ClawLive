import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteNav } from "@/components/vibekids/SiteNav";
import { WechatLoginHint } from "@/components/vibekids/WechatLoginHint";

export const metadata: Metadata = {
  title: "微信登录 | VibeKids",
  description: "使用微信小程序微信授权登录 VibeKids，与网页 Darwin 账号无关。",
};

export default function WechatLoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav active="studio" />
      <Suspense
        fallback={
          <p className="p-8 text-center text-sm text-slate-600">加载中…</p>
        }
      >
        <WechatLoginHint />
      </Suspense>
    </div>
  );
}
