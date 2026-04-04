import { parseAgeBand, type AgeBand } from "@/lib/vibekids/age";
import {
  creditCredits,
  creditsCostCreate,
  creditsCostRefine,
  debitCredits,
  getCreditsPublicConfig,
  isValidClientId,
} from "@/lib/vibekids/credits-storage";
import {
  formatCreativeContext,
  parseKind,
  type CreativeKind,
  type VibeStyle,
} from "@/lib/vibekids/creative";
import { getDemoHtml } from "@/lib/vibekids/demo-html";
import { serverVibekidsDeadlineMs } from "@/lib/vibekids/generate-timeouts";
import {
  type VibekidsTokenUsage,
  tokenUsageFromOpenAICompat,
} from "@/lib/vibekids/token-usage";

export const runtime = "nodejs";

const SYSTEM_CREATE = `你是面向 6–15 岁学习者的「氛围编程」助手。用户会用中文描述想做的作品（游戏、故事、动画、小工具、页面等，题材不限）。

硬性要求：
1. 只输出一个完整的 HTML 文件源码，不要 Markdown，不要解释文字。
2. 使用内联 <style> 和 <script>，尽量不使用外部脚本；如必须，仅可使用可信 CDN（优先不用）。
3. 界面清晰、色彩友好、字体适中；在移动设备上基本可用（可加 viewport）。
4. 内容积极健康，适合未成年人；避免恐怖、暴力、成人内容；不要收集个人信息。
5. 尽量可交互（按钮、键盘、鼠标、简单动画等），让用户「马上能玩、能点」。
6. 单文件即可运行；中文界面优先。
7. 含 canvas、游戏主区域、#game 等可玩版面时：在桌面预览里应占满主体可视区；**宽宜明显大于高**（约 4:3～16:10），宽度倾向 min(92vw, 520px)～min(92vw, 640px)、高度约为宽的 72%～88%，避免过小的正方形（如 320×320）。
8. 优先「最小可玩 / 可用原型」，避免超长内联脚本、大段重复结构、海量逐帧数据；在合理范围内尽快完成输出。`;

const SYSTEM_REFINE = `你是面向 6–15 岁学习者的「氛围编程」编辑助手。你会收到一份已存在的单文件 HTML 源码，以及用户的修改说明。

硬性要求：
1. 只输出修改后的完整 HTML 文件源码，不要 Markdown，不要解释文字。
2. 在满足修改说明的前提下，尽量保留未提及部分的布局、文案与逻辑；改动要克制、可预期。
3. 若用户提供了「不要改动」的说明，这些部分必须保持不变（除非修改说明明确要求动到它们）。
4. 仍使用内联 <style> 与 <script>，安全、健康、适合未成年人。
5. 单文件即可运行。
6. 若涉及游戏板 / canvas 尺寸：用户要求「拉大、拉长、更宽」时，同步按比例调整绘制坐标、网格或碰撞范围，避免只改 CSS 导致逻辑错位。
7. 修改尽量聚焦，避免无关的大段重写；在合理范围内尽快输出完整 HTML。`;

function extractHtml(raw: string): string {
  const t = raw.trim();
  const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  return t;
}

const DEFAULT_OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "deepseek/deepseek-chat-v3.1";

function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [err.message];
  let c: unknown = err.cause;
  let depth = 0;
  while (c instanceof Error && depth++ < 6) {
    parts.push(c.message);
    c = c.cause;
  }
  const anyErr = err as Error & { code?: string; errno?: string };
  if (anyErr.code) parts.push(`code:${anyErr.code}`);
  return parts.join(" | ");
}

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

/** 单次 HTTP 超时上界，不超过总截止；OPENROUTER_TIMEOUT_MS 可在 5s～总截止之间微调 */
function openRouterSingleRequestCapMs(totalDeadlineMs: number): number {
  const n = Number(process.env.OPENROUTER_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 5_000 && n <= totalDeadlineMs) {
    return Math.floor(n);
  }
  return totalDeadlineMs;
}

/** 网络类失败时重试次数（含第一次）。总墙钟仍受 serverVibekidsDeadlineMs() 约束 */
function openRouterMaxAttempts(): number {
  const n = Number(process.env.OPENROUTER_MAX_ATTEMPTS);
  const v = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 2;
  return Math.min(3, Math.max(1, v));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 连接被掐断、超时、对端关闭等，可重试 */
function isTransientOpenRouterError(err: unknown): boolean {
  const s = formatFetchError(err).toLowerCase();
  if (
    s.includes("terminated") ||
    s.includes("other side closed") ||
    s.includes("socket") ||
    s.includes("und_err") ||
    s.includes("econnreset") ||
    s.includes("pipe")
  ) {
    return true;
  }
  if (
    s.includes("timeout") ||
    s.includes("timed out") ||
    s.includes("connecttimeout") ||
    s.includes("aborted")
  ) {
    return true;
  }
  if (s.includes("fetch failed") || s.includes("network")) {
    return true;
  }
  const c = err instanceof Error ? err.cause : undefined;
  if (c && typeof c === "object" && "code" in c && (c as NodeJS.ErrnoException).code === "ECONNRESET") {
    return true;
  }
  return false;
}

type OpenRouterCallResult = { html: string; usage?: VibekidsTokenUsage };

async function callOpenRouterOnce(
  apiKey: string,
  messages: ChatMsg[],
  maxTokens: number,
  timeoutMs: number,
): Promise<OpenRouterCallResult> {
  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const url =
    process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_URL;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "X-Title": process.env.OPENROUTER_APP_NAME?.trim() || "VibeKids",
    /** 避免 keep-alive 长连接在部分网络下读响应时被 RST */
    Connection: "close",
  };
  const siteUrl = process.env.OPENROUTER_SITE_URL?.trim();
  if (siteUrl) {
    headers["HTTP-Referer"] = siteUrl;
  }

  const disableJitter = process.env.OPENROUTER_DISABLE_TEMP_JITTER === "1";
  const jitter = disableJitter ? 0 : Math.random() * 0.14 - 0.07;
  const temperature = Math.min(0.85, Math.max(0.35, Math.round((0.55 + jitter) * 100) / 100));

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `OpenRouter HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: unknown;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("模型未返回内容");
  const out = extractHtml(text);
  if (!out.trim()) {
    throw new Error("模型返回的 HTML 为空，请重试或简化描述");
  }
  const usage = tokenUsageFromOpenAICompat(data.usage);
  return usage ? { html: out, usage } : { html: out };
}

async function callOpenRouter(
  apiKey: string,
  messages: ChatMsg[],
  maxTokens: number,
): Promise<OpenRouterCallResult> {
  const wallMs = serverVibekidsDeadlineMs();
  const deadline = Date.now() + wallMs;
  const cap = openRouterSingleRequestCapMs(wallMs);
  const maxAttempts = openRouterMaxAttempts();
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 1_200) {
      if (lastErr) throw lastErr;
      throw new Error("生成超时，请稍后再试或简化描述。");
    }
    const timeoutMs = Math.min(cap, remaining);
    try {
      const r = await callOpenRouterOnce(apiKey, messages, maxTokens, timeoutMs);
      return r;
    } catch (e) {
      lastErr = e;
      const last = attempt === maxAttempts - 1;
      const retry =
        !last &&
        isTransientOpenRouterError(e) &&
        deadline - Date.now() > 2_000;
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[api/generate] OpenRouter attempt ${attempt + 1}/${maxAttempts}:`,
          formatFetchError(e),
          retry ? "(will retry)" : "",
        );
      }
      if (!retry) throw e;
      const rawBackoff = 1800 * 2 ** attempt + Math.floor(Math.random() * 400);
      const backoff = Math.min(
        Math.max(0, deadline - Date.now() - 800),
        Math.min(8_000, rawBackoff),
      );
      if (backoff < 150) throw e;
      await sleep(backoff);
    }
  }

  throw lastErr;
}

function ageUserHint(age: AgeBand): string {
  if (age === "unified") {
    return (
      "用户可能是中小学生：界面按钮与可点区域要够大、说明简洁、反馈即时；" +
      "若描述很短可优先「最小可玩原型」；" +
      "若用户写得很细（规则、界面、交互），请认真按说明实现，整体仍要一目了然、适合未成年人。"
    );
  }
  return age === "primary"
    ? "用户是小学生：句子短、按钮大、说明少、反馈即时。"
    : "用户是初中生：可以稍复杂一点的逻辑与文案，但仍要一目了然。";
}

function parseStyles(raw: unknown): VibeStyle[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set([
    "cute",
    "scifi",
    "minimal",
    "pixel",
    "pastel",
  ]);
  return raw.filter((x): x is VibeStyle => typeof x === "string" && allowed.has(x));
}

async function createHtml(
  prompt: string,
  age: AgeBand,
  kind: CreativeKind,
  styles: VibeStyle[],
  apiKey: string,
): Promise<OpenRouterCallResult> {
  const ctx = formatCreativeContext(kind, styles);
  const userBlock = [
    ageUserHint(age),
    ctx ? ctx : null,
    `用户想法：\n${prompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return callOpenRouter(
    apiKey,
    [
      { role: "system", content: SYSTEM_CREATE },
      { role: "user", content: userBlock },
    ],
    6144,
  );
}

async function refineHtml(
  currentHtml: string,
  refinement: string,
  lockHint: string | undefined,
  age: AgeBand,
  apiKey: string,
): Promise<OpenRouterCallResult> {
  const lock =
    lockHint?.trim() ?
      `\n\n【请尽量保持不动的部分】\n${lockHint.trim()}`
    : "";

  const userBlock = `${ageUserHint(age)}

以下是当前完整 HTML 源码：

\`\`\`html
${currentHtml}
\`\`\`

【修改要求】
${refinement.trim()}
${lock}

请输出修改后的完整 HTML 文件源码。`;

  return callOpenRouter(
    apiKey,
    [
      { role: "system", content: SYSTEM_REFINE },
      { role: "user", content: userBlock },
    ],
    6144,
  );
}

function createFailPayload(prompt: string, ageBand: AgeBand, e: unknown): Response {
  const message = formatFetchError(e);
  if (process.env.NODE_ENV === "development") {
    console.error("[api/generate] OpenRouter error:", e);
  }
  const html = getDemoHtml(prompt, ageBand);
  const detail =
    message.length > 400 ? `${message.slice(0, 400)}…` : message;
  const networkLikely = /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|getaddrinfo|certificate/i.test(
    detail,
  );
  const hint = networkLikely
    ? "常见原因：本机连不上 OpenRouter（网络、防火墙或地区限制）。可尝试 VPN/系统代理、换网络，或在 .env.local 中设置 OPENROUTER_BASE_URL 为可访问的兼容端点。"
    : undefined;
  return Response.json({
    html,
    mode: "demo" as const,
    warning: "ai_failed" as const,
    detail,
    ...(hint ? { hint } : {}),
  });
}

/** 修改失败时保留用户当前稿，不换成演示模板 */
function refineFailPayload(
  currentHtml: string,
  e: unknown,
): Response {
  const message = formatFetchError(e);
  if (process.env.NODE_ENV === "development") {
    console.error("[api/generate] OpenRouter refine error:", e);
  }
  const detail =
    message.length > 400 ? `${message.slice(0, 400)}…` : message;
  const networkLikely = /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|getaddrinfo|certificate/i.test(
    detail,
  );
  const hint = networkLikely
    ? "常见原因：本机连不上 OpenRouter。可尝试 VPN/系统代理或换网络。"
    : undefined;
  return Response.json({
    html: currentHtml,
    mode: "demo" as const,
    warning: "ai_failed" as const,
    detail,
    ...(hint ? { hint } : {}),
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const b = body as {
    intent?: unknown;
    prompt?: unknown;
    ageBand?: unknown;
    kind?: unknown;
    styles?: unknown;
    currentHtml?: unknown;
    refinementPrompt?: unknown;
    lockHint?: unknown;
    clientId?: unknown;
  };

  const intent = b.intent === "refine" ? "refine" : "create";
  const ageBand = parseAgeBand(typeof b.ageBand === "string" ? b.ageBand : undefined);
  const apiKey = process.env.OPENROUTER_API_KEY;
  const clientIdRaw =
    typeof b.clientId === "string" ? b.clientId.trim() : "";

  if (intent === "refine") {
    const currentHtml =
      typeof b.currentHtml === "string" ? b.currentHtml.trim() : "";
    const refinement =
      typeof b.refinementPrompt === "string" ? b.refinementPrompt.trim() : "";
    const lockHint =
      typeof b.lockHint === "string" ? b.lockHint.trim() : undefined;

    if (!currentHtml) {
      return Response.json({ error: "empty_html" }, { status: 400 });
    }
    if (!refinement) {
      return Response.json({ error: "empty_refinement" }, { status: 400 });
    }

    if (!apiKey) {
      return Response.json({
        html: currentHtml,
        mode: "demo" as const,
        warning: "refine_needs_ai" as const,
        detail:
          "未配置 OPENROUTER_API_KEY，无法智能修改。请配置密钥后重试，或重新使用「生成作品」。",
      });
    }

    if (!isValidClientId(clientIdRaw)) {
      return Response.json(
        {
          error: "client_id_required" as const,
          detail: "请刷新页面后重试（缺少客户端标识）。",
          ...getCreditsPublicConfig(),
        },
        { status: 400 },
      );
    }

    const refineCost = creditsCostRefine();
    const debit = await debitCredits(clientIdRaw, refineCost);
    if (!debit.ok) {
      return Response.json(
        {
          error: "insufficient_credits" as const,
          balance: debit.balance,
          need: refineCost,
          ...getCreditsPublicConfig(),
        },
        { status: 402 },
      );
    }

    try {
      const { html, usage } = await refineHtml(
        currentHtml,
        refinement,
        lockHint,
        ageBand,
        apiKey,
      );
      return Response.json({
        html,
        mode: "ai" as const,
        creditsBalance: debit.balance,
        ...(usage ? { tokenUsage: usage } : {}),
      });
    } catch (e) {
      await creditCredits(clientIdRaw, refineCost);
      return refineFailPayload(currentHtml, e);
    }
  }

  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  const kind = parseKind(b.kind);
  const styles = parseStyles(b.styles);

  if (!prompt) {
    return Response.json({ error: "empty_prompt" }, { status: 400 });
  }

  const enrichedPrompt = [
    formatCreativeContext(kind, styles),
    prompt,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (!apiKey) {
    const html = getDemoHtml(enrichedPrompt, ageBand);
    return Response.json({ html, mode: "demo" as const });
  }

  if (!isValidClientId(clientIdRaw)) {
    return Response.json(
      {
        error: "client_id_required" as const,
        detail: "请刷新页面后重试（缺少客户端标识）。",
        ...getCreditsPublicConfig(),
      },
      { status: 400 },
    );
  }

  const createCost = creditsCostCreate();
  const debit = await debitCredits(clientIdRaw, createCost);
  if (!debit.ok) {
    return Response.json(
      {
        error: "insufficient_credits" as const,
        balance: debit.balance,
        need: createCost,
        ...getCreditsPublicConfig(),
      },
      { status: 402 },
    );
  }

  try {
    const { html, usage } = await createHtml(prompt, ageBand, kind, styles, apiKey);
    return Response.json({
      html,
      mode: "ai" as const,
      creditsBalance: debit.balance,
      ...(usage ? { tokenUsage: usage } : {}),
    });
  } catch (e) {
    await creditCredits(clientIdRaw, createCost);
    return createFailPayload(enrichedPrompt, ageBand, e);
  }
}
