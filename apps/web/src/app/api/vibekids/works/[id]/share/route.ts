import { incrementWorkShare } from "@/lib/vibekids/works-storage";

export const runtime = "nodejs";

export async function POST(
  _: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const n = await incrementWorkShare(id);
  if (n === null) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true, shares: n });
}
