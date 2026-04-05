"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AgeBand } from "@/lib/vibekids/age";
import { parseAgeBand } from "@/lib/vibekids/age";
import { VK_API_BASE, VK_BASE } from "@/lib/vibekids/constants";
import { welcomeHtml } from "@/lib/vibekids/demo-html";
import { PreviewFrame } from "@/components/vibekids/PreviewFrame";
import { GenerationSkeleton } from "@/components/vibekids/GenerationSkeleton";
import { getClientId } from "@/lib/vibekids/client-credits";
import {
  getPromptHistory,
  pushPromptHistory,
} from "@/lib/vibekids/client-prompt-history";
import { loadDraft, saveDraft } from "@/lib/vibekids/client-studio-draft";
import { clientVibekidsFetchMs } from "@/lib/vibekids/generate-timeouts";
import {
  type VibekidsTokenUsage,
  formatTokenUsageNotice,
} from "@/lib/vibekids/token-usage";

/** 略大于服务端墙钟截止，便于拿到 JSON 错误体 */
const VIBEKIDS_CLIENT_FETCH_MS = clientVibekidsFetchMs();

/** 已登录时走 ClawLive 后端 Darwin（LiteLLM + 平台虚拟 Key），与 /my-lobster 同源；未登录走 Next 上 OpenRouter/演示 */
function getVibekidsLlmEndpoint(): {
  url: string;
  extraHeaders: Record<string, string>;
} {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const base = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  if (token) {
    const url = base
      ? `${base}/api/lobster/vibekids-generate`
      : "/api/lobster/vibekids-generate";
    return { url, extraHeaders: { Authorization: `Bearer ${token}` } };
  }
  return { url: `${VK_API_BASE}/generate`, extraHeaders: {} };
}

function getDarwinChipsUrl(): string {
  const base = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  const path = "/api/lobster/vibekids-chips";
  return base ? `${base}${path}` : path;
}

/** Darwin 返回 401（登录过期或无效 token）时清除 token 并重试 Next 访客接口 */
async function postVibekidsLlm(
  body: Record<string, unknown>,
): Promise<{ res: Response; usedAuthFallback: boolean }> {
  const { url, extraHeaders } = getVibekidsLlmEndpoint();
  let res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(VIBEKIDS_CLIENT_FETCH_MS),
  });
  if (res.status === 401 && extraHeaders.Authorization) {
    try {
      localStorage.removeItem("token");
    } catch {
      /* ignore */
    }
    res = await fetch(`${VK_API_BASE}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(VIBEKIDS_CLIENT_FETCH_MS),
    });
    return { res, usedAuthFallback: true };
  }
  return { res, usedAuthFallback: false };
}

const CHIPS_PRIMARY = [
  "接球小游戏",
  "点击冒星星",
  "互动小故事",
  "倒计时番茄钟",
  "我的生日贺卡页",
];

const CHIPS_MIDDLE = [
  "简易贪吃蛇",
  "像素画板",
  "随机名言卡片",
  "单位换算小工具",
  "键盘钢琴",
  "待办清单一页版",
];

const ALL_CHIPS = [...CHIPS_PRIMARY, ...CHIPS_MIDDLE];

function randomPickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (copy.length && out.length < n) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]!);
  }
  return out;
}

/** Darwin 返回不足 6 条时用内置词补齐并去重 */
function ensureSixChips(fromModel: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of fromModel) {
    const t = c.trim().replace(/\s+/g, " ");
    if (t.length < 4 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 6) return out;
  }
  const pool = randomPickN([...ALL_CHIPS], ALL_CHIPS.length);
  for (const c of pool) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
    if (out.length >= 6) return out;
  }
  return out.length > 0 ? out : ALL_CHIPS.slice(0, 6);
}

function mergeChip(current: string, chip: string): string {
  const t = current.trim();
  if (!t) return chip;
  if (t.includes(chip)) return t;
  return `${t}；${chip}`;
}

type Vers = { list: string[]; index: number };

function initialVers(): Vers {
  return { list: [welcomeHtml()], index: 0 };
}

export function StudioClient() {
  const sp = useSearchParams();
  const age: AgeBand = useMemo(
    () => parseAgeBand(sp.get("age")),
    [sp],
  );

  const [prompt, setPrompt] = useState("");
  const promptRef = useRef("");
  const promptSeeded = useRef(false);

  useEffect(() => {
    if (promptSeeded.current) return;
    const raw = sp.get("prompt");
    if (!raw) return;
    try {
      setPrompt(decodeURIComponent(raw));
      promptSeeded.current = true;
    } catch {
      setPrompt(raw);
      promptSeeded.current = true;
    }
  }, [sp]);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  const [vers, setVers] = useState<Vers>(initialVers);
  const html = vers.list[vers.index] ?? welcomeHtml();

  const [loading, setLoading] = useState<null | "create" | "refine">(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveNameError, setSaveNameError] = useState<string | null>(null);
  const saveDialogInputRef = useRef<HTMLInputElement>(null);
  const [outMode, setOutMode] = useState<"idle" | "demo" | "ai">("idle");
  const [notice, setNotice] = useState<string | null>(null);

  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const [promptHist, setPromptHist] = useState<string[]>([]);
  const draftRestored = useRef(false);

  const [hasMainSiteToken, setHasMainSiteToken] = useState(false);

  const [quickChips, setQuickChips] = useState<string[]>([]);
  const [chipsLoading, setChipsLoading] = useState(false);

  const loadDarwinChips = useCallback(
    async (opts?: { exclude?: string[] }) => {
      let token: string | null = null;
      try {
        token = localStorage.getItem("token");
      } catch {
        token = null;
      }
      if (!token) {
        setQuickChips(randomPickN([...ALL_CHIPS], 6));
        return;
      }

      setChipsLoading(true);
      try {
        const res = await fetch(getDarwinChipsUrl(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ageBand: age,
            kind: "any",
            styles: [],
            prompt: promptRef.current.trim() || undefined,
            ...(opts?.exclude?.length ? { exclude: opts.exclude.slice(0, 12) } : {}),
          }),
          signal: AbortSignal.timeout(VIBEKIDS_CLIENT_FETCH_MS),
        });

        if (res.status === 401) {
          try {
            localStorage.removeItem("token");
          } catch {
            /* ignore */
          }
          setHasMainSiteToken(false);
          setQuickChips(randomPickN([...ALL_CHIPS], 6));
          return;
        }

        const data = (await res.json()) as {
          chips?: unknown;
          error?: string;
          detail?: string;
          message?: string;
        };

        if (!res.ok) {
          setQuickChips(ensureSixChips([]));
          if (res.status === 402 && typeof data.message === "string") {
            setNotice(data.message);
          } else if (
            res.status !== 401 &&
            res.status !== 402 &&
            res.status !== 403
          ) {
            setNotice(
              typeof data.detail === "string" ?
                data.detail
              : "快捷灵感加载失败，已改用内置示例。",
            );
          }
          return;
        }

        const raw =
          Array.isArray(data.chips) ?
            data.chips.filter(
              (x): x is string => typeof x === "string" && x.trim().length > 2,
            )
          : [];
        setQuickChips(ensureSixChips(raw.map((x) => x.trim().slice(0, 32))));
      } catch {
        setQuickChips(ensureSixChips([]));
      } finally {
        setChipsLoading(false);
      }
    },
    [age],
  );

  useEffect(() => {
    try {
      setHasMainSiteToken(!!localStorage.getItem("token"));
    } catch {
      setHasMainSiteToken(false);
    }
  }, []);

  useEffect(() => {
    if (hasMainSiteToken) {
      void loadDarwinChips();
      return;
    }
    setQuickChips(randomPickN([...ALL_CHIPS], 6));
  }, [hasMainSiteToken, age, loadDarwinChips]);

  useEffect(() => {
    setPromptHist(getPromptHistory());
  }, []);

  useEffect(() => {
    if (draftRestored.current) return;
    if (sp.get("prompt")) return;
    const d = loadDraft();
    const draftOk =
      d &&
      (d.age === age ||
        (age === "unified" && (d.age === "primary" || d.age === "middle")));
    if (!draftOk) return;
    draftRestored.current = true;
    setPrompt(d.prompt);
    setSaveTitle(d.saveTitle);
    const list = d.versList.length ? d.versList : [welcomeHtml()];
    const idx = Math.min(Math.max(0, d.versIndex), list.length - 1);
    setVers({ list, index: idx });
    setOutMode("demo");
  }, [age, sp]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const list = vers.list.slice(-2);
      const idx = Math.min(vers.index, list.length - 1);
      saveDraft({
        prompt,
        kind: "any",
        styles: [],
        age,
        saveTitle,
        refinePrompt: "",
        lockHint: "",
        versList: list,
        versIndex: idx >= 0 ? idx : 0,
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [prompt, age, saveTitle, vers.list, vers.index]);

  /** 仍为欢迎页唯一版本时不可保存 */
  const hasGeneratedPreview = !(vers.list.length === 1 && vers.index === 0);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasGeneratedPreview) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasGeneratedPreview]);

  const pushVersion = useCallback((nextHtml: string) => {
    setVers((v) => {
      const list = v.list.slice(0, v.index + 1);
      list.push(nextHtml);
      return { list, index: list.length - 1 };
    });
  }, []);

  const handleApiResponse = useCallback(
    (
      data: {
        html?: string;
        mode?: "demo" | "ai";
        warning?: string;
        detail?: string;
        hint?: string;
        tokenUsage?: VibekidsTokenUsage;
      },
      opts?: { authFallback?: boolean; resultKind?: "create" | "refine" },
    ) => {
      const nextHtml =
        typeof data.html === "string" ? data.html.trim() : "";
      if (!nextHtml) return false;
      if (data.warning === "refine_needs_ai") {
        setNotice(
          data.detail ??
            "未配置 AI 时无法智能修改。请配置密钥后重试，或改用「生成作品」重新做一版。",
        );
        return false;
      }
      pushVersion(nextHtml);
      setOutMode(data.mode === "ai" ? "ai" : "demo");
      if (data.warning === "ai_failed" && data.detail) {
        const tech = data.detail.slice(0, 200);
        const extra = data.hint ? ` ${data.hint}` : "";
        setNotice(`AI 暂时不可用，已保留上一版或演示。技术信息：${tech}${extra}`);
      } else if (!data.warning) {
        pushPromptHistory(prompt.trim());
        setPromptHist(getPromptHistory());
        const prefix = opts?.authFallback ? "登录已失效，已改用访客生成。" : "";
        const verb = opts?.resultKind === "refine" ? "修改" : "生成";
        const base = prefix ? `${prefix} ${verb}完成。` : `${verb}完成。`;
        const tok =
          data.mode === "ai" && data.tokenUsage ?
            ` ${formatTokenUsageNotice(data.tokenUsage)}`
          : "";
        setNotice(base + tok);
      } else {
        setNotice(null);
      }
      return true;
    },
    [prompt, pushVersion],
  );

  const generate = useCallback(async () => {
    const text = prompt.trim();
    if (!text) {
      setNotice("先写一句话描述你想做的东西，或点一个快捷词。");
      return;
    }
    setLoading("create");
    setNotice(null);
    try {
      const { res, usedAuthFallback } = await postVibekidsLlm({
        intent: "create",
        prompt: text,
        ageBand: age,
        kind: "any",
        styles: [],
        clientId: getClientId(),
      });
      const data = (await res.json()) as {
        html?: string;
        mode?: "demo" | "ai";
        warning?: string;
        detail?: string;
        hint?: string;
        creditsBalance?: number;
        tokenUsage?: VibekidsTokenUsage;
        error?: string;
        message?: string;
        balance?: number;
        need?: number;
        costCreate?: number;
        costRefine?: number;
      };
      if (res.status === 402 && data.error === "NO_KEY") {
        setNotice(
          data.message ??
            "Darwin 需要平台虚拟 Key。请先在积分兑换中申请 Key（与 /my-lobster 相同）。",
        );
        return;
      }
      if (res.status === 403 && data.error === "darwin_required") {
        setNotice(
          data.detail ??
            "请先申请 DarwinClaw（Darwin）后再使用 AI 生成；或退出登录后使用演示/OpenRouter。",
        );
        return;
      }
      if (res.status === 500 && data.error === "llm_failed") {
        setNotice(data.detail ?? "模型调用失败，请稍后再试。");
        return;
      }
      if (res.status === 402 && data.error === "insufficient_credits") {
        setNotice(
          `生成额度不足（本次需要 ${data.need ?? "?"}，当前 ${data.balance ?? 0}）。未配置 AI 时演示生成不扣费；配置 OpenRouter 后每次成功生成会扣额度。`,
        );
        return;
      }
      if (res.status === 400 && data.error === "client_id_required") {
        setNotice(data.detail ?? "请刷新页面后重试。");
        return;
      }
      if (!res.ok || typeof data.html !== "string" || !data.html.trim()) {
        setNotice("生成失败，请稍后再试。");
        return;
      }
      handleApiResponse(data, { authFallback: usedAuthFallback });
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === "AbortError" || e.name === "TimeoutError")
      ) {
        setNotice("请求等待过久已中断，请稍后再试或简化描述。");
      } else {
        setNotice("网络异常，检查一下连接后再试。");
      }
    } finally {
      setLoading(null);
    }
  }, [age, handleApiResponse, prompt]);

  const refineWork = useCallback(async () => {
    const text = prompt.trim();
    if (!hasGeneratedPreview) {
      setNotice("请先生成一版作品，再在描述里写想怎么改，然后点「修改作品」。");
      return;
    }
    if (!text) {
      setNotice("在描述里写清楚要怎么改（例如：把主色改成绿色、加一个重置按钮）。");
      return;
    }
    setLoading("refine");
    setNotice(null);
    try {
      const { res, usedAuthFallback } = await postVibekidsLlm({
        intent: "refine",
        currentHtml: html,
        refinementPrompt: text,
        ageBand: age,
        kind: "any",
        styles: [],
        clientId: getClientId(),
      });
      const data = (await res.json()) as {
        html?: string;
        mode?: "demo" | "ai";
        warning?: string;
        detail?: string;
        hint?: string;
        tokenUsage?: VibekidsTokenUsage;
        error?: string;
        message?: string;
        balance?: number;
        need?: number;
      };
      if (res.status === 402 && data.error === "NO_KEY") {
        setNotice(
          data.message ??
            "Darwin 需要平台虚拟 Key。请先在积分兑换中申请 Key（与 /my-lobster 相同）。",
        );
        return;
      }
      if (res.status === 403 && data.error === "darwin_required") {
        setNotice(
          data.detail ??
            "请先申请 DarwinClaw（Darwin）后再使用 AI 修改；或退出登录后使用演示/OpenRouter。",
        );
        return;
      }
      if (res.status === 500 && data.error === "llm_failed") {
        setNotice(data.detail ?? "模型调用失败，请稍后再试。");
        return;
      }
      if (res.status === 402 && data.error === "insufficient_credits") {
        setNotice(
          `修改额度不足（本次需要 ${data.need ?? "?"}，当前 ${data.balance ?? 0}）。`,
        );
        return;
      }
      if (res.status === 400 && data.error === "client_id_required") {
        setNotice(data.detail ?? "请刷新页面后重试。");
        return;
      }
      if (!res.ok || typeof data.html !== "string" || !data.html.trim()) {
        setNotice("修改失败，请稍后再试。");
        return;
      }
      handleApiResponse(data, {
        authFallback: usedAuthFallback,
        resultKind: "refine",
      });
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === "AbortError" || e.name === "TimeoutError")
      ) {
        setNotice("请求等待过久已中断，请稍后再试或简化修改说明。");
      } else {
        setNotice("网络异常，检查一下连接后再试。");
      }
    } finally {
      setLoading(null);
    }
  }, [age, handleApiResponse, hasGeneratedPreview, html, prompt]);

  useEffect(() => {
    if (!saveDialogOpen) return;
    const id = requestAnimationFrame(() => {
      saveDialogInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [saveDialogOpen]);

  useEffect(() => {
    if (!saveDialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        setSaveDialogOpen(false);
        setSaveNameError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveDialogOpen, saving]);

  const openSaveDialog = useCallback(() => {
    if (!hasGeneratedPreview) {
      setNotice("请先生成可预览的作品，再保存。");
      return;
    }
    setSaveNameError(null);
    setNotice(null);
    setSaveDialogOpen(true);
  }, [hasGeneratedPreview]);

  const confirmSaveWork = useCallback(async () => {
    const title = saveTitle.trim();
    if (!title) {
      setSaveNameError("请填写作品名称。");
      saveDialogInputRef.current?.focus();
      return;
    }
    setSaveNameError(null);
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`${VK_API_BASE}/works`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html,
          ageBand: age,
          prompt: prompt.trim() || undefined,
          kind: "any",
          title,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        id?: string;
        title?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        const msg =
          data.error === "storage_failed" ?
            `保存失败（服务器无法写入文件）。若部署在无本地磁盘的环境，需使用数据库。${data.detail ? ` ${data.detail}` : ""}`
          : data.error === "html_too_large" ?
            "作品体积过大，请删减后再试。"
          : (data.error ?? "保存失败");
        setNotice(msg);
        return;
      }
      if (data.ok && data.id) {
        setSaveDialogOpen(false);
        setNotice(
          `已保存「${data.title ?? "作品"}」。在「我的作品」中发布到广场后计 5 分；他人点赞每条计 1 分。默认未发布。预览：${VK_BASE}/works/${data.id}`,
        );
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
          void Notification.requestPermission();
        } else if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("VibeKids", { body: `已保存：${data.title ?? "作品"}` });
        }
      }
    } catch {
      setNotice("网络异常，保存未成功。");
    } finally {
      setSaving(false);
    }
  }, [age, html, prompt, saveTitle]);

  const closeSaveDialog = useCallback(() => {
    if (saving) return;
    setSaveDialogOpen(false);
    setSaveNameError(null);
  }, [saving]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:h-[calc(100dvh-3.25rem)] lg:min-h-0 lg:flex-row lg:items-stretch lg:gap-0">
      <section className="flex w-full shrink-0 flex-col gap-4 border-b border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 lg:max-w-[min(22rem,100vw)] lg:border-b-0 lg:border-r lg:border-t-0 lg:border-l-0 lg:overflow-y-auto lg:py-5 lg:pl-2 lg:pr-5">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-800">快捷灵感（可多点）</p>
          <div className="flex flex-wrap gap-2">
            {quickChips.map((c, i) => (
              <button
                key={`${i}-${c}`}
                type="button"
                onClick={() => setPrompt((p) => mergeChip(p, c))}
                disabled={chipsLoading || loading !== null}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 disabled:opacity-50"
              >
                {c}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (hasMainSiteToken) {
                  void loadDarwinChips({ exclude: quickChips });
                } else {
                  setQuickChips(randomPickN([...ALL_CHIPS], 6));
                }
              }}
              disabled={loading !== null || (hasMainSiteToken && chipsLoading)}
              className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm text-sky-800 transition hover:bg-sky-100 disabled:opacity-50"
            >
              {hasMainSiteToken && chipsLoading ? "加载中…" : "换一批"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="prompt" className="text-sm font-medium text-slate-800">
            用一句话说出你的想法（任意场景）
          </label>
          {promptHist.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="prompt-hist" className="text-xs text-slate-500">
                历史描述
              </label>
              <select
                id="prompt-hist"
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setPrompt(v);
                  e.target.selectedIndex = 0;
                }}
                className="max-w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
              >
                <option value="">选一条填充到上方</option>
                {promptHist.map((h, i) => (
                  <option key={`${i}-${h.slice(0, 24)}`} value={h}>
                    {h.length > 52 ? `${h.slice(0, 52)}…` : h}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            placeholder={
              "可短可长。短例：点点会冒星星的页面。长例：计数器，可选主题色、记录点击次数、带重置按钮。"
            }
            className="min-h-[8.5rem] w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none ring-sky-400/40 focus:border-sky-400 focus:ring-4"
          />
        </div>

        {notice ? (
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading !== null}
            className="rounded-2xl bg-gradient-to-r from-sky-500 to-violet-500 px-5 py-2.5 text-base font-semibold text-white shadow-md transition hover:brightness-105 disabled:opacity-60"
          >
            {loading === "create" ? "生成中…" : "生成作品"}
          </button>
          <button
            type="button"
            onClick={() => void refineWork()}
            disabled={
              loading !== null || !hasGeneratedPreview || !prompt.trim()
            }
            className="rounded-xl border border-violet-300 bg-white px-3 py-2 text-sm font-medium text-violet-900 transition hover:bg-violet-50 disabled:opacity-40"
          >
            {loading === "refine" ? "修改中…" : "修改作品"}
          </button>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading !== null || !prompt.trim()}
            className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 disabled:opacity-40"
          >
            再来一版
          </button>
          <button
            type="button"
            onClick={openSaveDialog}
            disabled={saving || loading !== null || !hasGeneratedPreview}
            className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50"
          >
            保存作品
          </button>
        </div>
      </section>

      <section className="flex min-h-[min(480px,54vh)] min-w-0 flex-1 flex-col gap-2 px-3 pb-4 pt-2 sm:px-4 lg:h-full lg:min-h-0 lg:min-w-0 lg:flex-1 lg:px-5 lg:pb-5 lg:pt-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">实时预览</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              版本 {vers.index + 1} / {vers.list.length}
            </span>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {outMode === "ai" ? "AI 生成" : outMode === "demo" ? "演示 / 离线" : "欢迎"}
          </span>
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/80 p-1.5 lg:min-h-[min(540px,60dvh)]">
          {loading !== null ? <GenerationSkeleton mode={loading} /> : null}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col [min-height:min(400px,50vh)] lg:[min-height:0]">
            <PreviewFrame html={html} frameKey={vers.index} />
          </div>
        </div>
      </section>

      {saveDialogOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="关闭"
            disabled={saving}
            onClick={closeSaveDialog}
            className="absolute inset-0 bg-slate-900/45 disabled:pointer-events-none"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="保存作品"
            className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <label htmlFor="save-dialog-title-input" className="block text-sm font-medium text-slate-800">
              作品名称
            </label>
            <input
              ref={saveDialogInputRef}
              id="save-dialog-title-input"
              type="text"
              value={saveTitle}
              onChange={(e) => {
                setSaveTitle(e.target.value);
                if (saveNameError) setSaveNameError(null);
              }}
              placeholder="保存前请填写，例如：我的接球小游戏"
              disabled={saving}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-sky-400/30 focus:border-sky-400 focus:ring-2 disabled:opacity-50"
            />
            {saveNameError ? (
              <p className="mt-2 text-sm text-red-600">{saveNameError}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeSaveDialog}
                disabled={saving}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void confirmSaveWork()}
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "保存中…" : "确认保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
