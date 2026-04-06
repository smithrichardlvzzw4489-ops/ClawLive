"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WorkEngagementBar } from "@/components/vibekids/WorkEngagementBar";
import { WorkViewer } from "@/components/vibekids/WorkViewer";
import { VK_API_BASE, VK_BASE, vibekidsBearerHeader } from "@/lib/vibekids/constants";
import type { AgeBand } from "@/lib/vibekids/age";
import { getClientId } from "@/lib/vibekids/client-credits";
import type { WorkComment } from "@/lib/vibekids/works-storage";

export type VibekidsWorkPayload = {
  id: string;
  title: string;
  html: string;
  prompt?: string;
  published: boolean;
  ageBand: AgeBand;
  likes: number;
  shares: number;
  favorites: number;
  comments: WorkComment[];
  viewerFavorited: boolean;
};

type Props = {
  workId: string;
  serverWork: VibekidsWorkPayload | null;
};

export function VibekidsWorkView({ workId, serverWork }: Props) {
  const [work, setWork] = useState<VibekidsWorkPayload | null>(serverWork);
  const [phase, setPhase] = useState<"ready" | "loading" | "missing">(
    serverWork ? "ready" : "loading",
  );

  useEffect(() => {
    if (serverWork) return;
    let cancelled = false;
    (async () => {
      try {
        const cid = getClientId();
        const q = cid ? `?clientId=${encodeURIComponent(cid)}` : "";
        const res = await fetch(
          `${VK_API_BASE}/works/${encodeURIComponent(workId)}${q}`,
          { cache: "no-store", headers: { ...vibekidsBearerHeader() } },
        );
        if (!res.ok) {
          if (!cancelled) setPhase("missing");
          return;
        }
        const data = (await res.json()) as { work?: VibekidsWorkPayload };
        if (cancelled) return;
        if (data.work?.html) {
          setWork(data.work);
          setPhase("ready");
        } else {
          setPhase("missing");
        }
      } catch {
        if (!cancelled) setPhase("missing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workId, serverWork]);

  useEffect(() => {
    if (!serverWork) return;
    let cancelled = false;
    const cid = getClientId();
    if (!cid) return;
    (async () => {
      try {
        const res = await fetch(
          `${VK_API_BASE}/works/${encodeURIComponent(workId)}?clientId=${encodeURIComponent(cid)}`,
          { cache: "no-store", headers: { ...vibekidsBearerHeader() } },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { work?: VibekidsWorkPayload };
        if (cancelled || !data.work?.html) return;
        setWork(data.work);
      } catch {
        /* keep serverWork */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverWork, workId]);

  if (phase === "loading") {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-12 sm:px-6">
        <p className="text-center text-sm text-slate-500">正在加载作品…</p>
      </main>
    );
  }

  if (phase === "missing" || !work) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-slate-900">
          <h1 className="text-lg font-semibold text-amber-950">暂时找不到这部作品</h1>
          <p className="mt-3 text-sm leading-relaxed text-amber-950/90">
            作品已保存在后端数据库时，请确认已<strong className="font-semibold">登录主站账号</strong>
            （未发布作品仅作者可见）。若链接有误或作品已删除，也会显示本页。也可从{" "}
            <Link href={`${VK_BASE}/my-works`} className="font-semibold text-violet-800 underline">
              我的作品
            </Link>{" "}
            打开预览重试。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`${VK_BASE}/my-works`}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
            >
              打开我的作品
            </Link>
            <Link
              href={`${VK_BASE}/explore`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
            >
              作品广场
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6">
      {!work.published ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          此作品<strong>未发布</strong>，不会出现在作品广场「发现」。若要公开，请到{" "}
          <Link href={`${VK_BASE}/my-works`} className="font-semibold underline">
            我的作品
          </Link>{" "}
          点击「发布到广场」。
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{work.title}</h1>
          {work.prompt ? (
            <p className="mt-1 text-sm text-slate-600">{work.prompt}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${VK_BASE}?prompt=${encodeURIComponent(work.prompt ?? work.title)}`}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
          >
            Remix 再创作
          </Link>
          <Link
            href={VK_BASE}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            去创作室
          </Link>
        </div>
      </div>

      {/* 预览在上：窄屏下互动区很高，若 preview 用 flex-1 min-h-0 会被压成 0 高度，iframe 不可见 */}
      <div className="mb-4 w-full min-h-[max(280px,min(52dvh,620px))] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/80 p-2">
        <WorkViewer html={work.html} nativeScroll />
      </div>

      <WorkEngagementBar
        workId={work.id}
        published={work.published}
        initialLikes={work.likes}
        initialShares={work.shares}
        initialFavorites={work.favorites}
        initialComments={work.comments}
        initialViewerFavorited={work.viewerFavorited}
      />
    </main>
  );
}
