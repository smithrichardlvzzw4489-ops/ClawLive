import { parseAgeBand } from "@/lib/age";
import { parseKind } from "@/lib/creative";
import { getWorkSummaries, saveWork } from "@/lib/works-storage";
import { rewardPointsFromQuality } from "@/lib/work-quality";

export const runtime = "nodejs";

export async function GET() {
  try {
    const summaries = await getWorkSummaries();
    return Response.json({ works: summaries });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "read_failed";
    return Response.json({ error: msg, works: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const b = body as {
    html?: unknown;
    ageBand?: unknown;
    prompt?: unknown;
    kind?: unknown;
    title?: unknown;
    spotlightRequested?: unknown;
  };

  const html = typeof b.html === "string" ? b.html : "";
  if (!html.trim()) {
    return Response.json({ error: "empty_html" }, { status: 400 });
  }

  const ageBand = parseAgeBand(typeof b.ageBand === "string" ? b.ageBand : undefined);
  const prompt = typeof b.prompt === "string" ? b.prompt : undefined;
  const title = typeof b.title === "string" ? b.title : undefined;
  const kind = parseKind(b.kind);
  const spotlightRequested = b.spotlightRequested === true;

  try {
    const work = await saveWork({
      html,
      ageBand,
      prompt,
      title,
      kind,
      spotlightRequested,
    });
    const qs = work.qualityScore ?? 0;
    const rewardPointsEarned = rewardPointsFromQuality(qs);
    return Response.json({
      ok: true,
      id: work.id,
      title: work.title,
      createdAt: work.createdAt,
      qualityScore: qs,
      rewardPointsEarned,
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : "save_failed";
    if (code === "html_too_large") {
      return Response.json({ error: code }, { status: 413 });
    }
    console.error("[api/works] save error:", e);
    return Response.json(
      {
        error: "storage_failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 503 },
    );
  }
}
