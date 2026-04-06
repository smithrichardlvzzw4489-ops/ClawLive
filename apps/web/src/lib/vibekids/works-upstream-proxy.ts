/**
 * App Router 会优先匹配 /api/vibekids/works/*，rewrite 不会生效。
 * 已登录用户作品在 Express + PostgreSQL；未代理时只会读写 Next 本地/Redis，导致「我的作品」与发布状态不一致。
 */

function vibekidsWorksUpstreamOrigin(): string | null {
  const isVercel = process.env.VERCEL === "1";
  const raw = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (!raw) return null;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (
      isVercel &&
      (u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        u.hostname === "[::1]")
    ) {
      return null;
    }
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function hasBearer(req: Request): boolean {
  const a = req.headers.get("authorization");
  return typeof a === "string" && a.startsWith("Bearer ");
}

/**
 * 将当前请求原样转发到上游 Express（同 path + query）。
 * @returns null 表示未配置上游或按规则应走本地
 */
export async function tryProxyVibekidsWorksToExpress(
  req: Request,
): Promise<Response | null> {
  const origin = vibekidsWorksUpstreamOrigin();
  if (!origin) return null;

  const url = new URL(req.url);
  const pathname = url.pathname;
  if (!pathname.startsWith("/api/vibekids/works")) return null;

  // 访客保存：只写本地 demo 存储，不上传 Lobster
  if (
    req.method === "POST" &&
    pathname === "/api/vibekids/works" &&
    !hasBearer(req)
  ) {
    return null;
  }

  const target = `${origin}${pathname}${url.search}`;
  const headers = new Headers();
  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  const res = await fetch(target, init);
  const outHeaders = new Headers();
  const noStore = res.headers.get("cache-control");
  if (noStore) outHeaders.set("cache-control", noStore);
  else outHeaders.set("cache-control", "private, no-store, max-age=0");
  const ctOut = res.headers.get("content-type");
  if (ctOut) outHeaders.set("content-type", ctOut);
  return new Response(res.body, { status: res.status, headers: outHeaders });
}
