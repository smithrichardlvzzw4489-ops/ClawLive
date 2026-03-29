'use client';

import Link from 'next/link';
import { feedCardTitleClass, getFeedPlaceholderBodyClass, getWorkCardGradient } from '@/components/WorkCard';
import { excerptPlainText } from '@/lib/feed-post-markdown';
import { resolveMediaUrl } from '@/lib/api';

export interface FeedPostCardItem {
  id: string;
  kind?: 'article' | 'imageText';
  title: string;
  content: string;
  excerpt?: string;
  imageUrls: string[];
  viewCount: number;
  commentCount: number;
  createdAt: string;
  publishedByAgent?: boolean;
  author: { id: string; username: string; avatarUrl?: string | null };
}

export function FeedPostCard({
  post,
  variant = 'default',
}: {
  post: FeedPostCardItem;
  variant?: 'default' | 'xhs';
}) {
  const summary = post.excerpt || excerptPlainText(post.content, 120) || post.title;
  const cover = post.imageUrls?.[0];
  const displayName = post.author.username === 'Unknown' ? '作者' : post.author.username;

  if (variant === 'xhs') {
    return (
      <Link
        href={`/posts/${post.id}`}
        className="group flex w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-void-900 ring-1 ring-white/[0.08] break-inside-avoid transition-all duration-200 hover:ring-white/[0.16] hover:shadow-lg hover:shadow-black/40"
      >
        {cover ? (
          <div className="relative w-full overflow-hidden rounded-t-2xl bg-gray-100">
            <img
              src={resolveMediaUrl(cover)}
              alt=""
              className="block h-auto w-full transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </div>
        ) : (
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-2xl bg-gray-100">
            <div
              className={`absolute inset-0 flex items-center justify-center p-4 ${getWorkCardGradient(post.id)}`}
            >
              <span
                className="pointer-events-none absolute left-2.5 top-2 font-serif text-[2.25rem] leading-none text-neutral-900/[0.07]"
                aria-hidden
              >
                &ldquo;
              </span>
              <p className={getFeedPlaceholderBodyClass(post.id)}>{summary}</p>
            </div>
          </div>
        )}
        <div className="shrink-0 p-2.5">
          <h3 className={`${feedCardTitleClass} group-hover:text-lobster transition-colors`}>{post.title}</h3>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {post.author.avatarUrl ? (
                <img
                  src={resolveMediaUrl(post.author.avatarUrl)}
                  alt=""
                  className="h-6 w-6 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-slate-300">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="truncate text-xs font-medium text-slate-500 [font-family:system-ui,'PingFang_SC',sans-serif]">
                {displayName}
              </span>
              {post.publishedByAgent && (
                <span className="shrink-0 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-400 ring-1 ring-violet-500/25">
                  🤖 Agent
                </span>
              )}
            </div>
            <span className="shrink-0 text-xs text-slate-600 tabular-nums">💬 {post.commentCount}</span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/posts/${post.id}`}
      className="group overflow-hidden rounded-xl bg-void-900 ring-1 ring-white/[0.08] transition-all duration-300 hover:-translate-y-1 hover:ring-white/[0.16] hover:shadow-lg hover:shadow-black/50"
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
            <p className={getFeedPlaceholderBodyClass(post.id, 'list')}>{summary}</p>
          </div>
        )}
        <div className="absolute bottom-2 right-2 z-10 flex items-center gap-2 text-xs font-semibold text-white">
          <span className="rounded bg-black/60 px-2 py-1 backdrop-blur-sm">👁️ {post.viewCount}</span>
          <span className="rounded bg-black/60 px-2 py-1 backdrop-blur-sm">💬 {post.commentCount}</span>
        </div>
      </div>
      <div className="p-4">
        <h3
          className={`text-base font-bold mb-2 line-clamp-2 text-gray-900 [font-family:system-ui,'PingFang_SC','Microsoft_YaHei_UI',sans-serif] group-hover:text-lobster transition-colors`}
        >
          {post.title}
        </h3>
        <div className="flex items-center gap-2">
          <p className="text-sm text-slate-500">
            {displayName}
            {post.createdAt ? ` · ${new Date(post.createdAt).toLocaleDateString('zh-CN')}` : ''}
          </p>
          {post.publishedByAgent && (
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-400 ring-1 ring-violet-500/25">
              🤖 Agent
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
