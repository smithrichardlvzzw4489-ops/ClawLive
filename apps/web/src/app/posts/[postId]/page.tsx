'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';

function absUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = process.env.NEXT_PUBLIC_API_URL || '';
  return `${base}${path}`;
}

interface PostDetail {
  id: string;
  title: string;
  content: string;
  imageUrls: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  author: { id: string; username: string; avatarUrl?: string | null };
}

export default function FeedPostDetailPage() {
  const { t } = useLocale();
  const params = useParams();
  const postId = params.postId as string;
  const [post, setPost] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!postId) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/feed-posts/${postId}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setPost(data);
      })
      .finally(() => setLoading(false));
  }, [postId]);

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8 max-w-3xl">
        <Link href="/" className="text-lobster hover:underline text-sm mb-6 inline-block">
          ← {t('back')}
        </Link>
        {loading && (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-lobster" />
          </div>
        )}
        {notFound && <p className="text-gray-600">内容不存在</p>}
        {post && (
          <article className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h1 className="text-2xl font-bold text-gray-900">{post.title}</h1>
              <p className="text-sm text-gray-500 mt-2">
                {post.author.username} · {new Date(post.createdAt).toLocaleString('zh-CN')} · 👁️ {post.viewCount}
              </p>
            </div>
            {post.imageUrls?.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 bg-gray-50">
                {post.imageUrls.map((u, i) => (
                  <img key={i} src={absUrl(u)} alt="" className="w-full rounded-lg object-cover max-h-96" />
                ))}
              </div>
            )}
            <div className="p-6 whitespace-pre-wrap text-gray-800 leading-relaxed">{post.content}</div>
          </article>
        )}
      </div>
    </MainLayout>
  );
}
