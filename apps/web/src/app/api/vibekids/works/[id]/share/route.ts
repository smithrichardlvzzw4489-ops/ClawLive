import { tryProxyVibekidsWorksToExpress } from "@/lib/vibekids/works-upstream-proxy";
import { incrementWorkShare } from "@/lib/vibekids/works-storage";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const proxied = await tryProxyVibekidsWorksToExpress(req);
  if (proxied) return proxied;
  const { id } = params;
  const n = await incrementWorkShare(id);
  if (n === null) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true, shares: n });
}
