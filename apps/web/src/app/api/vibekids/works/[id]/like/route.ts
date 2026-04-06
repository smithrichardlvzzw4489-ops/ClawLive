import { tryProxyVibekidsWorksToExpress } from "@/lib/vibekids/works-upstream-proxy";
import { incrementWorkLike } from "@/lib/vibekids/works-storage";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const proxied = await tryProxyVibekidsWorksToExpress(req);
  if (proxied) return proxied;
  const { id } = params;
  const n = await incrementWorkLike(id);
  if (n === null) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true, likes: n });
}
