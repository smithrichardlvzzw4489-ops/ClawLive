"use client";

import { useCallback, useEffect, useState } from "react";
import { VK_API_BASE, VK_BASE } from "@/lib/vibekids/constants";
import { getClientId } from "@/lib/vibekids/client-credits";
import type { WorkComment } from "@/lib/vibekids/works-storage";
import { PUBLISH_POINTS, LIKE_POINTS, workListingScore } from "@/lib/vibekids/work-points";

type Props = {
  workId: string;
  published: boolean;
  initialLikes: number;
  initialShares: number;
  initialFavorites: number;
  initialComments: WorkComment[];
  initialViewerFavorited: boolean;
};

function formatCommentTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function WorkEngagementBar({
  workId,
  published,
  initialLikes,
  initialShares,
  initialFavorites,
  initialComments,
  initialViewerFavorited,
}: Props) {
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => {
    setShareUrl(`${window.location.origin}${VK_BASE}/works/${workId}`);
  }, [workId]);

  const [likes, setLikes] = useState(initialLikes);
  const [shares, setShares] = useState(initialShares);
  const [favorites, setFavorites] = useState(initialFavorites);
  const [comments, setComments] = useState<WorkComment[]>(initialComments);
  const [viewerFavorited, setViewerFavorited] = useState(initialViewerFavorited);
  const [likeBusy, setLikeBusy] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const scoreLine = published ?
    `作品分 ${workListingScore({ published: true, likes })}（发布 ${PUBLISH_POINTS} 分 + 赞 ×${LIKE_POINTS}）`
  : "未发布作品不参与广场积分";

  const recordShare = useCallback(async () => {
    setShareBusy(true);
    try {
      const res = await fetch(`${VK_API_BASE}/works/${workId}/share`, {
        method: "POST",
      });
      const data = (await res.json()) as { shares?: number };
      if (res.ok && typeof data.shares === "number") setShares(data.shares);
    } catch {
      /* */
    } finally {
      setShareBusy(false);
    }
  }, [workId]);

  const onShare = useCallback(async () => {
    setNotice(null);
    const url =
      shareUrl || `${typeof window !== "undefined" ? window.location.origin : ""}${VK_BASE}/works/${workId}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "VibeKids 作品",
          text: "来看看这部作品",
          url,
        });
        await recordShare();
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice("链接已复制，可粘贴转发。");
      await recordShare();
    } catch {
      setNotice("无法复制链接，请手动复制地址栏。");
    }
  }, [recordShare, shareUrl, workId]);

  const onLike = useCallback(async () => {
    setLikeBusy(true);
    try {
      const res = await fetch(`${VK_API_BASE}/works/${workId}/like`, {
        method: "POST",
      });
      const data = (await res.json()) as { likes?: number };
      if (res.ok && typeof data.likes === "number") setLikes(data.likes);
    } catch {
      /* */
    } finally {
      setLikeBusy(false);
    }
  }, [workId]);

  const onFavorite = useCallback(async () => {
    const clientId = getClientId();
    if (!clientId) {
      setNotice("无法读取浏览器标识，请关闭隐私拦截后重试。");
      return;
    }
    const next = !viewerFavorited;
    setFavBusy(true);
    try {
      const res = await fetch(`${VK_API_BASE}/works/${workId}/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, favorited: next }),
      });
      const data = (await res.json()) as { favorites?: number; ok?: boolean };
      if (res.ok && typeof data.favorites === "number") {
        setFavorites(data.favorites);
        setViewerFavorited(next);
      }
    } catch {
      /* */
    } finally {
      setFavBusy(false);
    }
  }, [viewerFavorited, workId]);

  const onSubmitComment = useCallback(async () => {
    const t = commentText.trim();
    if (!t) return;
    setCommentBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`${VK_API_BASE}/works/${workId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: t }),
      });
      const data = (await res.json()) as { comments?: WorkComment[]; error?: string };
      if (res.ok && Array.isArray(data.comments)) {
        setComments(data.comments);
        setCommentText("");
      } else if (data.error === "limit") {
        setNotice("评论已满，无法再发。");
      } else {
        setNotice("评论发送失败，请稍后再试。");
      }
    } catch {
      setNotice("网络异常，评论未发送。");
    } finally {
      setCommentBusy(false);
    }
  }, [commentText, workId]);

  return (
    <div className="mb-4 space-y-4 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <p className="text-xs font-medium text-slate-600">{scoreLine}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onShare()}
          disabled={shareBusy}
          className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 transition hover:bg-sky-100 disabled:opacity-50"
        >
          转发
          <span className="tabular-nums text-sky-800/80">{shares}</span>
        </button>
        <button
          type="button"
          onClick={() => void onLike()}
          disabled={likeBusy}
          className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 transition hover:bg-rose-100 disabled:opacity-50"
        >
          点赞
          <span className="tabular-nums">{likes}</span>
        </button>
        <button
          type="button"
          onClick={() => void onFavorite()}
          disabled={favBusy}
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
            viewerFavorited ?
              "border-amber-400 bg-amber-100 text-amber-950"
            : "border-amber-200 bg-amber-50/80 text-amber-950 hover:bg-amber-100"
          }`}
        >
          {viewerFavorited ? "已收藏" : "收藏"}
          <span className="tabular-nums opacity-90">{favorites}</span>
        </button>
      </div>
      {notice ? (
        <p className="text-xs text-violet-800">{notice}</p>
      ) : null}

      <div className="border-t border-slate-100 pt-3">
        <p className="mb-2 text-sm font-semibold text-slate-800">
          评论 <span className="font-normal text-slate-500">({comments.length})</span>
        </p>
        {published ? (
          <>
            <ul className="mb-3 max-h-48 space-y-2 overflow-y-auto text-sm">
              {comments.length === 0 ? (
                <li className="text-slate-500">还没有评论，来抢沙发吧。</li>
              ) : (
                comments.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl bg-slate-50 px-3 py-2 text-slate-800"
                  >
                    <p className="whitespace-pre-wrap break-words">{c.body}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {formatCommentTime(c.createdAt)}
                    </p>
                  </li>
                ))
              )}
            </ul>
            <label htmlFor="vk-comment" className="sr-only">
              写评论
            </label>
            <textarea
              id="vk-comment"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={2}
              maxLength={280}
              placeholder="友善发言，最多 280 字"
              className="mb-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
            <button
              type="button"
              onClick={() => void onSubmitComment()}
              disabled={commentBusy || !commentText.trim()}
              className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              {commentBusy ? "发送中…" : "发表评论"}
            </button>
          </>
        ) : (
          <p className="text-xs text-slate-500">
            发布到广场后，他人可在此留言。
          </p>
        )}
      </div>
    </div>
  );
}
