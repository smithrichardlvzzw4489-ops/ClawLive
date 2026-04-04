"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AgeBand } from "@/lib/vibekids/age";
import { ageLabel, parseAgeBand } from "@/lib/vibekids/age";
import {
  CREATIVE_KINDS,
  VIBE_STYLES,
  type CreativeKind,
  type VibeStyle,
} from "@/lib/vibekids/creative";
import { VK_API_BASE, VK_BASE } from "@/lib/vibekids/constants";
import { welcomeHtml } from "@/lib/vibekids/demo-html";
import { PreviewFrame } from "@/components/vibekids/PreviewFrame";
import { GenerationSkeleton } from "@/components/vibekids/GenerationSkeleton";
import { getClientId } from "@/lib/vibekids/client-credits";
import {
  getPromptHistory,
  pushPromptHistory,
} from "@/lib/vibekids/client-prompt-history";
import {
  loadDraft,
  saveDraft,
  clearDraft,
} from "@/lib/vibekids/client-studio-draft";
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

function getDarwinBrainstormUrl(): string {
  const base = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
  const path = "/api/lobster/vibekids-brainstorm";
  return base ? `${base}${path}` : path;
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

  const [kind, setKind] = useState<CreativeKind>("any");
  const [styles, setStyles] = useState<VibeStyle[]>([]);

  const [vers, setVers] = useState<Vers>(initialVers);
  const html = vers.list[vers.index] ?? welcomeHtml();

  const [loading, setLoading] = useState<null | "create" | "refine">(null);
  const [outMode, setOutMode] = useState<"idle" | "demo" | "ai">("idle");
  const [notice, setNotice] = useState<string | null>(null);

  const [refinePrompt, setRefinePrompt] = useState("");
  const [lockHint, setLockHint] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const [promptHist, setPromptHist] = useState<string[]>([]);
  const draftRestored = useRef(false);

  const [hasMainSiteToken, setHasMainSiteToken] = useState(false);
  const [darwinDirections, setDarwinDirections] = useState<string[]>([]);
  const [darwinBrainstormLoading, setDarwinBrainstormLoading] = useState(false);

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
            kind,
            styles,
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
    [age, kind, styles],
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
  }, [hasMainSiteToken, age, kind, styles, loadDarwinChips]);

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
    setKind(d.kind);
    setStyles(d.styles);
    setSaveTitle(d.saveTitle);
    setRefinePrompt(d.refinePrompt);
    setLockHint(d.lockHint);
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
        kind,
        styles,
        age,
        saveTitle,
        refinePrompt,
        lockHint,
        versList: list,
        versIndex: idx >= 0 ? idx : 0,
      });
    }, 800);
    return () => window.clearTimeout(t);
  }, [
    prompt,
    kind,
    styles,
    age,
    saveTitle,
    refinePrompt,
    lockHint,
    vers.list,
    vers.index,
  ]);

  const canUndo = vers.index > 0;
  const canRedo = vers.index < vers.list.length - 1;
  /** 仅欢迎页且唯一版本时不能「应用修改」 */
  const canRefine = !(vers.list.length === 1 && vers.index === 0);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (canRefine) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [canRefine]);

  const pushVersion = useCallback((nextHtml: string) => {
    setVers((v) => {
      const list = v.list.slice(0, v.index + 1);
      list.push(nextHtml);
      return { list, index: list.length - 1 };
    });
  }, []);

  const undo = useCallback(() => {
    setVers((v) => ({ ...v, index: Math.max(0, v.index - 1) }));
  }, []);

  const redo = useCallback(() => {
    setVers((v) => ({
      ...v,
      index: Math.min(v.list.length - 1, v.index + 1),
    }));
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
      opts?: { intent?: "create" | "refine"; authFallback?: boolean },
    ) => {
      const nextHtml =
        typeof data.html === "string" ? data.html.trim() : "";
      if (!nextHtml) return false;
      pushVersion(nextHtml);
      setOutMode(data.mode === "ai" ? "ai" : "demo");
      if (data.warning === "ai_failed" && data.detail) {
        const tech = data.detail.slice(0, 200);
        const extra = data.hint ? ` ${data.hint}` : "";
        setNotice(`AI 暂时不可用，已保留上一版或演示。技术信息：${tech}${extra}`);
      } else if (data.warning === "refine_needs_ai" && data.detail) {
        setNotice(data.detail);
      } else if (!data.warning) {
        if (opts?.intent !== "refine") {
          pushPromptHistory(prompt.trim());
          setPromptHist(getPromptHistory());
        }
        const prefix = opts?.authFallback ? "登录已失效，已改用访客生成。" : "";
        const base = prefix ? `${prefix} 生成完成。` : "生成完成。";
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
        kind,
        styles,
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
      handleApiResponse(data, { intent: "create", authFallback: usedAuthFallback });
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
  }, [age, handleApiResponse, kind, prompt, styles]);

  const applyRefine = useCallback(async () => {
    const r = refinePrompt.trim();
    if (!r) {
      setNotice("先写清楚要改什么，例如：把按钮改成绿色、加一条计分规则。");
      return;
    }
    if (!canRefine) {
      setNotice("请先用「生成作品」得到一版页面，再在这里做快速修改。");
      return;
    }
    setLoading("refine");
    setNotice(null);
    try {
      const { res, usedAuthFallback } = await postVibekidsLlm({
        intent: "refine",
        ageBand: age,
        currentHtml: html,
        refinementPrompt: r,
        lockHint: lockHint.trim() || undefined,
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
          `生成额度不足（快速修改需要 ${data.need ?? "?"}，当前 ${data.balance ?? 0}）。`,
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
      handleApiResponse(data, { intent: "refine", authFallback: usedAuthFallback });
      if (data.warning !== "ai_failed" && data.warning !== "refine_needs_ai") {
        setRefinePrompt("");
      }
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === "AbortError" || e.name === "TimeoutError")
      ) {
        setNotice("请求等待过久已中断，请简化修改说明后重试。");
      } else {
        setNotice("网络异常，检查一下连接后再试。");
      }
    } finally {
      setLoading(null);
    }
  }, [age, canRefine, handleApiResponse, html, lockHint, refinePrompt]);

  const runDarwinBrainstorm = useCallback(async () => {
    let token: string | null = null;
    try {
      token = localStorage.getItem("token");
    } catch {
      /* ignore */
    }
    if (!token) {
      setNotice("请先登录主站并接入 Darwin，即可使用云端创作记忆与拓展方案。");
      return;
    }
    setDarwinBrainstormLoading(true);
    setNotice(null);
    try {
      const url = getDarwinBrainstormUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          ageBand: age,
          kind,
          styles,
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
        setNotice("登录已失效，请重新登录后再试 Darwin 拓展方案。");
        return;
      }
      const data = (await res.json()) as {
        directions?: unknown;
        detail?: string;
        message?: string;
        error?: string;
      };
      if (res.status === 403 && data.error === "darwin_required") {
        setNotice(data.detail ?? "请先接入 Darwin。");
        return;
      }
      if (res.status === 402 && data.error === "NO_KEY") {
        setNotice(
          data.message ?? "Darwin 需要平台虚拟 Key，请在积分兑换中申请。",
        );
        return;
      }
      if (!res.ok) {
        setNotice(
          typeof data.detail === "string" ?
            data.detail
          : typeof data.message === "string" ?
            data.message
          : "拓展方案暂不可用",
        );
        return;
      }
      const dirs =
        Array.isArray(data.directions) ?
          data.directions.filter(
            (x): x is string => typeof x === "string" && x.trim().length > 4,
          )
        : [];
      if (dirs.length === 0) {
        setNotice("未拿到有效方案，请稍后再试。");
        return;
      }
      setDarwinDirections(dirs.slice(0, 3));
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === "AbortError" || e.name === "TimeoutError")
      ) {
        setNotice("拓展方案请求超时，请稍后再试。");
      } else {
        setNotice("网络异常，拓展方案请求失败。");
      }
    } finally {
      setDarwinBrainstormLoading(false);
    }
  }, [age, kind, prompt, styles]);

  const clearAll = useCallback(() => {
    setVers(initialVers());
    setOutMode("idle");
    setNotice(null);
    setRefinePrompt("");
    setLockHint("");
    setSaveTitle("");
    setDarwinDirections([]);
    clearDraft();
  }, []);

  const saveWork = useCallback(async () => {
    if (!canRefine) {
      setNotice("请先生成可预览的作品，再保存。");
      return;
    }
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
          kind,
          title: saveTitle.trim() || undefined,
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
  }, [age, canRefine, html, kind, prompt, saveTitle]);

  const toggleStyle = (id: VibeStyle) => {
    setStyles((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:h-[calc(100dvh-3.25rem)] lg:min-h-0 lg:flex-row lg:items-stretch lg:gap-0">
      <section className="flex w-full shrink-0 flex-col gap-4 border-b border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5 lg:max-w-[min(22rem,100vw)] lg:border-b-0 lg:border-r lg:border-t-0 lg:border-l-0 lg:overflow-y-auto lg:py-5 lg:pl-2 lg:pr-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800">
            {ageLabel(age)}创作
          </span>
          <span className="text-sm text-slate-600">
            可点快捷词快速上手，也可写长描述定规则与界面
          </span>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-800">作品形态（帮助对齐交互）</p>
          <div className="flex flex-wrap gap-2">
            {CREATIVE_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  kind === k.id
                    ? "border-sky-500 bg-sky-50 font-medium text-sky-900"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-300"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-800">风格（可多选）</p>
          <div className="flex flex-wrap gap-2">
            {VIBE_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStyle(s.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  styles.includes(s.id)
                    ? "border-violet-500 bg-violet-50 font-medium text-violet-900"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-800">快捷灵感（可多点）</p>
          <p className="mb-2 text-[11px] leading-relaxed text-slate-500">
            {hasMainSiteToken ?
              chipsLoading ?
                "正在根据你的 Darwin 画像与下方形态/风格生成 6 条…"
              : "已由 Darwin 按用户画像（问卷、简介等）与当前形态/风格推荐 6 条；点「换一批」可再要一批。"
            : "未登录时为内置示例，点「换一批」随机换 6 条；登录并接入 Darwin 后将按画像由系统推荐。"}
          </p>
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
            <button
              type="button"
              onClick={() => {
                setPrompt("");
                setNotice("已清空描述，换一句话再点「生成作品」。");
              }}
              disabled={loading !== null}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              换一句描述
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

        {hasMainSiteToken ? (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
            <p className="mb-2 text-xs font-medium text-indigo-950">
              Darwin · 智能拓展
            </p>
            <p className="mb-2 text-[11px] leading-relaxed text-indigo-900/85">
              根据当前描述、作品形态与你在云端的近期创作线索，生成 3
              条可落地的补充方向；点选后会合并进上方描述，再点「生成作品」即可。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void runDarwinBrainstorm()}
                disabled={darwinBrainstormLoading || loading !== null}
                className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {darwinBrainstormLoading ? "正在想方案…" : "智能拓展 3 方案"}
              </button>
              {darwinDirections.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setDarwinDirections([])}
                  className="text-xs font-medium text-indigo-800/80 underline-offset-2 hover:underline"
                >
                  收起方案
                </button>
              ) : null}
            </div>
            {darwinDirections.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {darwinDirections.map((d, i) => (
                  <li key={`${i}-${d.slice(0, 12)}`}>
                    <button
                      type="button"
                      onClick={() => setPrompt((p) => mergeChip(p, d))}
                      className="w-full rounded-xl border border-indigo-200/80 bg-white px-3 py-2 text-left text-sm leading-snug text-indigo-950 transition hover:border-indigo-400 hover:bg-indigo-50/80"
                    >
                      {d}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] leading-relaxed text-slate-500">
            登录主站并接入 Darwin
            后，创作室可通过云端记忆延续你的创作主题，并一键生成多套描述方案（不占用访客额度逻辑）。
          </p>
        )}

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
            onClick={undo}
            disabled={!canUndo || loading !== null}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            撤销
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo || loading !== null}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            重做
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={loading !== null}
            className="text-sm font-medium text-slate-600 underline-offset-4 hover:underline"
          >
            清空
          </button>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading !== null || !prompt.trim()}
            className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 disabled:opacity-40"
          >
            再来一版
          </button>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-4">
          <p className="mb-2 text-sm font-semibold text-emerald-900">保存作品</p>
          <p className="mb-3 text-xs text-emerald-800/90">
            将当前预览写入服务器。默认不公开；在「我的作品」发布到广场后才会出现在「发现」，并可被转发、点赞、收藏、评论。
          </p>
          <label htmlFor="save-title" className="mb-1 block text-xs font-medium text-emerald-900">
            标题（可选，不填则从页面自动提取）
          </label>
          <input
            id="save-title"
            type="text"
            value={saveTitle}
            onChange={(e) => setSaveTitle(e.target.value)}
            placeholder="例如：我的生日贺卡"
            disabled={saving || loading !== null}
            className="mb-3 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void saveWork()}
            disabled={saving || loading !== null || !canRefine}
            className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存作品"}
          </button>
        </div>

        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
          <p className="mb-1 text-sm font-semibold text-slate-800">快速修改</p>
          <p className="mb-3 text-xs text-slate-500">
            在上一版基础上局部调整，不必重写整段描述。未配置 API 时不可用。
          </p>
          <label htmlFor="refine" className="sr-only">
            修改说明
          </label>
          <textarea
            id="refine"
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            rows={3}
            placeholder="例：把主色改成绿色；加「重新开始」按钮；手机端字再大一号"
            className="mb-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
          <label htmlFor="lock" className="mb-1 block text-xs font-medium text-slate-600">
            尽量别动这些（可选）
          </label>
          <textarea
            id="lock"
            value={lockHint}
            onChange={(e) => setLockHint(e.target.value)}
            rows={2}
            placeholder="例：顶部标题和背景图不要动"
            className="mb-3 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
          <button
            type="button"
            onClick={() => void applyRefine()}
            disabled={loading !== null || !canRefine}
            className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
          >
            {loading === "refine" ? "修改中…" : "应用修改"}
          </button>
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          预览在沙箱中运行；请勿输入隐私信息。家长可在 .env.local 中配置 OPENROUTER_API_KEY 以启用完整
          AI 生成（OpenRouter）。
        </p>
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
    </div>
  );
}
