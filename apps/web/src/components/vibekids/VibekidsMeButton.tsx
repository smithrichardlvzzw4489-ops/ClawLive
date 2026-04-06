"use client";

import { useCallback, useState } from "react";

type MeJson = {
  id: string;
  username: string;
  email?: string | null;
  clawPoints?: number;
};

type PointsLlmJson = {
  clawPoints: number;
  minRedeemPoints: number;
  litellmConfigured: boolean;
  hasVirtualKey: boolean;
  virtualKeyMasked?: string | null;
};

type MeButtonProps = {
  /** 触发按钮样式（如底部导航用小号） */
  triggerClassName?: string;
};

export function VibekidsMeButton({ triggerClassName }: MeButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [me, setMe] = useState<MeJson | null>(null);
  const [llmInfo, setLlmInfo] = useState<PointsLlmJson | null>(null);
  const [virtualKey, setVirtualKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setMe(null);
    setLlmInfo(null);
    setVirtualKey(null);
    setCopied(false);
    try {
      let token: string | null = null;
      try {
        token = localStorage.getItem("token");
      } catch {
        /* ignore */
      }
      if (!token) {
        setErr(
          "未登录。生成、保存、发布需先登录；浏览作品无需登录。微信小程序请打开本小程序「登录」页授权。",
        );
        setLoading(false);
        return;
      }

      const [rMe, rKey, rLlm] = await Promise.all([
        fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/points/llm/virtual-key", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/points/llm", {
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

      if (rLlm.ok) {
        const lm = (await rLlm.json()) as PointsLlmJson;
        setLlmInfo({
          clawPoints: lm.clawPoints,
          minRedeemPoints: lm.minRedeemPoints,
          litellmConfigured: lm.litellmConfigured,
          hasVirtualKey: lm.hasVirtualKey,
          virtualKeyMasked: lm.virtualKeyMasked ?? null,
        });
      }

      if (rKey.ok) {
        const k = (await rKey.json()) as { virtualKey?: string };
        setVirtualKey(typeof k.virtualKey === "string" ? k.virtualKey : null);
      } else {
        setVirtualKey(null);
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

  const redeemForKey = async () => {
    let token: string | null = null;
    try {
      token = localStorage.getItem("token");
    } catch {
      /* ignore */
    }
    if (!token || !llmInfo) return;
    setRedeeming(true);
    setErr(null);
    try {
      const r = await fetch("/api/points/redeem-llm", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clawPoints: llmInfo.minRedeemPoints }),
      });
      const data = (await r.json()) as {
        error?: string;
        message?: string;
        minRedeemPoints?: number;
      };
      if (!r.ok) {
        if (data.error === "INSUFFICIENT_POINTS") {
          setErr(
            `积分不足，兑换需要至少 ${llmInfo.minRedeemPoints} 虾米积分。请重新登录小程序以同步最新积分。`,
          );
        } else if (data.error === "LITELLM_NOT_CONFIGURED") {
          setErr("平台尚未配置 LiteLLM，暂时无法兑换。");
        } else if (data.error === "INVALID_POINTS") {
          setErr(`兑换积分无效（最低 ${data.minRedeemPoints ?? llmInfo.minRedeemPoints}）。`);
        } else {
          setErr(data.message ?? data.error ?? `兑换失败（HTTP ${r.status}）`);
        }
        return;
      }
      await load();
    } catch {
      setErr("兑换请求失败，请稍后重试。");
    } finally {
      setRedeeming(false);
    }
  };

  const pointsDisplay =
    llmInfo ? llmInfo.clawPoints : me?.clawPoints;

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className={
          triggerClassName?.trim() ||
          "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
        }
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
            : err && !me ?
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
            : me ?
              <div className="space-y-4 text-sm">
                {err ?
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</p>
                : null}

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
                {typeof pointsDisplay === "number" ?
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                      虾米积分
                    </p>
                    <p className="text-slate-900">{pointsDisplay}</p>
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
                      {llmInfo?.litellmConfigured ?
                        <button
                          type="button"
                          disabled={redeeming || (llmInfo.clawPoints < llmInfo.minRedeemPoints)}
                          onClick={() => void redeemForKey()}
                          className="mt-3 w-full rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 transition hover:bg-violet-100 disabled:opacity-50"
                        >
                          {redeeming ?
                            "兑换中…"
                          : `再消耗 ${llmInfo.minRedeemPoints} 积分为 Key 增加额度`}
                        </button>
                      : null}
                    </>
                  :
                    <div className="space-y-3 rounded-lg bg-slate-50 px-3 py-3 text-slate-700">
                      {!llmInfo ?
                        <p>无法加载积分信息，请稍后重试或刷新页面。</p>
                      : !llmInfo.litellmConfigured ?
                        <p>平台尚未配置 LiteLLM，无法在线兑换虚拟 Key。</p>
                      : <>
                          <p>
                            使用{" "}
                            <strong>{llmInfo.minRedeemPoints}</strong>{" "}
                            虾米积分可兑换（或增加）LiteLLM 虚拟 Key 对应额度。当前余额{" "}
                            <strong>{llmInfo.clawPoints}</strong>。
                          </p>
                          <button
                            type="button"
                            disabled={
                              redeeming ||
                              llmInfo.clawPoints < llmInfo.minRedeemPoints
                            }
                            onClick={() => void redeemForKey()}
                            className="w-full rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            {redeeming ?
                              "兑换中…"
                            : `用 ${llmInfo.minRedeemPoints} 积分兑换虚拟 Key`}
                          </button>
                          {llmInfo.clawPoints < llmInfo.minRedeemPoints ?
                            <p className="text-xs text-amber-800">
                              积分不足。新用户登录通常会补足到最低兑换线；也可联系管理员调整积分。
                            </p>
                          : null}
                        </>
                      }
                    </div>
                  }
                </div>
              </div>
            : null}
          </div>
        </div>
      : null}
    </>
  );
}
