import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/vibekids/SiteNav";
import { WorkViewer } from "@/components/vibekids/WorkViewer";
import { VK_BASE } from "@/lib/vibekids/constants";
import { getWorkById } from "@/lib/vibekids/works-storage";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = params;
  const work = await getWorkById(id);
  return {
    title: work ? `${work.title} | VibeKids` : "作品 | VibeKids",
    description: work?.prompt ?? "VibeKids 单页作品预览",
  };
}

export default async function WorkPage({ params }: Props) {
  const { id } = params;
  const work = await getWorkById(id);
  if (!work) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{work.title}</h1>
            {work.prompt ? (
              <p className="mt-1 text-sm text-slate-600">{work.prompt}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${VK_BASE}/studio?age=${work.ageBand}&prompt=${encodeURIComponent(work.prompt ?? work.title)}`}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
            >
              Remix 再创作
            </Link>
            <Link
              href={`${VK_BASE}/studio`}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              去创作室
            </Link>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/80 p-2">
          <WorkViewer html={work.html} />
        </div>
      </main>
    </div>
  );
}
