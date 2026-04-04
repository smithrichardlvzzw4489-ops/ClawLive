import { incrementWorkLike } from "@/lib/works-storage";

export const runtime = "nodejs";

export async function POST(
  _: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const n = await incrementWorkLike(id);
  if (n === null) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true, likes: n });
}
