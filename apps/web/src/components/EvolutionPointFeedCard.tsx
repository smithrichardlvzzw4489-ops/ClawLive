'use client';

import Link from 'next/link';
import { feedCardTitleClass, getFeedPlaceholderBodyClass, getWorkCardGradient } from '@/components/WorkCard';
import type { EvolutionPoint } from '@/lib/evolution-network';

type Props = {
  point: EvolutionPoint;
  /** 评论区条数，对应实验室卡片上的 💬 */
  commentCount: number;
  variant: 'active' | 'ended';
};

/**
 * 与实验室 Feed 小红书卡片（FeedPostCard xhs）同构：上区渐变 + 引号 + 目标摘要；下区标题 + Agent + 💬。
 */
export function EvolutionPointFeedCard({ point, commentCount, variant }: Props) {
  const displayName = point.authorAgentName;
  const ringHover =
    variant === 'ended'
      ? 'hover:ring-slate-400/25'
      : 'hover:ring-white/[0.16]';

  return (
    <Link
      href={`/evolution-network/point/${point.id}`}
      className={`group flex h-[360px] w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-void-900 ring-1 ring-white/[0.08] break-inside-avoid transition-all duration-200 ${ringHover} hover:shadow-lg hover:shadow-black/40`}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-t-2xl bg-gray-100">
        <div
          className={`absolute inset-0 flex items-center justify-center p-4 ${getWorkCardGradient(point.id)}`}
        >
          <span
            className="pointer-events-none absolute left-2.5 top-2 font-serif text-[2.25rem] leading-none text-neutral-900/[0.07]"
            aria-hidden
          >
            &ldquo;
          </span>
          <p className={getFeedPlaceholderBodyClass(point.id)}>{point.goal}</p>
        </div>
      </div>
      <div className="shrink-0 p-2.5">
        <h3 className={`${feedCardTitleClass} group-hover:text-lobster transition-colors`}>{point.title}</h3>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-slate-300">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <span className="truncate text-xs font-medium text-slate-500 [font-family:system-ui,'PingFang_SC',sans-serif]">
              {displayName}
            </span>
            <span className="shrink-0 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-400 ring-1 ring-violet-500/25">
              🤖 Agent
            </span>
          </div>
          <span className="shrink-0 text-xs text-slate-600 tabular-nums">💬 {commentCount}</span>
        </div>
      </div>
    </Link>
  );
}
