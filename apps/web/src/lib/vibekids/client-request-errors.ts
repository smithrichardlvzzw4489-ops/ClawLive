import { vibekidsFetchAbortSignal } from "@/lib/vibekids/generate-timeouts";

/** fetch 在拿到 Response 之前就失败时抛出，便于区分「哪条链路」出问题 */
export class VibekidsRequestError extends Error {
  readonly phase: "auth_llm" | "guest_llm" | "guest_fallback";
  readonly requestPath: string;

  constructor(
    phase: "auth_llm" | "guest_llm" | "guest_fallback",
    url: string,
    cause: unknown,
  ) {
    const cm = cause instanceof Error ? cause.message : String(cause);
    super(cm);
    this.name = "VibekidsRequestError";
    this.phase = phase;
    this.requestPath = pathnameOnly(url);
    Object.defineProperty(this, "cause", { value: cause, enumerable: false });
  }
}

function pathnameOnly(url: string): string {
  try {
    if (url.startsWith("/")) return url.split("?")[0] || url;
    const u = new URL(url);
    return u.pathname;
  } catch {
    return "(invalid-url)";
  }
}

const PHASE_LABEL: Record<VibekidsRequestError["phase"], string> = {
  auth_llm: "已登录 → /api/lobster/vibekids-generate（经本站反代到后端）",
  guest_llm: "未携带登录态时请求（创作需登录，本路径应返回 login_required）",
  guest_fallback: "（已废弃）曾用于登录失效后改走访客生成",
};

function sanitizeTechnicalMessage(raw: string): string {
  return raw
    .replace(/Bearer\s+[\w.-]+/gi, "Bearer ***")
    .replace(/token["']?\s*[:=]\s*["'][^"']+/gi, "token=***")
    .slice(0, 200);
}

/**
 * 将「浏览器里真实抛出的错误」转成用户可读文案，并保留可对照的技术摘要（不含敏感 token）。
 */
export function noticeFromVibekidsFailure(
  e: unknown,
  opts?: { refine?: boolean },
): string {
  if (
    e instanceof DOMException &&
    (e.name === "AbortError" || e.name === "TimeoutError")
  ) {
    return opts?.refine ?
        "请求等待过久已中断，请稍后再试或简化修改说明。"
      : "请求等待过久已中断，请稍后再试或简化描述。";
  }
  if (e instanceof VibekidsRequestError) {
    const label = PHASE_LABEL[e.phase];
    const safe = sanitizeTechnicalMessage(e.message || "未知错误");
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return (
      `请求未完成（${label}）。` +
      `路径：${e.requestPath}。原因：${safe || "（无详情）"}` +
      (origin ? `。也可复制 ${origin} 到系统浏览器打开后重试。` : "。")
    );
  }
  if (e instanceof TypeError) {
    const m = sanitizeTechnicalMessage(e.message || "TypeError");
    return (
      `请求失败（TypeError：${m}）。` +
      `常见于网络中断、代理/防火墙拦截或内置浏览器限制；请尝试系统浏览器打开同一站点。`
    );
  }
  const msg = sanitizeTechnicalMessage(
    e instanceof Error ? e.message : String(e),
  );
  return `请求异常：${msg || "未知"}。请刷新页面后重试。`;
}

/** 失败后在控制台输出本站诊断接口结果，便于微信内开 vConsole 对照 */
export async function logVibekidsConnectivityDiag(context: string): Promise<void> {
  try {
    const r = await fetch("/api/vibekids/diag", {
      signal: vibekidsFetchAbortSignal(12_000),
    });
    const text = await r.text();
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    console.error("[VibeKids]", context, "connectivity diag:", {
      status: r.status,
      ok: r.ok,
      body,
    });
  } catch (err) {
    console.error("[VibeKids]", context, "connectivity diag fetch failed:", err);
  }
}
