import type { AgeBand } from "@/lib/vibekids/age";
import type { SavedWork, SavedWorkSummary } from "@/lib/vibekids/works-storage";

/** 服务端拉取 VibeKids 作品 API（Railway / 本地 Express），避免读 Next 临时目录 */
export function serverWorksApiBase(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "http://localhost:3001"
  )
    .trim()
    .replace(/\/$/, "");
}

export async function fetchPublishedWorkSummariesForSsr(): Promise<
  SavedWorkSummary[]
> {
  const base = serverWorksApiBase();
  try {
    const res = await fetch(`${base}/api/vibekids/works?scope=published`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { works?: SavedWorkSummary[] };
    return Array.isArray(data.works) ? data.works : [];
  } catch {
    return [];
  }
}

type RemoteWorkBody = {
  id: string;
  title: string;
  html: string;
  prompt?: string;
  published: boolean;
  ageBand: string;
  likes: number;
  shares: number;
  favorites: number;
  comments?: { id: string; body: string; createdAt: string }[];
  createdAt?: string;
};

export async function fetchWorkByIdForSsr(id: string): Promise<SavedWork | null> {
  const base = serverWorksApiBase();
  try {
    const res = await fetch(
      `${base}/api/vibekids/works/${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (res.status === 403 || res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { work?: RemoteWorkBody };
    const w = data.work;
    if (!w?.html) return null;
    const band = w.ageBand as AgeBand;
    return {
      id: w.id,
      title: w.title,
      html: w.html,
      prompt: w.prompt,
      published: w.published,
      ageBand: band === "primary" || band === "middle" || band === "unified" ? band : "unified",
      likes: w.likes,
      shares: w.shares,
      favorites: w.favorites,
      comments: Array.isArray(w.comments) ? w.comments : [],
      createdAt: w.createdAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
