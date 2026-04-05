"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * 微信小程序 web-view 入口：把 JWT 写入本站 localStorage（与主站 Darwin 一致键名 token），再进入创作室。
 * 小程序内打开：{origin}/vibekids/mp-bridge?t=<jwt>
 */
function BridgeInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = sp.get("t");
    if (!t || !t.trim()) {
      setErr("缺少登录凭证，请从小程序重新进入。");
      return;
    }
    try {
      localStorage.setItem("token", t.trim());
    } catch {
      setErr("无法写入本地登录状态。");
      return;
    }
    router.replace("/vibekids");
  }, [sp, router]);

  if (err) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-center text-sm text-rose-700">
        {err}
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-6 text-center text-sm text-slate-600">
      正在进入创作室…
    </div>
  );
}

export default function MpBridgePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-600">
          加载中…
        </div>
      }
    >
      <BridgeInner />
    </Suspense>
  );
}
