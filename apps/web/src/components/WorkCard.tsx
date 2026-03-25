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

const PLACEHOLDER_SURFACE_STYLES = [
  'bg-white bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:12px_12px] ring-1 ring-gray-200/90',
  'bg-gradient-to-br from-stone-50 via-orange-50/40 to-amber-50/30 ring-1 ring-stone-200/50',
  'bg-[#f4f5f7] ring-1 ring-gray-200/70',
  'bg-gradient-to-b from-amber-50/60 to-[#fffbeb] ring-1 ring-amber-100/70',
  'bg-gradient-to-b from-slate-50 via-blue-50/25 to-slate-100/90 ring-1 ring-slate-200/60',
  'bg-gradient-to-br from-emerald-50/90 via-white to-lime-50/35 ring-1 ring-emerald-100/45',
  'bg-[#fafafa] ring-1 ring-gray-200/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.85)]',
  'bg-white bg-[linear-gradient(#f3f4f6_1px,transparent_1px),linear-gradient(90deg,#f3f4f6_1px,transparent_1px)] bg-[length:18px_18px] ring-1 ring-gray-200/80',
  'bg-gradient-to-br from-rose-50/80 via-white to-violet-50/45 ring-1 ring-rose-100/40',
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
        className="group flex w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-white/95 shadow-sm ring-1 ring-gray-200/40 break-inside-avoid transition-shadow hover:shadow-md"
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
                  className="pointer-events-none absolute left-2.5 top-2 font-serif text-[2.5rem] leading-none text-neutral-900/[0.07]"
                  aria-hidden
                >
                  &ldquo;
                </span>
                <p className="relative z-[1] text-center text-[11px] font-medium leading-relaxed text-neutral-800 line-clamp-6 [font-family:ui-serif,Georgia,'Songti_SC','Noto_Serif_SC',serif]">
                  {summary}
                </p>
              </div>
            )}
          </div>
        )}
        <div className="shrink-0 p-2.5">
          <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug group-hover:text-lobster transition-colors">
            {title}
          </h3>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {author.avatarUrl ? (
                <img src={author.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="truncate text-xs text-gray-600">{displayName}</span>
            </div>
            <span className="shrink-0 text-xs text-gray-500 tabular-nums">
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
      className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2"
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
              className="pointer-events-none absolute left-3 top-2 font-serif text-5xl leading-none text-neutral-900/[0.06]"
              aria-hidden
            >
              &ldquo;
            </span>
            <p className="relative z-[2] text-center text-sm font-medium leading-relaxed text-neutral-800 line-clamp-3 [font-family:ui-serif,Georgia,'Songti_SC','Noto_Serif_SC',serif]">
              {summary}
            </p>
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
        <h3 className="text-base font-semibold mb-2 line-clamp-2 text-gray-900 group-hover:text-lobster transition-colors">
          {title}
        </h3>

        <p className="text-sm text-gray-600">
          {displayName}
          {createdTime ? `.${createdTime}` : ''}
        </p>
      </div>
    </Link>
  );
}
