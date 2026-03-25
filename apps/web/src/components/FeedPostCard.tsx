'use client';

import Link from 'next/link';
import { getWorkCardGradient } from '@/components/WorkCard';
import { excerptPlainText } from '@/lib/feed-post-markdown';
import { resolveMediaUrl } from '@/lib/api';

export interface FeedPostCardItem {
  id: string;
  title: string;
  content: string;
  imageUrls: string[];
  viewCount: number;
  commentCount: number;
  createdAt: string;
  author: { id: string; username: string; avatarUrl?: string | null };
}

export function FeedPostCard({
  post,
  variant = 'default',
}: {
  post: FeedPostCardItem;
  variant?: 'default' | 'xhs';
}) {
  const summary = excerptPlainText(post.content, 120) || post.title;
  const cover = post.imageUrls?.[0];
  const displayName = post.author.username === 'Unknown' ? '作者' : post.author.username;

  if (variant === 'xhs') {
    return (
      <Link
        href={`/posts/${post.id}`}
        className="group flex w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-white/95 shadow-sm ring-1 ring-gray-200/40 break-inside-avoid transition-shadow hover:shadow-md"
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-2xl bg-gray-100">
          {cover && (
            <img
              src={resolveMediaUrl(cover)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          )}
          {!cover && (
            <div
              className={`absolute inset-0 flex items-center justify-center p-4 ${getWorkCardGradient(post.id)}`}
            >
              <span
                className="pointer-events-none absolute left-2.5 top-2 font-serif text-[2.25rem] leading-none text-neutral-900/[0.07]"
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
        <div className="shrink-0 p-2.5">
          <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug group-hover:text-lobster transition-colors">
            {post.title}
          </h3>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {post.author.avatarUrl ? (
                <img
                  src={resolveMediaUrl(post.author.avatarUrl)}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="truncate text-xs text-gray-600">{displayName}</span>
            </div>
            <span className="shrink-0 text-xs text-gray-500 tabular-nums">💬 {post.commentCount}</span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/posts/${post.id}`}
      className="group overflow-hidden rounded-xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-2 hover:shadow-xl"
    >
      <div className="relative w-full overflow-hidden">
        {cover && (
          <>
            <img
              src={resolveMediaUrl(cover)}
              alt={post.title}
              className="block h-auto w-full transition-transform duration-300 group-hover:scale-[1.02]"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent px-3 pb-10 pt-12">
              <p className="text-center text-sm font-medium text-white line-clamp-3 drop-shadow-lg">{summary}</p>
            </div>
          </>
        )}
        {!cover && (
          <div className={`relative flex min-h-[10rem] items-center justify-center p-6 ${getWorkCardGradient(post.id)}`}>
            <span
              className="pointer-events-none absolute left-3 top-2 font-serif text-5xl leading-none text-neutral-900/[0.06]"
              aria-hidden
            >
              &ldquo;
            </span>
            <p className="relative z-[1] text-center text-sm font-medium leading-relaxed text-neutral-800 line-clamp-3 [font-family:ui-serif,Georgia,'Songti_SC','Noto_Serif_SC',serif]">
              {summary}
            </p>
          </div>
        )}
        <div className="absolute bottom-2 right-2 z-10 flex items-center gap-2 text-xs font-semibold text-white">
          <span className="rounded bg-black/60 px-2 py-1 backdrop-blur-sm">👁️ {post.viewCount}</span>
          <span className="rounded bg-black/60 px-2 py-1 backdrop-blur-sm">💬 {post.commentCount}</span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-base font-semibold mb-2 line-clamp-2 text-gray-900 group-hover:text-lobster transition-colors">
          {post.title}
        </h3>
        <p className="text-sm text-gray-600">
          {displayName}
          {post.createdAt ? `.${new Date(post.createdAt).toLocaleDateString('zh-CN')}` : ''}
        </p>
      </div>
    </Link>
  );
}
