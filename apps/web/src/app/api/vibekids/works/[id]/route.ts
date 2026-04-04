import { setWorkPublished } from "@/lib/vibekids/works-storage";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id?.trim()) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const published = (body as { published?: unknown }).published;
  if (typeof published !== "boolean") {
    return Response.json({ error: "published_boolean_required" }, { status: 400 });
  }

  try {
    const ok = await setWorkPublished(id, published);
    if (!ok) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json({ ok: true, id, published });
  } catch (e) {
    console.error("[api/works/id] PATCH", e);
    return Response.json(
      {
        error: "storage_failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 503 },
    );
  }
}
