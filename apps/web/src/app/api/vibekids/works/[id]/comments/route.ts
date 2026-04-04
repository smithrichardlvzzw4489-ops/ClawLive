import { addWorkComment } from "@/lib/vibekids/works-storage";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const text = (body as { body?: unknown }).body;
  if (typeof text !== "string") {
    return Response.json({ error: "body_string_required" }, { status: 400 });
  }
  const result = await addWorkComment(id, text);
  if (!result.ok) {
    if (result.reason === "not_found") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (result.reason === "unpublished") {
      return Response.json({ error: "unpublished" }, { status: 403 });
    }
    const status = result.reason === "limit" ? 429 : 400;
    return Response.json({ error: result.reason }, { status });
  }
  return Response.json({ ok: true, comments: result.comments });
}
