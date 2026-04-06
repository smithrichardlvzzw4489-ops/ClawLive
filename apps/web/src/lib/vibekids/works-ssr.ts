import type { AgeBand } from "@/lib/vibekids/age";
import type { SavedWork, SavedWorkSummary } from "@/lib/vibekids/works-storage";

/** 直连 Express 根 URL（本地或明确配置时用） */
export function serverWorksApiBase(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "http://localhost:3001"
  )
    .trim()
    .replace(/\/$/, "");
}

/**
 * Server Components 请求作品列表/详情时使用的「站点根」。
 * 优先走当前 Next 站点的 /api/vibekids/*（由 rewrites 转到 Railway），避免 Vercel 上 SSR 误用 localhost:3001 导致永远拉不到已发布作品。
 * 可选：VIBEKIDS_WORKS_SSR_BASE=https://你的前台域名
 */
export function serverWorksSsrOrigin(): string {
  const dedicated = process.env.VIBEKIDS_WORKS_SSR_BASE?.trim().replace(/\/$/, "");
  if (dedicated) return dedicated;

  const app = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (app) return app;

  const v = process.env.VERCEL_URL?.trim();
  if (v) {
    if (v.startsWith("http://") || v.startsWith("https://")) {
      return v.replace(/\/$/, "");
    }
    return `https://${v.replace(/\/$/, "")}`;
  }

  return serverWorksApiBase();
}

export async function fetchPublishedWorkSummariesForSsr(): Promise<
  SavedWorkSummary[]
> {
  const origin = serverWorksSsrOrigin();
  try {
    const res = await fetch(`${origin}/api/vibekids/works?scope=published`, {
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
  const origin = serverWorksSsrOrigin();
  try {
    const res = await fetch(
      `${origin}/api/vibekids/works/${encodeURIComponent(id)}`,
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
