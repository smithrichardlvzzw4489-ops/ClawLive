"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WorkViewer } from "@/components/vibekids/WorkViewer";
import { VK_API_BASE, VK_BASE } from "@/lib/vibekids/constants";
import type { AgeBand } from "@/lib/vibekids/age";

export type VibekidsWorkPayload = {
  id: string;
  title: string;
  html: string;
  prompt?: string;
  published: boolean;
  ageBand: AgeBand;
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
        const res = await fetch(
          `${VK_API_BASE}/works/${encodeURIComponent(workId)}`,
          { cache: "no-store" },
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
            链接若刚生成，在无持久磁盘或多实例部署下，预览页与保存接口可能不在同一台机器，会出现短暂
            404。请从{" "}
            <Link href={`${VK_BASE}/my-works`} className="font-semibold text-violet-800 underline">
              我的作品
            </Link>{" "}
            再点「预览」重试；长期稳定访问请在服务器配置{" "}
            <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-xs">
              VIBEKIDS_DATA_DIR
            </code>{" "}
            指向可写持久目录。
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
            href={`${VK_BASE}/studio?prompt=${encodeURIComponent(work.prompt ?? work.title)}`}
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
  );
}
