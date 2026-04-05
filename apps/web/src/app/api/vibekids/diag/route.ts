import { NextResponse } from "next/server";

export const runtime = "nodejs";

function apiOrigin(): string {
  return (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
}

function hostnameOf(origin: string): string | null {
  if (!origin) return null;
  try {
    const u = new URL(origin.includes("://") ? origin : `https://${origin}`);
    return u.hostname;
  } catch {
    return null;
  }
}

/** 8s 超时，兼容无 AbortSignal.timeout 的运行环境 */
function abortAfter(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & {
    timeout?: (n: number) => AbortSignal;
  };
  if (typeof AS.timeout === "function") {
    return AS.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/**
 * 用于定位「是浏览器到 Vercel 断了」还是「Vercel 到后端（Railway 等）断了」。
 * 不含密钥；任问可 GET。
 */
export async function GET() {
  const origin = apiOrigin();
  const base: Record<string, unknown> = {
    v: 1,
    time: new Date().toISOString(),
    next: { ok: true },
    backend: {
      nextPublicApiUrlSet: Boolean(origin),
      host: hostnameOf(origin),
    },
  };

  if (!origin) {
    base.backendProbe = {
      skipped: true,
      reason: "NEXT_PUBLIC_API_URL 未配置，本站未配置反代目标（仅影响已登录 Lobster 等 /api 代理）。",
    };
    return NextResponse.json(base);
  }

  const healthUrl = `${origin}/api/health`;
  const t0 = Date.now();
  try {
    const r = await fetch(healthUrl, {
      method: "GET",
      signal: abortAfter(8000),
      headers: { Accept: "application/json" },
    });
    const text = await r.text();
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }
    base.backendProbe = {
      ok: r.ok,
      status: r.status,
      ms: Date.now() - t0,
      healthUrlPath: "/api/health",
      json,
      bodySnippet: text.trim().slice(0, 240),
    };
  } catch (err) {
    base.backendProbe = {
      ok: false,
      ms: Date.now() - t0,
      healthUrlPath: "/api/health",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return NextResponse.json(base);
}
