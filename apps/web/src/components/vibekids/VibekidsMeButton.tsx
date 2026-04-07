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
  platformLlmModel?: string;
};

type LlmUsageLog = {
  request_id?: string;
  model?: string;
  spend?: number;
  total_tokens?: number;
};

type KeyStatsPayload = {
  maxBudgetUsd: number | null;
  spendUsd: number;
  remainingUsd: number | null;
  usageLogs: LlmUsageLog[];
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
  const [keyStats, setKeyStats] = useState<KeyStatsPayload | null>(null);
  const [keyStatsErr, setKeyStatsErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setMe(null);
    setLlmInfo(null);
    setVirtualKey(null);
    setKeyStats(null);
    setKeyStatsErr(null);
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

      const [rMe, rKey, rLlm, rKs] = await Promise.all([
        fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/points/llm/virtual-key", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/points/llm", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/points/llm/key-stats", {
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
          platformLlmModel:
            typeof lm.platformLlmModel === "string" ? lm.platformLlmModel : undefined,
        });
      }

      if (rKs.ok) {
        const ksBody = (await rKs.json()) as { keyStats?: KeyStatsPayload | null };
        const ks = ksBody.keyStats;
        if (
          ks &&
          typeof ks.spendUsd === "number" &&
          Array.isArray(ks.usageLogs)
        ) {
          setKeyStats({
            maxBudgetUsd:
              typeof ks.maxBudgetUsd === "number" || ks.maxBudgetUsd === null ?
                ks.maxBudgetUsd
              : null,
            spendUsd: ks.spendUsd,
            remainingUsd:
              typeof ks.remainingUsd === "number" || ks.remainingUsd === null ?
                ks.remainingUsd
              : null,
            usageLogs: ks.usageLogs,
          });
        } else {
          setKeyStats(null);
        }
        setKeyStatsErr(null);
      } else if (rKs.status === 404) {
        setKeyStats(null);
        setKeyStatsErr(null);
      } else {
        setKeyStats(null);
        setKeyStatsErr(
          rKs.status === 503 ?
            "平台未配置 LiteLLM，暂无消耗统计。"
          : "消耗数据暂时拉取失败，请稍后重试。",
        );
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

                {virtualKey || llmInfo?.hasVirtualKey ?
                  <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                      模型消耗（LiteLLM）
                    </p>
                    {llmInfo?.platformLlmModel ?
                      <p className="mb-2 break-all text-[11px] leading-snug text-slate-600">
                        当前出站模型：<span className="font-mono text-slate-800">{llmInfo.platformLlmModel}</span>
                      </p>
                    : null}
                    {keyStats ?
                      <>
                        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3 sm:gap-x-3">
                          <div>
                            <dt className="text-xs text-slate-500">累计已用（美元）</dt>
                            <dd className="font-mono font-medium text-slate-900">
                              ${keyStats.spendUsd.toFixed(4)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">预算上限</dt>
                            <dd className="font-mono text-slate-900">
                              {keyStats.maxBudgetUsd != null ?
                                `$${keyStats.maxBudgetUsd.toFixed(4)}`
                              : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-slate-500">剩余额度</dt>
                            <dd className="font-mono text-slate-900">
                              {keyStats.remainingUsd != null ?
                                `$${keyStats.remainingUsd.toFixed(4)}`
                              : "—"}
                            </dd>
                          </div>
                        </dl>
                        {keyStats.usageLogs.length > 0 ?
                          <div className="mt-3 border-t border-slate-200/80 pt-2">
                            <p className="mb-1.5 text-[11px] font-medium text-slate-500">
                              最近调用（最多 5 条）
                            </p>
                            <ul className="space-y-1.5 text-[11px] text-slate-700">
                              {keyStats.usageLogs.slice(0, 5).map((log, i) => (
                                <li
                                  key={log.request_id ?? `u-${i}`}
                                  className="flex flex-col gap-0.5 rounded-md bg-white/90 px-2 py-1.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-x-2"
                                >
                                  <span className="break-all font-mono text-slate-800">
                                    {log.model ?? "未知模型"}
                                  </span>
                                  <span className="shrink-0 font-mono text-slate-600">
                                    {typeof log.spend === "number" ?
                                      `$${log.spend.toFixed(4)}`
                                    : "—"}
                                    {typeof log.total_tokens === "number" ?
                                      ` · ${log.total_tokens.toLocaleString()} tokens`
                                    : ""}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        : null}
                        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                          金额以 LiteLLM 代理统计为准；与单次请求 tokens、模型单价有关。
                        </p>
                      </>
                    : keyStatsErr ?
                      <p className="text-sm text-amber-800">{keyStatsErr}</p>
                    : virtualKey ?
                      <p className="text-xs text-slate-500">
                        消耗明细暂不可用（代理未返回统计时可稍后再开）。
                      </p>
                    : null}
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
