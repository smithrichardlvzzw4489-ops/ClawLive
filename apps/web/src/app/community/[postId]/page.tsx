'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { format } from 'date-fns';

interface Post {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string[];
  likeCount: number;
  commentCount: number;
  viewCount: number;
  solved?: boolean;
  skillId?: string;
  createdAt: string;
  author: { id: string; username: string; avatarUrl?: string | null };
}

interface RelatedPost {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string[];
  likeCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: string;
  author: { id: string; username: string; avatarUrl?: string | null };
}

interface Comment {
  id: string;
  content: string;
  likeCount: number;
  createdAt: string;
  author: { id: string; username: string; avatarUrl?: string | null };
}

export default function PostDetailPage() {
  const { t } = useLocale();
  const params = useParams();
  const router = useRouter();
  const postId = params.postId as string;
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [relatedPosts, setRelatedPosts] = useState<RelatedPost[]>([]);
  const [reply, setReply] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (postId) loadPost();
  }, [postId]);

  useEffect(() => {
    if (!postId) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/community/posts/${postId}/related`)
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => setRelatedPosts(d.posts || []))
      .catch(() => setRelatedPosts([]));
  }, [postId]);

  const loadPost = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/community/posts/${postId}`);
      if (res.ok) {
        const data = await res.json();
        setPost(data);
        setComments(data.comments || []);
      } else {
        setPost(null);
      }
    } catch {
      setPost(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || submitting) return;

    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login?redirect=' + encodeURIComponent(`/community/${postId}`));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/community/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: reply.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setComments((prev) => [...prev, { ...data, createdAt: new Date().toISOString() }]);
        setReply('');
        if (post) setPost({ ...post, commentCount: post.commentCount + 1 });
      } else {
        alert(data.error || '回复失败');
      }
    } catch {
      alert('回复失败');
    } finally {
      setSubmitting(false);
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'question': return '❓';
      case 'discussion': return '💬';
      case 'experience': return '💡';
      case 'retrospective': return '📋';
      default: return '📌';
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="container max-w-3xl mx-auto px-6 py-12 flex justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster" />
        </div>
      </MainLayout>
    );
  }

  if (!post) {
    return (
      <MainLayout>
        <div className="container max-w-3xl mx-auto px-6 py-12 text-center">
          <p className="text-gray-500 mb-4">帖子不存在</p>
          <Link href="/community" className="text-lobster hover:underline">返回社区</Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <Link href="/community" className="text-gray-500 hover:text-lobster">← 返回社区</Link>
        </div>

        <article className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl">{typeIcon(post.type)}</span>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 mb-2">{post.title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <Link href={`/host/${post.author.id}`} className="hover:text-lobster">
                  {post.author.username}
                </Link>
                <span>·</span>
                <span>{format(new Date(post.createdAt), 'yyyy-MM-dd HH:mm')}</span>
                <span>·</span>
                <span>{post.viewCount} 浏览</span>
                {post.type === 'question' && post.solved && (
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs">{t('community.postSolved')}</span>
                )}
              </div>
            </div>
          </div>

          <div className="prose prose-gray max-w-none mb-4">
            <p className="whitespace-pre-wrap">{post.content}</p>
          </div>

          {post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {post.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 bg-gray-100 rounded text-sm">{tag}</span>
              ))}
            </div>
          )}

          {post.skillId && (
            <div className="mb-4">
              <Link
                href={`/market/${post.skillId}`}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-lobster/10 text-lobster font-medium hover:bg-lobster/20 transition-colors"
              >
                <span>📦</span>
                {t('community.viewRelatedSkill')}
              </Link>
            </div>
          )}

          <div className="flex gap-4 text-sm text-gray-500">
            <span>{post.likeCount} {t('community.likeCount')}</span>
            <span>{post.commentCount} {t('community.commentCount')}</span>
          </div>
        </article>

        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">回复 ({comments.length})</h2>

          <form onSubmit={handleReply} className="mb-6">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="写下你的回答或评论..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent mb-2"
            />
            <button
              type="submit"
              disabled={submitting || !reply.trim()}
              className="px-6 py-2 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark disabled:opacity-50"
            >
              {submitting ? '提交中...' : '发布回复'}
            </button>
          </form>

          <div className="space-y-4">
            {comments.map((c) => (
              <div key={c.id} className="py-4 border-b last:border-0">
                <div className="flex items-start gap-2">
                  {c.author.avatarUrl ? (
                    <img src={c.author.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-lobster/20 text-lobster flex items-center justify-center font-medium text-sm">
                      {c.author.username.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <Link href={`/host/${c.author.id}`} className="font-medium hover:text-lobster">
                        {c.author.username}
                      </Link>
                      <span className="text-gray-400">{format(new Date(c.createdAt), 'MM-dd HH:mm')}</span>
                    </div>
                    <p className="mt-1 text-gray-700 whitespace-pre-wrap">{c.content}</p>
                    <span className="text-xs text-gray-400">{c.likeCount} 点赞</span>
                  </div>
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-gray-500 text-center py-8">暂无回复，来抢沙发吧</p>
            )}
          </div>
        </section>

        {relatedPosts.length > 0 && (
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">
            <h2 className="font-semibold text-gray-900 mb-4">{t('community.relatedDiscussions')}</h2>
            <div className="space-y-3">
              {relatedPosts.map((p) => (
                <Link
                  key={p.id}
                  href={`/community/${p.id}`}
                  className="block p-3 rounded-lg border border-gray-100 hover:border-lobster/30 hover:bg-gray-50 transition-all"
                >
                  <span className="font-medium text-gray-900 line-clamp-1">{p.title}</span>
                  <span className="text-sm text-gray-500">
                    {p.author.username} · {format(new Date(p.createdAt), 'yyyy-MM-dd')}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </MainLayout>
  );
}
