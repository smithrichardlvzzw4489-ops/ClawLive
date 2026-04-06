import { tryProxyVibekidsWorksToExpress } from "@/lib/vibekids/works-upstream-proxy";
import { toggleWorkFavorite } from "@/lib/vibekids/works-storage";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const proxied = await tryProxyVibekidsWorksToExpress(req);
  if (proxied) return proxied;
  const { id } = params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const b = body as { clientId?: unknown; favorited?: unknown };
  const clientId = typeof b.clientId === "string" ? b.clientId : "";
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(clientId)) {
    return Response.json({ error: "client_id_invalid" }, { status: 400 });
  }
  if (typeof b.favorited !== "boolean") {
    return Response.json({ error: "favorited_boolean_required" }, { status: 400 });
  }
  const result = await toggleWorkFavorite(id, clientId, b.favorited);
  if (result === null) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({
    ok: true,
    favorites: result.favorites,
    favorited: b.favorited,
  });
}
