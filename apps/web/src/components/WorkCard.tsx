'use client';

import Link from 'next/link';

/** 基于 id 的简单哈希，用于稳定选择背景风格 */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * 无封面占位背景（小红书式：纸感、点阵/弥散、低饱和；按 id 稳定选一套）。
 * 返回完整 utility 类名，勿再拼 `bg-gradient-to-br`。
 */
export function getWorkCardGradient(id: string): string {
  return PLACEHOLDER_SURFACE_STYLES[hashId(id) % PLACEHOLDER_SURFACE_STYLES.length];
}

/** 无封面占位正文：按 id 在多种中文字体间轮换，特粗字重 */
export function getFeedPlaceholderBodyClass(
  id: string,
  layout: 'masonry' | 'list' = 'masonry'
): string {
  const n = hashId(id) % 5;
  const families = [
    "[font-family:'PingFang_SC','Microsoft_YaHei','Noto_Sans_SC',ui-sans-serif,sans-serif]",
    "[font-family:'STKaiti','KaiTi','KaiTi_GB2312',serif]",
    "[font-family:'Songti_SC','Noto_Serif_SC','STSong',serif]",
    "[font-family:'STFangsong','FangSong','FZFangSong-Z02',serif]",
    "[font-family:'SimHei','Microsoft_YaHei_UI','Noto_Sans_SC',sans-serif]",
  ];
  const clamp = layout === 'masonry' ? 'line-clamp-6' : 'line-clamp-3';
  const size =
    layout === 'list'
      ? 'text-sm'
      : n === 1 || n === 3
        ? 'text-[13px]'
        : 'text-[12px]';
  const tracking = (n === 2 || n === 3) && layout === 'masonry' ? 'tracking-wide' : '';
  const weight = n === 4 ? 'font-black' : 'font-extrabold';
  return `relative z-[1] text-center ${weight} leading-relaxed text-slate-200 antialiased ${clamp} ${size} ${tracking} ${families[n]}`;
}

/** 信息流卡片标题（暗色科技风） */
export const feedCardTitleClass =
  "text-sm font-bold leading-snug tracking-tight text-slate-100 line-clamp-2 [font-family:system-ui,'PingFang_SC','Microsoft_YaHei_UI',sans-serif]";

/** 个人中心作品列表标题：按 id 在黑体/楷体/宋体系间轮换，加粗 */
export function getProfileWorkTitleClass(id: string): string {
  const n = hashId(id) % 3;
  const stacks = [
    "font-bold leading-snug text-gray-900 line-clamp-2 text-base [font-family:system-ui,'PingFang_SC','Microsoft_YaHei_UI',sans-serif]",
    "font-bold leading-snug text-gray-900 line-clamp-2 text-base [font-family:'STKaiti','KaiTi','KaiTi_GB2312',serif]",
    "font-bold leading-snug text-gray-900 line-clamp-2 text-base tracking-wide [font-family:'Songti_SC','Noto_Serif_SC','STSong',serif]",
  ];
  return stacks[n];
}

const PLACEHOLDER_SURFACE_STYLES = [
  'bg-[#0d1117] bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:16px_16px] ring-1 ring-white/[0.07]',
  'bg-gradient-to-br from-[#0d1117] via-[#0f1520] to-[#111827] ring-1 ring-white/[0.06]',
  'bg-[#0d1117] bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:24px_24px] ring-1 ring-white/[0.07]',
  'bg-gradient-to-br from-[#0f0d17] via-[#110d1a] to-[#0d1117] ring-1 ring-lobster/[0.12]',
  'bg-gradient-to-br from-[#070f17] via-[#0a1422] to-[#0d1117] ring-1 ring-cyber/[0.12]',
  'bg-[#0d1117] bg-[radial-gradient(ellipse_at_top_left,rgba(238,90,111,0.08),transparent_60%)] ring-1 ring-white/[0.07]',
  'bg-[#0d1117] bg-[radial-gradient(ellipse_at_bottom_right,rgba(34,211,238,0.06),transparent_60%)] ring-1 ring-white/[0.06]',
  'bg-gradient-to-b from-[#111827] to-[#0d1117] ring-1 ring-white/[0.07]',
  'bg-[#0d1117] bg-[radial-gradient(ellipse_at_center,rgba(238,90,111,0.05),transparent_70%)] ring-1 ring-lobster/[0.10]',
] as const;

/** 仅有视频无封面时：克制深色底，避免高饱和「系统渐变」 */
const VIDEO_PLACEHOLDER_STYLES = [
  'bg-gradient-to-br from-slate-800 via-slate-900 to-neutral-950',
  'bg-gradient-to-br from-zinc-800 via-neutral-900 to-stone-950',
  'bg-gradient-to-br from-slate-900 via-blue-950/80 to-neutral-950',
  'bg-gradient-to-br from-stone-800 via-neutral-900 to-zinc-950',
  'bg-gradient-to-br from-slate-700 via-slate-900 to-black',
] as const;

interface WorkCardProps {
  id: string;
  title: string;
  description?: string;
  resultSummary?: string;
  lobsterName: string;
  coverImage?: string;
  videoUrl?: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  messageCount: number;
  publishedAt?: Date;
  author: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  /** 首页信息流：封面为主、底部头像+赞，瀑布流布局由外层控制 */
  variant?: 'default' | 'xhs';
}

export function WorkCard({
  id,
  title,
  description,
  resultSummary,
  lobsterName,
  coverImage,
  videoUrl,
  viewCount,
  likeCount,
  messageCount,
  publishedAt,
  author,
  variant = 'default',
}: WorkCardProps) {
  const summary = resultSummary || description || `${lobsterName} 的作品 - ${title}`;
  const createdTime = publishedAt ? new Date(publishedAt).toLocaleDateString('zh-CN') : '';
  const styleIndex = hashId(id);
  const displayName = author.username === 'Unknown' ? '作者' : author.username;

  if (variant === 'xhs') {
    return (
      <Link
        href={`/works/${id}`}
        className="group flex w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-void-900 ring-1 ring-white/[0.08] break-inside-avoid transition-all duration-200 hover:ring-white/[0.16] hover:shadow-lg hover:shadow-black/40"
      >
        {coverImage ? (
          <div className="relative w-full overflow-hidden rounded-t-2xl bg-gray-100">
            <img
              src={coverImage}
              alt=""
              className="block h-auto w-full transition-transform duration-300 group-hover:scale-[1.02]"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        ) : (
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-2xl bg-gray-100">
            {videoUrl && (
              <div
                className={`absolute inset-0 flex items-center justify-center ${VIDEO_PLACEHOLDER_STYLES[styleIndex % VIDEO_PLACEHOLDER_STYLES.length]}`}
              >
                <span className="text-4xl text-white/90 drop-shadow">▶</span>
              </div>
            )}
            {!videoUrl && (
              <div
                className={`absolute inset-0 flex items-center justify-center p-4 ${getWorkCardGradient(id)}`}
              >
                <span
                  className="pointer-events-none absolute left-2.5 top-2 font-serif text-[2.5rem] leading-none text-white/[0.07]"
                  aria-hidden
                >
                  &ldquo;
                </span>
                <p className={getFeedPlaceholderBodyClass(id)}>{summary}</p>
              </div>
            )}
          </div>
        )}
        <div className="shrink-0 p-2.5">
          <h3
            className={`${feedCardTitleClass} group-hover:text-lobster transition-colors`}
          >
            {title}
          </h3>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {author.avatarUrl ? (
                <img src={author.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-slate-300">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="truncate text-xs font-medium text-slate-500 [font-family:system-ui,'PingFang_SC',sans-serif]">
                {displayName}
              </span>
            </div>
            <span className="shrink-0 text-xs text-slate-600 tabular-nums">
              ♥ {likeCount}
            </span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/works/${id}`}
      className="group bg-void-900 rounded-xl overflow-hidden ring-1 ring-white/[0.08] transition-all duration-300 hover:-translate-y-1 hover:ring-white/[0.16] hover:shadow-lg hover:shadow-black/50"
    >
      <div className="relative flex aspect-video items-center justify-center overflow-hidden p-6">
        {coverImage && (
          <>
            <img
              src={coverImage}
              alt={title}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 z-[1] bg-black/40" />
            <p className="relative z-10 text-center text-sm font-medium text-white line-clamp-3 drop-shadow-lg">{summary}</p>
          </>
        )}
        {!coverImage && videoUrl && (
          <div
            className={`absolute inset-0 z-[1] flex items-center justify-center ${VIDEO_PLACEHOLDER_STYLES[styleIndex % VIDEO_PLACEHOLDER_STYLES.length]}`}
          >
            <span className="text-5xl text-white/85 drop-shadow">🎬</span>
          </div>
        )}
        {!coverImage && !videoUrl && (
          <div className={`absolute inset-0 z-[1] flex items-center justify-center p-6 ${getWorkCardGradient(id)}`}>
            <span
              className="pointer-events-none absolute left-3 top-2 font-serif text-5xl leading-none text-white/[0.06]"
              aria-hidden
            >
              &ldquo;
            </span>
            <p className={getFeedPlaceholderBodyClass(id, 'list')}>{summary}</p>
          </div>
        )}

        {coverImage && (
          <div className="pointer-events-none absolute inset-0 z-[2] bg-black/0 transition group-hover:bg-black/10" />
        )}

        <div className="absolute bottom-2 right-2 z-20 flex items-center gap-2 text-xs font-semibold text-white">
          <span className="rounded bg-black/60 px-2 py-1 backdrop-blur-sm">👁️ {viewCount}</span>
          <span className="rounded bg-black/60 px-2 py-1 backdrop-blur-sm">💬 {messageCount}</span>
        </div>
      </div>

      <div className="p-4">
        <h3
          className={`text-base font-bold mb-2 line-clamp-2 text-slate-100 [font-family:system-ui,'PingFang_SC','Microsoft_YaHei_UI',sans-serif] group-hover:text-lobster transition-colors`}
        >
          {title}
        </h3>

        <p className="text-sm text-slate-500">
          {displayName}
          {createdTime ? ` · ${createdTime}` : ''}
        </p>
      </div>
    </Link>
  );
}
