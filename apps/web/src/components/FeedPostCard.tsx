'use client';

import Link from 'next/link';
import { getWorkCardGradient } from '@/components/WorkCard';

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

function absUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = process.env.NEXT_PUBLIC_API_URL || '';
  return `${base}${path}`;
}

export function FeedPostCard({ post }: { post: FeedPostCardItem }) {
  const summary =
    post.content.replace(/\s+/g, ' ').trim().slice(0, 120) ||
    post.title;
  const createdTime = post.createdAt
    ? new Date(post.createdAt).toLocaleDateString('zh-CN')
    : '';
  const cover = post.imageUrls?.[0];

  return (
    <Link
      href={`/posts/${post.id}`}
      className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2"
    >
      <div className="relative aspect-video overflow-hidden flex items-center justify-center p-6">
        {cover && (
          <img
            src={absUrl(cover)}
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
        <p className="relative z-10 text-white text-sm font-medium text-center line-clamp-3 drop-shadow-lg px-2">
          {summary}
        </p>
        <div className="absolute bottom-2 right-2 flex items-center gap-2 text-white text-xs font-semibold z-10">
          <span className="px-2 py-1 bg-black/60 rounded backdrop-blur-sm">
            👁️ {post.viewCount}
          </span>
          <span className="px-2 py-1 bg-black/60 rounded backdrop-blur-sm">
            💬 {post.commentCount}
          </span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-base font-semibold mb-2 line-clamp-2 text-gray-900 group-hover:text-lobster transition-colors">
          {post.title}
        </h3>
        <p className="text-sm text-gray-600">
          {post.author.username === 'Unknown' ? '作者' : post.author.username}
          {createdTime ? `.${createdTime}` : ''}
        </p>
      </div>
    </Link>
  );
}
