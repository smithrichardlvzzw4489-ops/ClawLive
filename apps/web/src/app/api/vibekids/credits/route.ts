import {
  getCreditsBalance,
  getCreditsPublicConfig,
  isValidClientId,
} from "@/lib/vibekids/credits-storage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId")?.trim() ?? "";
  if (!isValidClientId(clientId)) {
    return Response.json(
      { error: "invalid_client_id", ...getCreditsPublicConfig(), balance: 0 },
      { status: 400 },
    );
  }
  try {
    const balance = await getCreditsBalance(clientId);
    return Response.json({ balance, ...getCreditsPublicConfig() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "read_failed";
    return Response.json({ error: msg, balance: 0 }, { status: 500 });
  }
}
