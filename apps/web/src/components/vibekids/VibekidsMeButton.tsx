"use client";

import { useCallback, useState } from "react";

type MeJson = {
  id: string;
  username: string;
  email?: string | null;
  clawPoints?: number;
};

export function VibekidsMeButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<MeJson | null>(null);
  const [virtualKey, setVirtualKey] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setMe(null);
    setVirtualKey(null);
    setNoKey(false);
    setCopied(false);
    try {
      let token: string | null = null;
      try {
        token = localStorage.getItem("token");
      } catch {
        /* ignore */
      }
      if (!token) {
        setErr("未登录。请通过微信小程序创作室完成登录。");
        setLoading(false);
        return;
      }

      const [rMe, rKey] = await Promise.all([
        fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/points/llm/virtual-key", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!rMe.ok) {
        if (rMe.status === 401) {
          setErr("登录已失效，请重新进入小程序创作室。");
        } else {
          setErr(`加载账号失败（HTTP ${rMe.status}）`);
        }
        setLoading(false);
        return;
      }

      const u = (await rMe.json()) as MeJson;
      setMe(u);

      if (rKey.ok) {
        const k = (await rKey.json()) as { virtualKey?: string };
        setVirtualKey(typeof k.virtualKey === "string" ? k.virtualKey : null);
      } else if (rKey.status === 404) {
        setNoKey(true);
      } else {
        setNoKey(true);
      }
    } catch {
      setErr("网络异常，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  const onOpen = () => {
    setOpen(true);
    void load();
  };

  const copyKey = async () => {
    if (!virtualKey) return;
    try {
      await navigator.clipboard.writeText(virtualKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr("无法复制到剪贴板，请手动选中复制。");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
      >
        我的
      </button>

      {open ?
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vk-me-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 id="vk-me-title" className="text-lg font-semibold text-slate-900">
                我的账号
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                关闭
              </button>
            </div>

            {loading ?
              <p className="text-sm text-slate-600">加载中…</p>
            : err ?
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
            : me ?
              <div className="space-y-4 text-sm">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    用户名
                  </p>
                  <p className="font-mono text-base text-slate-900">{me.username}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    用户 ID
                  </p>
                  <p className="break-all font-mono text-xs text-slate-600">{me.id}</p>
                </div>
                {typeof me.clawPoints === "number" ?
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                      虾米积分
                    </p>
                    <p className="text-slate-900">{me.clawPoints}</p>
                  </div>
                : null}

                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    平台虚拟 Key（Darwin / LiteLLM）
                  </p>
                  {virtualKey ?
                    <>
                      <p className="mb-2 break-all rounded-lg bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800">
                        {virtualKey}
                      </p>
                      <button
                        type="button"
                        onClick={() => void copyKey()}
                        className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
                      >
                        {copied ? "已复制" : "复制 Key"}
                      </button>
                      <p className="mt-2 text-xs text-slate-500">
                        请勿截图外传；Key 与账号绑定，泄露可能导致额度被盗用。
                      </p>
                    </>
                  : noKey ?
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
                      尚未发放虚拟 Key。可在站内积分兑换中申请，或由管理员在后台为你开通。
                    </p>
                  : null}
                </div>
              </div>
            : null}
          </div>
        </div>
      : null}
    </>
  );
}
