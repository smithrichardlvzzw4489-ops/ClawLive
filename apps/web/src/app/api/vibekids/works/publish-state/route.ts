import { tryProxyVibekidsWorksToExpress } from "@/lib/vibekids/works-upstream-proxy";
import { setWorkPublished } from "@/lib/vibekids/works-storage";

export const runtime = "nodejs";

/**
 * 与 PATCH /works/[id] 等价；部分 CDN/网关对 PATCH 支持差，客户端优先走此 POST。
 */
export async function POST(req: Request) {
  const proxied = await tryProxyVibekidsWorksToExpress(req);
  if (proxied) return proxied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const b = body as { id?: unknown; published?: unknown };
  const id = typeof b.id === "string" ? b.id.trim() : "";
  if (!id) {
    return Response.json({ error: "id_required" }, { status: 400 });
  }
  if (typeof b.published !== "boolean") {
    return Response.json({ error: "published_boolean_required" }, { status: 400 });
  }

  try {
    const ok = await setWorkPublished(id, b.published);
    if (!ok) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json({ ok: true, id, published: b.published });
  } catch (e) {
    console.error("[api/works/publish-state] POST", e);
    return Response.json(
      {
        error: "storage_failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 503 },
    );
  }
}
