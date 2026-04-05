import type { Metadata } from "next";
import { SiteNav } from "@/components/vibekids/SiteNav";
import {
  VibekidsWorkView,
  type VibekidsWorkPayload,
} from "@/components/vibekids/VibekidsWorkView";
import type { SavedWork } from "@/lib/vibekids/works-storage";
import { fetchWorkByIdForSsr } from "@/lib/vibekids/works-ssr";

export const dynamic = "force-dynamic";

type Props = { params: { id: string } };

function toPayload(w: SavedWork): VibekidsWorkPayload {
  return {
    id: w.id,
    title: w.title,
    html: w.html,
    prompt: w.prompt,
    published: w.published,
    ageBand: w.ageBand,
    likes: w.likes ?? 0,
    shares: w.shares ?? 0,
    favorites: w.favorites ?? 0,
    comments: w.comments ?? [],
    viewerFavorited: false,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = params;
  const work = await fetchWorkByIdForSsr(id);
  return {
    title: work ? `${work.title} | VibeKids` : "作品 | VibeKids",
    description: work?.prompt ?? "VibeKids 单页作品预览",
  };
}

export default async function WorkPage({ params }: Props) {
  const { id } = params;
  const serverWork = await fetchWorkByIdForSsr(id);
  const payload = serverWork ? toPayload(serverWork) : null;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <VibekidsWorkView workId={id} serverWork={payload} />
    </div>
  );
}
