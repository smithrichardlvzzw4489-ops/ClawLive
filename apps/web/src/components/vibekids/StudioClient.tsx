"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AgeBand } from "@/lib/vibekids/age";
import { parseAgeBand } from "@/lib/vibekids/age";
import { VK_API_BASE, VK_BASE, vibekidsBearerHeader } from "@/lib/vibekids/constants";
import { welcomeHtml } from "@/lib/vibekids/demo-html";
import { PreviewFrame } from "@/components/vibekids/PreviewFrame";
import { GenerationSkeleton } from "@/components/vibekids/GenerationSkeleton";
import { getClientId } from "@/lib/vibekids/client-credits";
import { pushPromptHistory } from "@/lib/vibekids/client-prompt-history";
import { resolveComposerIntent } from "@/lib/vibekids/infer-composer-intent";
import { loadDraft, saveDraft } from "@/lib/vibekids/client-studio-draft";
import {
  clientVibekidsFetchMs,
  vibekidsFetchAbortSignal,
} from "@/lib/vibekids/generate-timeouts";
import {
  VibekidsRequestError,
  logVibekidsConnectivityDiag,
  noticeFromVibekidsFailure,
} from "@/lib/vibekids/client-request-errors";
import {
  type VibekidsTokenUsage,
  formatTokenUsageNotice,
} from "@/lib/vibekids/token-usage";

/** 略大于服务端墙钟截止，便于拿到 JSON 错误体 */
const VIBEKIDS_CLIENT_FETCH_MS = clientVibekidsFetchMs();

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/** 常见「仅后端」托管域：浏览器应走当前站点 /api 反代，避免小程序 web-view 合法域名不含该主机 */
function isSeparateBackendDeployHost(hostname: string): boolean {
  return (
    hostname.endsWith(".up.railway.app") ||
    hostname.endsWith(".railway.app")
  );
}

/**
 * 已登录时 Lobster API 使用的「站点根」。
 * - 构建里若误把 NEXT_PUBLIC_API_URL 设为 localhost，而用户实际在公网打开 → 走相对 /api。
 * - 若指向 Railway 等独立域名，而当前页是 www.clawlab.live 等前台域 → 仍走相对 /api（Next 反代），
 *   否则微信 web-view 往往未把 *.railway.app 加入 request 合法域名，会「网络异常」。
 */
function resolveLobsterApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  if (!raw) return "";
  if (typeof window === "undefined") return raw;
  const pageOrigin = window.location.origin.replace(/\/$/, "");
  if (raw === pageOrigin) return "";
  const pageHost = window.location.hostname;
  try {
    const envUrl = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (isLoopbackHost(envUrl.hostname) && !isLoopbackHost(pageHost)) {
      return "";
    }
    if (
      envUrl.hostname !== pageHost &&
      !isLoopbackHost(pageHost) &&
      isSeparateBackendDeployHost(envUrl.hostname)
    ) {
      return "";
    }
  } catch {
    return raw;
  }
  return raw;
}

/** 创作生成/修改仅允许已登录用户走 Darwin（LiteLLM）；未登录时由界面拦截，不调用本接口 */
function getVibekidsLlmEndpoint(): {
  url: string;
  extraHeaders: Record<string, string>;
} {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const base = resolveLobsterApiBase();
  const t = token?.trim();
  if (t) {
    const url = base
      ? `${base}/api/lobster/vibekids-generate`
      : "/api/lobster/vibekids-generate";
    return { url, extraHeaders: { Authorization: `Bearer ${t}` } };
  }
  return { url: `${VK_API_BASE}/generate`, extraHeaders: {} };
}

function hasVibekidsAuthToken(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(localStorage.getItem("token")?.trim());
  } catch {
    return false;
  }
}

const VK_LOGIN_NOTICE =
  "生成、修改、保存、发布作品需要先登录。微信小程序请在本小程序「登录」页授权后重新进入创作室；浏览器请使用主站账号登录。浏览广场与作品无需登录。";

function getDarwinChipsUrl(): string {
  const base = resolveLobsterApiBase();
  const path = "/api/lobster/vibekids-chips";
  return base ? `${base}${path}` : path;
}

/** Darwin：不再在 401/403 时回退匿名生成（匿名通道已关闭） */
async function postVibekidsLlm(
  body: Record<string, unknown>,
): Promise<{ res: Response }> {
  const { url, extraHeaders } = getVibekidsLlmEndpoint();
  const firstPhase = extraHeaders.Authorization ? "auth_llm" : "guest_llm";
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
      signal: vibekidsFetchAbortSignal(VIBEKIDS_CLIENT_FETCH_MS),
    });
  } catch (err) {
    throw new VibekidsRequestError(firstPhase, url, err);
  }
  if (res.status === 401 && extraHeaders.Authorization) {
    try {
      localStorage.removeItem("token");
    } catch {
      /* ignore */
    }
  }
  return { res };
}

type VibekidsLlmResponseBody = {
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

type VibekidsSaveWorkBody = {
  ok?: boolean;
  id?: string;
  title?: string;
  error?: string;
  detail?: string;
};

/** 代理/网关若返回 HTML 或空体，`res.json()` 会抛错并被误判为「网络异常」 */
async function readJsonBody<T>(res: Response): Promise<
  { ok: true; data: T } | { ok: false; message: string }
> {
  const raw = await res.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      message: res.ok
        ? "服务返回为空，请稍后重试。"
        : `服务暂时不可用（HTTP ${res.status}），请稍后重试。`,
    };
  }
  try {
    return { ok: true, data: JSON.parse(trimmed) as T };
  } catch {
    return {
      ok: false,
      message: res.ok
        ? "服务返回格式异常，请稍后重试。"
        : `服务暂时不可用（HTTP ${res.status}），请稍后重试。`,
    };
  }
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

const INSPIRATION_COUNT = 3;

/** Darwin 返回不足 3 条时用内置词补齐并去重 */
function ensureThreeChips(fromModel: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of fromModel) {
    const t = c.trim().replace(/\s+/g, " ");
    if (t.length < 4 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= INSPIRATION_COUNT) return out;
  }
  const pool = randomPickN([...ALL_CHIPS], ALL_CHIPS.length);
  for (const c of pool) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
    if (out.length >= INSPIRATION_COUNT) return out;
  }
  return out.length > 0 ? out : ALL_CHIPS.slice(0, INSPIRATION_COUNT);
}

/** 创作室主操作与灵感标签：统一小圆角（含小程序 web-view） */
const STUDIO_OUTLINE_BTN =
  "inline-flex shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40 sm:px-3 sm:text-xs";
function SendPlaneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function SaveDiskIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
      />
    </svg>
  );
}

type Vers = { list: string[]; index: number };

function initialVers(): Vers {
  return { list: [welcomeHtml()], index: 0 };
}

type WxMiniProgramBridge = { navigateTo?: (opts: { url: string }) => void };

export function StudioClient() {
  const router = useRouter();
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
  const [notice, setNotice] = useState<string | null>(null);

  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);

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
        setQuickChips(randomPickN([...ALL_CHIPS], INSPIRATION_COUNT));
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
          signal: vibekidsFetchAbortSignal(VIBEKIDS_CLIENT_FETCH_MS),
        });

        if (res.status === 401) {
          try {
            localStorage.removeItem("token");
          } catch {
            /* ignore */
          }
          setHasMainSiteToken(false);
          setQuickChips(randomPickN([...ALL_CHIPS], INSPIRATION_COUNT));
          return;
        }

        const data = (await res.json()) as {
          chips?: unknown;
          error?: string;
          detail?: string;
          message?: string;
        };

        if (!res.ok) {
          setQuickChips(ensureThreeChips([]));
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
              : "灵感提示加载失败，已改用内置示例。",
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
        setQuickChips(ensureThreeChips(raw.map((x) => x.trim().slice(0, 32))));
      } catch {
        setQuickChips(ensureThreeChips([]));
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
    setQuickChips(randomPickN([...ALL_CHIPS], INSPIRATION_COUNT));
  }, [hasMainSiteToken, age, loadDarwinChips]);

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
      opts?: {
        resultKind?: "create" | "refine";
        historyPrompt?: string;
        reusedHistory?: boolean;
      },
    ) => {
      const nextHtml =
        typeof data.html === "string" ? data.html.trim() : "";
      if (!nextHtml) return false;
      if (data.warning === "refine_needs_ai") {
        setNotice(
          data.detail ??
            "未配置 AI 时无法智能修改。请配置密钥后重试，或发一句从零描述的需求重新生成。",
        );
        return false;
      }
      pushVersion(nextHtml);
      if (data.warning === "ai_failed" && data.detail) {
        const tech = data.detail.slice(0, 200);
        const extra = data.hint ? ` ${data.hint}` : "";
        setNotice(`AI 暂时不可用，已保留上一版或演示。技术信息：${tech}${extra}`);
      } else if (!data.warning) {
        const histLine = (opts?.historyPrompt ?? prompt).trim();
        if (histLine && opts?.resultKind !== "refine") {
          pushPromptHistory(histLine);
        }
        const verb = opts?.resultKind === "refine" ? "修改" : "生成";
        let base = `${verb}完成。`;
        if (opts?.reusedHistory && opts?.resultKind !== "refine") {
          base += " 已沿用上一句描述重做一版。";
        }
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

  const generate = useCallback(
    async (textOverride?: string, meta?: { reusedHistory?: boolean }) => {
    const text = (textOverride ?? prompt).trim();
    if (!text) {
      setNotice("先写一句话描述你想做的东西，或点一个快捷词。");
      return;
    }
    if (!hasVibekidsAuthToken()) {
      setNotice(VK_LOGIN_NOTICE);
      return;
    }
    setLoading("create");
    setNotice(null);
    try {
      const { res } = await postVibekidsLlm({
        intent: "create",
        prompt: text,
        ageBand: age,
        kind: "any",
        styles: [],
        clientId: getClientId(),
      });
      const parsed = await readJsonBody<VibekidsLlmResponseBody>(res);
      if (!parsed.ok) {
        setNotice(parsed.message);
        return;
      }
      const data = parsed.data;
      if (res.status === 401 && data.error === "login_required") {
        setNotice(VK_LOGIN_NOTICE);
        return;
      }
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
            "暂无 Darwin 创作权限。请稍后再试或联系管理员；若使用微信小程序请确认已登录并完成授权。",
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
        const errTag =
          typeof data.error === "string" ? `（${data.error}）` : "";
        setNotice(`生成失败（HTTP ${res.status}）${errTag}，请稍后再试。`);
        return;
      }
      handleApiResponse(data, {
        resultKind: "create",
        historyPrompt: text,
        reusedHistory: meta?.reusedHistory,
      });
    } catch (e) {
      void logVibekidsConnectivityDiag("generate");
      console.error("[VibeKids] generate failed:", e);
      setNotice(noticeFromVibekidsFailure(e));
    } finally {
      setLoading(null);
    }
  },
  [age, handleApiResponse, prompt],
  );

  const refineWork = useCallback(
    async (textOverride?: string) => {
    const text = (textOverride ?? prompt).trim();
    if (!hasGeneratedPreview) {
      setNotice("请先生成一版作品，再描述想怎么改。");
      return;
    }
    if (!text) {
      setNotice("在描述里写清楚要怎么改（例如：把主色改成绿色、加一个重置按钮）。");
      return;
    }
    if (!hasVibekidsAuthToken()) {
      setNotice(VK_LOGIN_NOTICE);
      return;
    }
    setLoading("refine");
    setNotice(null);
    try {
      const { res } = await postVibekidsLlm({
        intent: "refine",
        currentHtml: html,
        refinementPrompt: text,
        ageBand: age,
        kind: "any",
        styles: [],
        clientId: getClientId(),
      });
      const parsed = await readJsonBody<VibekidsLlmResponseBody>(res);
      if (!parsed.ok) {
        setNotice(parsed.message);
        return;
      }
      const data = parsed.data;
      if (res.status === 401 && data.error === "login_required") {
        setNotice(VK_LOGIN_NOTICE);
        return;
      }
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
            "暂无 Darwin 创作权限。请稍后再试或联系管理员；若使用微信小程序请确认已登录并完成授权。",
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
        const errTag =
          typeof data.error === "string" ? `（${data.error}）` : "";
        setNotice(`修改失败（HTTP ${res.status}）${errTag}，请稍后再试。`);
        return;
      }
      handleApiResponse(data, {
        resultKind: "refine",
        historyPrompt: text,
      });
    } catch (e) {
      void logVibekidsConnectivityDiag("refine");
      console.error("[VibeKids] refine failed:", e);
      setNotice(noticeFromVibekidsFailure(e, { refine: true }));
    } finally {
      setLoading(null);
    }
  },
  [age, handleApiResponse, hasGeneratedPreview, html, prompt],
  );

  const openVibekidsLogin = useCallback(() => {
    if (typeof window === "undefined") return;
    const wx = (window as unknown as { wx?: { miniProgram?: WxMiniProgramBridge } })
      .wx;
    if (typeof wx?.miniProgram?.navigateTo === "function") {
      wx.miniProgram.navigateTo({ url: "/pages/login/login" });
      return;
    }
    const path = `${window.location.pathname}${window.location.search}`;
    router.push(`/login?redirect=${encodeURIComponent(path)}`);
  }, [router]);

  const submitComposer = useCallback(async () => {
    const resolved = resolveComposerIntent(prompt, hasGeneratedPreview);
    if (resolved.kind === "empty") {
      setNotice(
        "先写一句话，或点一个灵感词。已有作品时，会根据内容自动选择「修改当前版」或「新做一版」。",
      );
      return;
    }
    if (resolved.kind === "redo_needs_history") {
      setNotice(
        "「再来一版」需要先成功生成过至少一次；也可以直接写出完整的新想法。",
      );
      return;
    }
    if (resolved.kind === "refine") {
      await refineWork(resolved.prompt);
      return;
    }
    await generate(resolved.prompt, {
      reusedHistory: resolved.reusedHistory,
    });
  }, [generate, hasGeneratedPreview, prompt, refineWork]);

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
        headers: {
          "Content-Type": "application/json",
          ...vibekidsBearerHeader(),
        },
        body: JSON.stringify({
          html,
          ageBand: age,
          prompt: prompt.trim() || undefined,
          kind: "any",
          title,
        }),
      });
      const parsed = await readJsonBody<VibekidsSaveWorkBody>(res);
      if (!parsed.ok) {
        setNotice(parsed.message);
        return;
      }
      const data = parsed.data;
      if (!res.ok) {
        const msg =
          res.status === 401 || data.error === "login_required" ?
            "请先登录主站账号后再保存，作品将同步到「我的作品」。"
          : data.error === "storage_failed" ?
            `保存失败（服务器无法写入）。${data.detail ? ` ${data.detail}` : ""}`
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
    } catch (e) {
      void logVibekidsConnectivityDiag("save work");
      console.error("[VibeKids] save failed:", e);
      setNotice(noticeFromVibekidsFailure(e));
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
    <div className="relative flex h-full min-h-0 flex-1 flex-col justify-start gap-0 overflow-y-auto overscroll-y-contain bg-slate-50 lg:h-[calc(100dvh-3.25rem)] lg:flex-row lg:items-stretch lg:overflow-visible">
      <button
        type="button"
        onClick={openSaveDialog}
        disabled={saving || loading !== null || !hasGeneratedPreview}
        title="保存作品"
        aria-label="保存作品"
        className="fixed z-[90] flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-slate-700 shadow-md backdrop-blur-sm transition hover:border-sky-300 hover:bg-sky-50/90 hover:text-sky-900 disabled:pointer-events-none disabled:opacity-35 max-lg:right-3 max-lg:top-[max(0.5rem,env(safe-area-inset-top,0px))] lg:right-5 lg:top-[calc(env(safe-area-inset-top,0px)+4.25rem)]"
      >
        <SaveDiskIcon className="h-5 w-5" />
      </button>

      <section className="flex w-full max-lg:flex-shrink-0 flex-col gap-0 overflow-hidden bg-slate-50 max-lg:px-0 max-lg:pt-1 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:px-5 lg:pb-5 lg:pt-4">
        <div className="relative flex min-h-0 w-full max-lg:h-[58vh] max-lg:max-h-[640px] max-lg:min-h-[280px] max-lg:shrink-0 flex-col overflow-hidden max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none lg:h-full lg:max-h-none lg:min-h-[min(520px,58dvh)] lg:shrink lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:shadow-sm lg:flex-1">
          {loading !== null ? <GenerationSkeleton mode={loading} /> : null}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <PreviewFrame html={html} frameKey={vers.index} />
          </div>
        </div>
      </section>

      <section className="flex w-full flex-shrink-0 flex-col gap-3 border-b border-slate-200/80 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-sm sm:p-4 lg:order-1 lg:max-w-[min(22rem,100vw)] lg:gap-4 lg:border-b-0 lg:border-r lg:border-t-0 lg:border-l-0 lg:overflow-y-auto lg:p-5 lg:pb-5 lg:pl-2 lg:pr-5">
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-700">灵感提示</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {quickChips.map((c, i) => (
              <button
                key={`${i}-${c}`}
                type="button"
                onClick={() => setPrompt(c)}
                disabled={chipsLoading || loading !== null}
                className={STUDIO_OUTLINE_BTN}
              >
                {c}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (hasMainSiteToken) {
                  void loadDarwinChips({ exclude: quickChips });
                } else {
                  setQuickChips(randomPickN([...ALL_CHIPS], INSPIRATION_COUNT));
                }
              }}
              disabled={loading !== null || (hasMainSiteToken && chipsLoading)}
              className={STUDIO_OUTLINE_BTN}
            >
              {hasMainSiteToken && chipsLoading ? "加载中…" : "换一批"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border-2 border-sky-300/55 bg-white p-2.5 shadow-[0_0_0_1px_rgba(125,211,252,0.12)] sm:p-3">
          <label htmlFor="prompt" className="sr-only">
            描述想法；Enter 发送（自动识别新作品或修改），Shift+Enter 换行
          </label>
          <div className="flex items-end gap-2">
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey) return;
                e.preventDefault();
                void submitComposer();
              }}
              rows={2}
              placeholder="描述想法… 已有作品时会自动判断修改或新做；Enter 发送 · Shift+Enter 换行"
              className="min-h-[2.875rem] max-h-40 w-full flex-1 resize-y rounded-3xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-snug text-slate-900 outline-none ring-sky-400/35 placeholder:text-slate-400 focus:border-sky-400 focus:ring-[3px] sm:text-[15px]"
            />
            <button
              type="button"
              onClick={() => void submitComposer()}
              disabled={loading !== null}
              title="发送（自动识别新作品或修改当前版）"
              aria-label={
                loading === "create" ?
                  "生成中"
                : loading === "refine" ?
                  "修改中"
                : "发送"
              }
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-md transition hover:bg-violet-700 disabled:pointer-events-none disabled:opacity-40"
            >
              {loading !== null ?
                <span className="h-5 w-5 animate-pulse rounded-full bg-white/90" />
              : <SendPlaneIcon className="ml-0.5 h-5 w-5" />}
            </button>
          </div>
        </div>

        {notice ? (
          <div
            className={
              notice === VK_LOGIN_NOTICE ?
                "rounded-2xl border border-amber-200/90 bg-amber-50 px-3 py-3 text-sm text-amber-950"
              : "rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-900"
            }
            role={notice === VK_LOGIN_NOTICE ? "status" : undefined}
          >
            <p className="leading-relaxed">{notice}</p>
            {notice === VK_LOGIN_NOTICE ?
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openVibekidsLogin()}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 active:scale-[0.99]"
                >
                  去登录
                </button>
              </div>
            : null}
          </div>
        ) : null}
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
