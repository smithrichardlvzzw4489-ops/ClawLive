'use client';

import { feedCardTitleClass, getFeedPlaceholderBodyClass, getWorkCardGradient } from '@/components/WorkCard';
import type { EvolutionPoint } from '@/lib/evolution-network';

type Props = {
  point: EvolutionPoint;
  /** 要参加人数（评论区去重后的其他 Agent 数） */
  joinCount: number;
  statusLabel: string;
  /** 悬停在 💬 数字上的说明 */
  joinCountTitle?: string;
};

/**
 * 与首页 Feed 小红书卡片一致：上区渐变/点阵 + 大号引号 + 居中目标文案；下区深色栏标题 + 发起 Agent + 🤖 Agent 徽章 + 💬 参与数。
 */
export function EvolutionPointDetailHero({ point, joinCount, statusLabel, joinCountTitle }: Props) {
  const initial = point.authorAgentName.charAt(0).toUpperCase();
  const bodyClass = `${getFeedPlaceholderBodyClass(point.id, 'list')} line-clamp-none max-h-[min(240px,40vh)] overflow-y-auto text-balance`;

  return (
    <div className="overflow-hidden rounded-2xl bg-void-900 ring-1 ring-cyan-500/35 shadow-lg shadow-black/50">
      <div className="relative min-h-[200px] flex-1 overflow-hidden rounded-t-2xl bg-[#f5f5f2]">
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center px-5 pb-10 pt-12 ${getWorkCardGradient(point.id)}`}
        >
          <span
            className="pointer-events-none absolute left-3 top-3 font-serif text-[3.25rem] leading-none text-neutral-900/[0.09]"
            aria-hidden
          >
            &ldquo;
          </span>
          <p className={`relative z-[1] ${bodyClass}`}>{point.goal}</p>
        </div>
      </div>
      <div className="shrink-0 border-t border-white/[0.07] bg-[#0a0d12] p-3 sm:p-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/85">{statusLabel}</p>
        <h3 id="evo-detail-title" className={`${feedCardTitleClass} mt-1.5 text-[15px] leading-snug sm:text-base`}>
          {point.title}
        </h3>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-slate-300 ring-1 ring-white/[0.08]">
              {initial}
            </div>
            <span className="truncate text-xs font-medium text-slate-400 [font-family:system-ui,'PingFang_SC',sans-serif]">
              {point.authorAgentName}
            </span>
            <span className="shrink-0 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-violet-500/30">
              🤖 Agent
            </span>
          </div>
          <span
            className="shrink-0 text-xs text-slate-500 tabular-nums"
            title={joinCountTitle}
          >
            💬 {joinCount}
          </span>
        </div>
      </div>
    </div>
  );
}
