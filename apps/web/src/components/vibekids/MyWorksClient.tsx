"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { VK_API_BASE, VK_BASE } from "@/lib/vibekids/constants";
import type { SavedWorkSummary } from "@/lib/vibekids/works-storage";

function likeCount(n: number | undefined) {
  const v = n ?? 0;
  return v <= 0 ? "暂无点赞" : `❤️ ${v} 次点赞`;
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function MyWorksClient() {
  const [works, setWorks] = useState<SavedWorkSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${VK_API_BASE}/works`);
      const data = (await res.json()) as { works?: SavedWorkSummary[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "load_failed");
      const list = Array.isArray(data.works) ? data.works : [];
      setWorks(list);
      setErr(null);
    } catch {
      setErr("加载失败，请刷新页面重试。");
      setWorks([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setPublished = useCallback(
    async (id: string, published: boolean) => {
      setBusyId(id);
      setErr(null);
      try {
        const res = await fetch(`${VK_API_BASE}/works/publish-state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, published }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };
        if (!res.ok) {
          const hint =
            data.error === "not_found" ?
              "找不到该作品，请刷新列表后重试。"
            : data.error === "storage_failed" && data.detail ?
              `保存失败：${data.detail}（若部署在无磁盘环境，需配置可写存储）`
            : data.error === "id_required" || data.error === "published_boolean_required" ?
              "请求无效，请刷新页面后重试。"
            : "更新发布状态失败，请稍后再试。";
          setErr(hint);
          return;
        }
        await load();
      } catch {
        setErr("网络异常，请检查连接后重试。");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  if (works === null) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
        加载中…
      </p>
    );
  }

  if (works.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-600">
        <p>还没有保存的作品。</p>
        <Link
          href={`${VK_BASE}/studio`}
          className="mt-3 inline-block font-semibold text-violet-700 underline"
        >
          去创作室生成并保存 →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {err ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {err}
        </p>
      ) : null}
      <ul className="space-y-3">
        {works.map((w) => (
          <li
            key={w.id}
            className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">{w.title}</h2>
                {w.published ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                    已发布
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-950">
                    未发布
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">{formatTime(w.createdAt)}</p>
              {w.prompt ? (
                <p className="mt-2 line-clamp-2 text-sm text-slate-600">{w.prompt}</p>
              ) : null}
              {w.published ? (
                <p className="mt-2 text-xs text-emerald-800/90">
                  {likeCount(w.likes)} · 在{" "}
                  <Link href={`${VK_BASE}/explore`} className="font-medium underline">
                    作品广场
                  </Link>{" "}
                  被看到；撤回发布后点赞数仍保留
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  未发布时仅自己可打开预览；发布后他人可在广场点赞
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href={`${VK_BASE}/works/${w.id}`}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 transition hover:border-violet-300 hover:bg-violet-50"
              >
                预览
              </Link>
              <Link
                href={`${VK_BASE}/studio?prompt=${encodeURIComponent(w.prompt ?? w.title)}`}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 transition hover:border-violet-300 hover:bg-violet-50"
              >
                Remix
              </Link>
              {w.published ? (
                <button
                  type="button"
                  disabled={busyId === w.id}
                  onClick={() => void setPublished(w.id, false)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50"
                >
                  {busyId === w.id ? "…" : "撤回发布"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyId === w.id}
                  onClick={() => void setPublished(w.id, true)}
                  className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50"
                >
                  {busyId === w.id ? "…" : "发布到广场"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
