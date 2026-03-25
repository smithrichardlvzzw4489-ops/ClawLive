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
        className="group flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-white/95 shadow-sm ring-1 ring-gray-200/40 break-inside-avoid transition-shadow hover:shadow-md lg:h-full lg:min-h-0"
      >
        <div className="relative aspect-[3/4] overflow-hidden bg-gray-100 lg:aspect-auto lg:min-h-0 lg:flex-1">
          {cover && (
            <img
              src={resolveMediaUrl(cover)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
          )}
          {!cover && (
            <div className={`absolute inset-0 bg-gradient-to-br ${getWorkCardGradient(post.id)} flex items-center justify-center p-4`}>
              <p className="text-white text-xs font-medium text-center line-clamp-6">{summary}</p>
            </div>
          )}
          <div className="absolute bottom-2 right-2 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] text-white font-medium backdrop-blur-sm">
            👁 {post.viewCount}
          </div>
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
      className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2"
    >
      <div className="relative aspect-video overflow-hidden flex items-center justify-center p-6">
        {cover && (
          <img
            src={resolveMediaUrl(cover)}
            alt={post.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}
        {!cover && (
          <div className={`absolute inset-0 bg-gradient-to-br ${getWorkCardGradient(post.id)}`}>
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_70%_80%,_white_0%,_transparent_60%)]" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40" />
        <p className="relative z-10 text-white text-sm font-medium text-center line-clamp-3 drop-shadow-lg px-2">{summary}</p>
        <div className="absolute bottom-2 right-2 flex items-center gap-2 text-white text-xs font-semibold z-10">
          <span className="px-2 py-1 bg-black/60 rounded backdrop-blur-sm">👁️ {post.viewCount}</span>
          <span className="px-2 py-1 bg-black/60 rounded backdrop-blur-sm">💬 {post.commentCount}</span>
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
