"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AgeBand } from "@/lib/vibekids/age";
import { parseAgeBand } from "@/lib/vibekids/age";
import {
  CREATIVE_KINDS,
  VIBE_STYLES,
  parseKind,
  type CreativeKind,
  type VibeStyle,
} from "@/lib/vibekids/creative";
import {
  AWESOME_DESIGN_MD_REPO,
  VIBEKIDS_DESIGN_PRESETS,
  parseDesignPresetId,
  type VibekidsDesignPresetId,
} from "@/lib/vibekids/design-md-presets";
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

/** 语音转写：与 Darwin 相同走 Lobster /transcribe（需登录 + 平台虚拟 Key） */
function getVibekidsTranscribeEndpoint(): {
  url: string;
  headers: Record<string, string>;
} | null {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const t = token?.trim();
  if (!t) return null;
  const base = resolveLobsterApiBase();
  const url = base
    ? `${base}/api/lobster/transcribe`
    : "/api/lobster/transcribe";
  return { url, headers: { Authorization: `Bearer ${t}` } };
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
  "生成、修改、保存、发布作品需要先完成微信登录（与 DarwinClaw 网页账号密码无关）。请点击下方按钮，在微信小程序内授权；浏览广场与作品无需登录。";

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
  /** 服务端 sanitizeVibekidsWorkHtml 拒绝 */
  code?: string;
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

function MicIcon({ className }: { className?: string }) {
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
        d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3M8 22h8"
      />
    </svg>
  );
}

/** MediaRecorder 优先顺序：WebM/opus → WebM → MP4（Safari 部分版本） */
function pickAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

type Vers = { list: string[]; index: number };

type VoiceUiState = "idle" | "recording" | "transcribing";

function initialVers(): Vers {
  return { list: [welcomeHtml()], index: 0 };
}

type WxMiniProgramBridge = { navigateTo?: (opts: { url: string }) => void };

function subscribeMaxLg1023(cb: () => void) {
  const mq = window.matchMedia("(max-width: 1023px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getMaxLg1023Snapshot() {
  return window.matchMedia("(max-width: 1023px)").matches;
}

function getMaxLg1023ServerSnapshot() {
  return false;
}

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
  const [voiceUi, setVoiceUi] = useState<VoiceUiState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordMimeRef = useRef("audio/webm");
  const mountedRef = useRef(true);
  /** 防止连点：在 MediaRecorder 就绪前 voiceUi 仍为 idle */
  const voiceStartLockRef = useRef(false);

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

  /** 每次成功「生成」后给 1 次控制台驱动自动修复额度 */
  const autoFixBudgetRef = useRef(0);
  const loadingRef = useRef(false);
  const versRef = useRef(vers);
  const hasGeneratedPreviewRef = useRef(false);

  const [creativeKind, setCreativeKind] = useState<CreativeKind>("any");
  const [creativeStyles, setCreativeStyles] = useState<VibeStyle[]>([]);
  const [designPreset, setDesignPreset] =
    useState<VibekidsDesignPresetId>("none");
  const [designMdPaste, setDesignMdPaste] = useState("");

  /** 窄屏用 iframe 自然滚动，避免 transform 缩放在 flex 链上算出 0 高导致整页白屏 */
  const previewNativeScroll = useSyncExternalStore(
    subscribeMaxLg1023,
    getMaxLg1023Snapshot,
    getMaxLg1023ServerSnapshot,
  );

  const buildDesignMdRequestFields = useCallback(() => {
    const paste = designMdPaste.trim().slice(0, 12_000);
    return {
      designPreset,
      ...(paste ? { designMd: paste } : {}),
    };
  }, [designPreset, designMdPaste]);

  const toggleCreativeStyle = useCallback((id: VibeStyle) => {
    setCreativeStyles((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [...prev.slice(1), id];
      return [...prev, id];
    });
  }, []);

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
            kind: creativeKind,
            styles: creativeStyles,
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
    [age, creativeKind, creativeStyles],
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
    setCreativeKind(parseKind(d.kind));
    const allowedStyle = new Set(VIBE_STYLES.map((x) => x.id));
    const st = Array.isArray(d.styles) ? d.styles : [];
    setCreativeStyles(
      st
        .filter(
          (x): x is VibeStyle =>
            typeof x === "string" && allowedStyle.has(x as VibeStyle),
        )
        .slice(0, 2),
    );
    setDesignPreset(parseDesignPresetId(d.designPreset));
    setDesignMdPaste(
      typeof d.designMdPaste === "string" ? d.designMdPaste.slice(0, 12_000) : "",
    );
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
        kind: creativeKind,
        styles: creativeStyles,
        age,
        saveTitle,
        refinePrompt: "",
        lockHint: "",
        designPreset,
        designMdPaste: designMdPaste.slice(0, 12_000),
        versList: list,
        versIndex: idx >= 0 ? idx : 0,
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [
    prompt,
    age,
    saveTitle,
    vers.list,
    vers.index,
    creativeKind,
    creativeStyles,
    designPreset,
    designMdPaste,
  ]);

  /** 仍为欢迎页唯一版本时不可保存 */
  const hasGeneratedPreview = !(vers.list.length === 1 && vers.index === 0);

  useEffect(() => {
    loadingRef.current = loading !== null;
  }, [loading]);

  useEffect(() => {
    versRef.current = vers;
  }, [vers]);

  useEffect(() => {
    hasGeneratedPreviewRef.current = hasGeneratedPreview;
  }, [hasGeneratedPreview]);

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
      if (!data.warning && opts?.resultKind === "create") {
        autoFixBudgetRef.current = 1;
      }
      if (data.warning === "ai_failed" && data.detail) {
        const tech = data.detail.slice(0, 200);
        const extra = data.hint ? ` ${data.hint}` : "";
        setNotice(`AI 暂时不可用，已保留上一版或演示。技术信息：${tech}${extra}`);
      } else if (!data.warning) {
        const histLine = (opts?.historyPrompt ?? prompt).trim();
        if (histLine && opts?.resultKind !== "refine") {
          pushPromptHistory(histLine);
        }
        if (opts?.reusedHistory && opts?.resultKind !== "refine") {
          setNotice("已沿用上一句描述重做一版。");
        } else {
          setNotice(null);
        }
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
        kind: creativeKind,
        styles: creativeStyles,
        clientId: getClientId(),
        ...buildDesignMdRequestFields(),
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
      if (res.status === 402 && data.error === "litellm_budget_exceeded") {
        setNotice(
          data.message ??
            "LiteLLM 虚拟 Key 已超过预算上限（Budget exceeded），请联系管理员在 LiteLLM 中提高 max_budget 或更换 Key。",
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
  [
    age,
    buildDesignMdRequestFields,
    creativeKind,
    creativeStyles,
    handleApiResponse,
    prompt,
  ],
  );

  const refineWork = useCallback(
    async (
      textOverride?: string,
      callOpts?: { isAutoFix?: boolean },
    ) => {
    const text = (textOverride ?? prompt).trim();
    if (!hasGeneratedPreview) {
      if (!callOpts?.isAutoFix) {
        setNotice("请先生成一版作品，再描述想怎么改。");
      }
      return;
    }
    if (!text) {
      if (!callOpts?.isAutoFix) {
        setNotice("在描述里写清楚要怎么改（例如：把主色改成绿色、加一个重置按钮）。");
      }
      return;
    }
    if (!hasVibekidsAuthToken()) {
      if (!callOpts?.isAutoFix) setNotice(VK_LOGIN_NOTICE);
      return;
    }
    let restoreAutoFixBudget = false;
    if (callOpts?.isAutoFix) {
      if (autoFixBudgetRef.current < 1) return;
      autoFixBudgetRef.current = 0;
      restoreAutoFixBudget = true;
    }
    setLoading("refine");
    if (!callOpts?.isAutoFix) setNotice(null);
    try {
      const { res } = await postVibekidsLlm({
        intent: "refine",
        currentHtml: html,
        refinementPrompt: text,
        ageBand: age,
        kind: creativeKind,
        styles: creativeStyles,
        clientId: getClientId(),
        ...buildDesignMdRequestFields(),
      });
      const parsed = await readJsonBody<VibekidsLlmResponseBody>(res);
      if (!parsed.ok) {
        if (restoreAutoFixBudget) autoFixBudgetRef.current = 1;
        if (!callOpts?.isAutoFix) setNotice(parsed.message);
        return;
      }
      const data = parsed.data;
      if (res.status === 401 && data.error === "login_required") {
        if (restoreAutoFixBudget) autoFixBudgetRef.current = 1;
        if (!callOpts?.isAutoFix) setNotice(VK_LOGIN_NOTICE);
        return;
      }
      if (res.status === 402 && data.error === "NO_KEY") {
        if (restoreAutoFixBudget) autoFixBudgetRef.current = 1;
        if (!callOpts?.isAutoFix) {
          setNotice(
            data.message ??
              "Darwin 需要平台虚拟 Key。请先在积分兑换中申请 Key（与 /my-lobster 相同）。",
          );
        }
        return;
      }
      if (res.status === 402 && data.error === "litellm_budget_exceeded") {
        if (restoreAutoFixBudget) autoFixBudgetRef.current = 1;
        if (!callOpts?.isAutoFix) {
          setNotice(
            data.message ??
              "LiteLLM 虚拟 Key 已超过预算上限（Budget exceeded），请联系管理员在 LiteLLM 中提高 max_budget 或更换 Key。",
          );
        }
        return;
      }
      if (res.status === 403 && data.error === "darwin_required") {
        if (restoreAutoFixBudget) autoFixBudgetRef.current = 1;
        if (!callOpts?.isAutoFix) {
          setNotice(
            data.detail ??
              "暂无 Darwin 创作权限。请稍后再试或联系管理员；若使用微信小程序请确认已登录并完成授权。",
          );
        }
        return;
      }
      if (res.status === 500 && data.error === "llm_failed") {
        if (restoreAutoFixBudget) autoFixBudgetRef.current = 1;
        if (!callOpts?.isAutoFix) {
          setNotice(data.detail ?? "模型调用失败，请稍后再试。");
        }
        return;
      }
      if (res.status === 402 && data.error === "insufficient_credits") {
        if (restoreAutoFixBudget) autoFixBudgetRef.current = 1;
        if (!callOpts?.isAutoFix) {
          setNotice(
            `修改额度不足（本次需要 ${data.need ?? "?"}，当前 ${data.balance ?? 0}）。`,
          );
        }
        return;
      }
      if (res.status === 400 && data.error === "client_id_required") {
        if (restoreAutoFixBudget) autoFixBudgetRef.current = 1;
        if (!callOpts?.isAutoFix) setNotice(data.detail ?? "请刷新页面后重试。");
        return;
      }
      if (!res.ok || typeof data.html !== "string" || !data.html.trim()) {
        if (restoreAutoFixBudget) autoFixBudgetRef.current = 1;
        if (!callOpts?.isAutoFix) {
          const errTag =
            typeof data.error === "string" ? `（${data.error}）` : "";
          setNotice(`修改失败（HTTP ${res.status}）${errTag}，请稍后再试。`);
        }
        return;
      }
      const applied = handleApiResponse(data, {
        resultKind: "refine",
        historyPrompt: text,
      });
      if (applied && callOpts?.isAutoFix) {
        setNotice(
          "已根据预览控制台报错自动尝试修复一版，请再试玩；若仍有问题请手动描述修改。",
        );
      }
      if (!applied && restoreAutoFixBudget) {
        autoFixBudgetRef.current = 1;
      }
    } catch (e) {
      if (restoreAutoFixBudget) autoFixBudgetRef.current = 1;
      void logVibekidsConnectivityDiag("refine");
      console.error("[VibeKids] refine failed:", e);
      if (!callOpts?.isAutoFix) {
        setNotice(noticeFromVibekidsFailure(e, { refine: true }));
      }
    } finally {
      setLoading(null);
    }
  },
  [
    age,
    buildDesignMdRequestFields,
    creativeKind,
    creativeStyles,
    handleApiResponse,
    hasGeneratedPreview,
    html,
    prompt,
  ],
  );

  const onPreviewRuntimeIssues = useCallback(
    (issues: string[]) => {
      if (loadingRef.current) return;
      if (!hasGeneratedPreviewRef.current) return;
      const v = versRef.current;
      if (v.list.length === 1 && v.index === 0) return;
      if (autoFixBudgetRef.current < 1) return;
      const block = issues
        .slice(0, 12)
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n");
      const text = `【自动修复】以下为预览 iframe 中收集到的报错或 console.error（约 2 秒内）。请只修改必要代码以消除这些问题，保持原有功能与界面意图，输出完整 HTML：\n\n${block}`;
      void refineWork(text, { isAutoFix: true });
    },
    [refineWork],
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
    router.push(`/vibekids/wechat-login?redirect=${encodeURIComponent(path)}`);
  }, [router]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const r = mediaRecorderRef.current;
      if (r && r.state !== "inactive") {
        try {
          r.stop();
        } catch {
          /* */
        }
      }
      mediaRecorderRef.current = null;
      streamRef.current = null;
    };
  }, []);

  const onVoiceButtonClick = useCallback(async () => {
    if (loading !== null) return;
    if (voiceUi === "transcribing") return;

    if (voiceUi === "recording") {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state === "recording") rec.stop();
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setNotice(
        "当前环境不支持网页录音，请换用 Chrome / Edge / Safari 最新版，或改用文字输入。",
      );
      return;
    }

    if (mediaRecorderRef.current || voiceStartLockRef.current) return;

    const ep = getVibekidsTranscribeEndpoint();
    if (!ep) {
      setNotice(
        "语音输入需要先登录；若未兑换平台虚拟 Key，请先在「我的」里完成兑换（与生成作品相同）。",
      );
      return;
    }

    voiceStartLockRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const mime = pickAudioMimeType();
      recordMimeRef.current = mime || "audio/webm";
      const rec = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      mediaRecorderRef.current = rec;

      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      rec.onstop = async () => {
        voiceStartLockRef.current = false;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;

        const blobType = recordMimeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });
        chunksRef.current = [];

        if (!mountedRef.current) return;

        if (blob.size < 900) {
          setVoiceUi("idle");
          setNotice("录音太短，请多录一会儿再点结束。");
          return;
        }

        setVoiceUi("transcribing");
        try {
          const fd = new FormData();
          const ext =
            blobType.includes("mp4") || blobType.includes("m4a") ? "m4a" : "webm";
          fd.append("audio", blob, `vibekids-voice.${ext}`);
          const r = await fetch(ep.url, {
            method: "POST",
            headers: ep.headers,
            body: fd,
          });
          const data = (await r.json().catch(() => ({}))) as {
            error?: string;
            text?: string;
          };
          if (!mountedRef.current) return;
          if (!r.ok) {
            setNotice(
              typeof data.error === "string" ?
                data.error
              : "语音识别失败，请确认已兑换虚拟 Key 且后端已配置 Whisper / LiteLLM。",
            );
            return;
          }
          const text = typeof data.text === "string" ? data.text.trim() : "";
          if (text) {
            setPrompt((p) => (p.trim() ? `${p.trim()} ${text}` : text));
          } else {
            setNotice("未识别到语音内容，请靠近麦克风或说慢一点。");
          }
        } catch {
          if (mountedRef.current) {
            setNotice(noticeFromVibekidsFailure(new Error("network")));
          }
        } finally {
          if (mountedRef.current) setVoiceUi("idle");
        }
      };

      rec.start(120);
      setVoiceUi("recording");
    } catch (e) {
      voiceStartLockRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      mediaRecorderRef.current = null;
      const name = e instanceof Error ? e.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setNotice("麦克风权限被拒绝，请在浏览器或系统设置中允许使用麦克风。");
      } else {
        setNotice("无法启动麦克风，请检查设备或改用文字输入。");
      }
      setVoiceUi("idle");
    }
  }, [loading, voiceUi, setNotice]);

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
          kind: creativeKind,
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
          : data.error === "html_policy_rejected" ?
            `作品未通过安全校验，无法保存。${typeof data.detail === "string" && data.detail.trim() ? ` ${data.detail.trim()}` : "请删除可疑外链、eval 等后再试。"}`
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
  }, [age, creativeKind, html, prompt, saveTitle]);

  const closeSaveDialog = useCallback(() => {
    if (saving) return;
    setSaveDialogOpen(false);
    setSaveNameError(null);
  }, [saving]);

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col justify-start gap-0 overflow-hidden bg-slate-50 max-lg:min-h-0 lg:h-[calc(100dvh-3.25rem)] lg:flex-row lg:items-stretch lg:overflow-visible">
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

      <section className="flex min-h-0 w-full flex-1 flex-col gap-0 overflow-hidden bg-slate-50 max-lg:min-h-0 max-lg:flex-1 max-lg:px-0 max-lg:pt-1 lg:order-2 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:px-5 lg:pb-5 lg:pt-4">
        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden max-lg:min-h-0 max-lg:flex-1 max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent max-lg:shadow-none lg:h-full lg:max-h-none lg:min-h-[min(520px,58dvh)] lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:shadow-sm lg:flex-1">
          {loading !== null ? <GenerationSkeleton mode={loading} /> : null}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <PreviewFrame
              html={html}
              frameKey={vers.index}
              nativeScroll={previewNativeScroll}
              reportRuntimeIssues
              onRuntimeIssues={onPreviewRuntimeIssues}
            />
          </div>
        </div>
      </section>

      <section className="flex w-full shrink-0 flex-col gap-2 border-b border-slate-200/80 bg-white/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-sm sm:p-3 lg:order-1 lg:max-w-[min(22rem,100vw)] lg:gap-4 lg:border-b-0 lg:border-r lg:border-t-0 lg:border-l-0 lg:overflow-y-auto lg:p-5 lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pl-2 lg:pr-5">
        <div className="rounded-2xl border-2 border-sky-300/55 bg-white p-2.5 shadow-[0_0_0_1px_rgba(125,211,252,0.12)] sm:p-3">
          <label htmlFor="prompt" className="sr-only">
            描述想法；Enter 发送，Shift+Enter 换行
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
              onClick={() => void onVoiceButtonClick()}
              disabled={loading !== null || voiceUi === "transcribing"}
              aria-pressed={voiceUi === "recording"}
              title={
                voiceUi === "recording" ?
                  "结束录音并识别为文字"
                : voiceUi === "transcribing" ?
                  "正在识别语音…"
                : "语音输入：点按开始录音，再点一次结束并转成文字"
              }
              aria-label={
                voiceUi === "recording" ?
                  "结束录音并识别"
                : voiceUi === "transcribing" ?
                  "语音识别中"
                : "开始语音输入"
              }
              className={
                voiceUi === "recording" ?
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white shadow-md ring-2 ring-rose-300/90 animate-pulse transition hover:bg-rose-700 disabled:pointer-events-none disabled:opacity-40"
                : "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 disabled:pointer-events-none disabled:opacity-40"
              }
            >
              {voiceUi === "transcribing" ?
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
              : <MicIcon className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => void submitComposer()}
              disabled={loading !== null || voiceUi === "recording"}
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
                  微信登录
                </button>
              </div>
            : null}
          </div>
        ) : null}

        <details className="hidden rounded-xl border border-slate-200/80 bg-slate-50/80 text-slate-800 lg:block">
          <summary className="cursor-pointer select-none list-none px-3 py-2.5 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
            <span className="mr-1.5 inline-block text-slate-400">▸</span>
            高级选项
            <span className="ml-1.5 font-normal text-slate-500">
              形态、风格、设计参考、灵感词
            </span>
          </summary>
          <div className="space-y-3 border-t border-slate-200/70 px-2.5 pb-3 pt-2 sm:px-3">
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

            <div className="rounded-xl border border-slate-200/70 bg-white/90 px-2.5 py-2 sm:px-3">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                作品形态
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CREATIVE_KINDS.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    disabled={loading !== null}
                    onClick={() => setCreativeKind(k.id)}
                    title={k.hint}
                    className={
                      creativeKind === k.id ?
                        `${STUDIO_OUTLINE_BTN} border-violet-500 bg-violet-50 font-semibold text-violet-900 shadow-sm`
                      : STUDIO_OUTLINE_BTN
                    }
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <p className="mb-1 mt-2.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                风格（可选，最多 2）
              </p>
              <div className="flex flex-wrap gap-1.5">
                {VIBE_STYLES.map((s) => {
                  const on = creativeStyles.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={loading !== null}
                      onClick={() => toggleCreativeStyle(s.id)}
                      className={
                        on ?
                          `${STUDIO_OUTLINE_BTN} border-sky-500 bg-sky-50 font-semibold text-sky-900 shadow-sm`
                        : STUDIO_OUTLINE_BTN
                      }
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-violet-200/70 bg-violet-50/40 px-2.5 py-2 sm:px-3">
              <p className="mb-2 text-xs font-medium text-violet-950">界面设计参考（DESIGN.md，可选）</p>
              <div className="space-y-2 text-xs leading-relaxed text-slate-600">
                <p>
                  思路与开源合集{" "}
                  <a
                    href={AWESOME_DESIGN_MD_REPO}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-violet-700 underline decoration-violet-400/70 underline-offset-2 hover:text-violet-900"
                  >
                    awesome-design-md
                  </a>{" "}
                  一致：可选下方内置预设，或从仓库里任一站点的{" "}
                  <code className="rounded bg-white/90 px-1 py-0.5 text-[11px] text-slate-800">
                    DESIGN.md
                  </code>{" "}
                  复制进文本框。有粘贴内容时<strong>优先采用粘贴</strong>，预设仅作备用。
                </p>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    预设气质
                  </span>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/60"
                    value={designPreset}
                    disabled={loading !== null}
                    onChange={(e) =>
                      setDesignPreset(parseDesignPresetId(e.target.value))
                    }
                  >
                    {VIBEKIDS_DESIGN_PRESETS.map((p) => (
                      <option key={p.id} value={p.id} title={p.hint}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    粘贴 DESIGN.md（可选，最多 12000 字）
                  </span>
                  <textarea
                    value={designMdPaste}
                    onChange={(e) =>
                      setDesignMdPaste(e.target.value.slice(0, 12_000))
                    }
                    disabled={loading !== null}
                    rows={4}
                    placeholder="从 GitHub 上 awesome-design-md 的 design-md 目录复制全文或节选…"
                    className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-[11px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200/60"
                  />
                </label>
              </div>
            </div>
          </div>
        </details>
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
