"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { VK_BASE } from "@/lib/vibekids/constants";

type WxMini = { navigateTo?: (opts: { url: string }) => void };

const JWEIXIN_SRC = "https://res.wx.qq.com/open/js/jweixin-1.6.0.js";

function getWxMini(): WxMini | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { wx?: { miniProgram?: WxMini } }).wx
    ?.miniProgram;
}

export function WechatLoginHint() {
  const sp = useSearchParams();
  const redirect = sp.get("redirect")?.trim() || `${VK_BASE}`;
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [canJump, setCanJump] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (getWxMini()?.navigateTo) {
      setCanJump(true);
      return;
    }
    if (document.querySelector(`script[src="${JWEIXIN_SRC}"]`)) {
      setSdkLoaded(true);
      setCanJump(!!getWxMini()?.navigateTo);
      return;
    }
    const s = document.createElement("script");
    s.src = JWEIXIN_SRC;
    s.async = true;
    s.onload = () => {
      setSdkLoaded(true);
      setCanJump(!!getWxMini()?.navigateTo);
    };
    s.onerror = () => setSdkLoaded(true);
    document.head.appendChild(s);
  }, []);

  const goMpLogin = useCallback(() => {
    const mp = getWxMini();
    if (typeof mp?.navigateTo === "function") {
      mp.navigateTo({ url: "/pages/login/login" });
      return;
    }
  }, []);

  const backHref =
    redirect.startsWith("/") && !redirect.startsWith("//") ?
      redirect
    : VK_BASE;

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">微信登录</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          VibeKids 创作室使用<strong className="font-semibold text-slate-800">
            微信小程序内的微信授权登录
          </strong>
          ，与网页「DarwinClaw 用户名 / 密码」不是同一套账号。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          生成、保存、发布作品前，请在本小程序中完成一次微信登录；登录成功后会自动带上创作权限。
        </p>

        {canJump ?
          <div className="mt-6">
            <button
              type="button"
              onClick={() => goMpLogin()}
              className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
            >
              前往微信登录
            </button>
          </div>
        : (
          <div className="mt-6 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {sdkLoaded ?
              <p>
                当前环境未检测到小程序接口。请<strong>打开「VibeKids」微信小程序</strong>
                ，从首页进入创作室 web-view，再点创作室里的「微信登录」。
              </p>
            : <p>正在检测运行环境…</p>}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 text-sm">
          <Link
            href={backHref}
            className="text-center font-medium text-violet-700 underline-offset-2 hover:underline"
          >
            返回上一页
          </Link>
          <Link
            href={VK_BASE}
            className="text-center text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            回创作室首页
          </Link>
        </div>
      </div>
    </main>
  );
}
