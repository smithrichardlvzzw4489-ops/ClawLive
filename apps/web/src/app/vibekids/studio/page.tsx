import { redirect } from "next/navigation";
import { VK_BASE } from "@/lib/vibekids/constants";

function buildQuery(sp: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, val] of Object.entries(sp)) {
    if (val == null) continue;
    if (Array.isArray(val)) {
      for (const v of val) q.append(key, v);
    } else {
      q.append(key, val);
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export default function StudioPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  redirect(`${VK_BASE}${buildQuery(searchParams)}`);
}
