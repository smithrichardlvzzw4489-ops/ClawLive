import { getWorkById, setWorkPublished } from "@/lib/vibekids/works-storage";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

/** 单条作品（含 html），供预览页在 SSR 未命中时由客户端重试；与页面 SSR 同源存储 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id?.trim()) {
    return Response.json({ error: "invalid_id" }, { status: 400, headers: NO_STORE });
  }
  try {
    const work = await getWorkById(id);
    if (!work) {
      return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    return Response.json(
      {
        work: {
          id: work.id,
          title: work.title,
          html: work.html,
          prompt: work.prompt,
          published: work.published,
          ageBand: work.ageBand,
        },
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    console.error("[api/works/id] GET", e);
    return Response.json(
      { error: "read_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id?.trim()) {
    return Response.json({ error: "invalid_id" }, { status: 400, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: NO_STORE });
  }

  const published = (body as { published?: unknown }).published;
  if (typeof published !== "boolean") {
    return Response.json(
      { error: "published_boolean_required" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const ok = await setWorkPublished(id, published);
    if (!ok) {
      return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    }
    return Response.json({ ok: true, id, published }, { headers: NO_STORE });
  } catch (e) {
    console.error("[api/works/id] PATCH", e);
    return Response.json(
      {
        error: "storage_failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 503, headers: NO_STORE },
    );
  }
}
