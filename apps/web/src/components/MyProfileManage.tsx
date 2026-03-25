'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { getWorkCardGradient } from '@/components/WorkCard';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { API_BASE_URL, resolveMediaUrl } from '@/lib/api';

interface Work {
  id: string;
  title: string;
  description?: string;
  lobsterName: string;
  status: 'draft' | 'published';
  coverImage?: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  messageCount: number;
  createdAt: Date;
  publishedAt?: Date;
  updatedAt: Date;
}

interface MyWorksData {
  author: {
    id: string;
    username: string;
    bio?: string;
    avatarUrl?: string;
  } | null;
  works: Work[];
  stats: {
    totalWorks: number;
    totalViews: number;
    totalLikes: number;
  };
}

interface MyFeedPost {
  id: string;
  title: string;
  content: string;
  imageUrls: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  createdAt: string;
}

export function MyProfileManage() {
  const router = useRouter();
  const { t } = useLocale();
  const [data, setData] = useState<MyWorksData | null>(null);
  const [feedPosts, setFeedPosts] = useState<MyFeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login?redirect=/my-profile');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const userResponse = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!userResponse.ok) {
        router.replace('/login?redirect=/my-profile');
        return;
      }
      const userData = await userResponse.json();

      const [worksRes, feedRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/works/user/${userData.id}?includeDrafts=true`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/api/feed-posts/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!worksRes.ok) throw new Error('works');
      const worksData = (await worksRes.json()) as MyWorksData;
      setData(worksData);

      if (feedRes.ok) {
        const fd = await feedRes.json();
        setFeedPosts(Array.isArray(fd.posts) ? fd.posts : []);
      } else {
        setFeedPosts([]);
      }
    } catch {
      setError(t('workDetail.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [router, t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const deleteWork = async (workId: string) => {
    if (!confirm(t('myWorks.confirmDelete'))) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/works/${workId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) void loadAll();
      else alert(t('myWorks.deleteFailed'));
    } catch {
      alert(t('myWorks.deleteFailed'));
    }
  };

  const deleteFeedPost = async (postId: string) => {
    if (!confirm(t('myProfileCenter.deleteFeedConfirm'))) return;
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/feed-posts/${postId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) void loadAll();
      else alert(t('myProfileCenter.deleteFeedFailed'));
    } catch {
      alert(t('myProfileCenter.deleteFeedFailed'));
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-lobster" />
            <p className="text-gray-600">{t('loading')}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !data) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <p className="text-red-600">{error || t('workDetail.loadFailed')}</p>
        </div>
      </MainLayout>
    );
  }

  const { author, works, stats } = data;
  const userId = author?.id;
  const draftWorks = works.filter((w) => w.status === 'draft');
  const publishedWorks = works.filter((w) => w.status === 'published');

  return (
    <MainLayout>
      <div className="container mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              {author?.avatarUrl ? (
                <img
                  src={resolveMediaUrl(author.avatarUrl)}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-full border-4 border-lobster/20 object-cover sm:h-24 sm:w-24"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-lobster text-2xl font-bold text-white sm:h-24 sm:w-24">
                  {author?.username.charAt(0).toUpperCase() ?? '?'}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t('myProfileCenter.pageTitle')}</h1>
                <p className="mt-1 text-gray-600">{author?.username}</p>
                <p className="mt-3 max-w-xl text-sm text-gray-500">{t('myProfileCenter.pageSubtitle')}</p>
                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <span>
                    <span className="font-semibold text-gray-900">{stats.totalWorks}</span>{' '}
                    <span className="text-gray-600">{t('myWorks.works')}</span>
                  </span>
                  <span>
                    <span className="font-semibold text-gray-900">{stats.totalViews}</span>{' '}
                    <span className="text-gray-600">{t('myWorks.views')}</span>
                  </span>
                  <span>
                    <span className="font-semibold text-gray-900">{stats.totalLikes}</span>{' '}
                    <span className="text-gray-600">{t('myWorks.likes')}</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-col">
              {userId && (
                <Link
                  href={`/host/${userId}`}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50"
                >
                  {t('myProfileCenter.openPublicProfile')} →
                </Link>
              )}
              <Link
                href="/works/create"
                className="inline-flex items-center justify-center rounded-xl bg-lobster px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-lobster-dark"
              >
                + {t('myWorks.createNew')}
              </Link>
              <Link
                href="/posts/create"
                className="inline-flex items-center justify-center rounded-xl border border-lobster/40 bg-rose-50 px-5 py-2.5 text-sm font-medium text-lobster transition hover:bg-rose-100"
              >
                + {t('myProfileCenter.newFeedPost')}
              </Link>
            </div>
          </div>
        </div>

        {/* 图文动态 */}
        <section className="mb-12">
          <h2 className="mb-4 text-xl font-bold text-gray-900">{t('myProfileCenter.feedSection')}</h2>
          {feedPosts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 py-10 text-center text-gray-500">
              {t('myProfileCenter.feedEmpty')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {feedPosts.map((post) => (
                <div
                  key={post.id}
                  className="relative overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
                >
                  <Link href={`/posts/${post.id}`} className="block">
                    <div className="aspect-video bg-gray-100">
                      {post.imageUrls?.[0] ? (
                        <img
                          src={resolveMediaUrl(post.imageUrls[0])}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className={`flex h-full w-full items-center justify-center ${getWorkCardGradient(post.id)}`}>
                          <span className="text-4xl opacity-40">📄</span>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="line-clamp-2 font-semibold text-gray-900">{post.title}</h3>
                      <p className="mt-1 text-xs text-gray-400">
                        {new Date(post.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </Link>
                  <div className="flex gap-2 border-t border-gray-100 p-2">
                    <button
                      type="button"
                      onClick={() => deleteFeedPost(post.id)}
                      className="flex-1 rounded-lg border border-red-200 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      {t('myWorks.delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 草稿 */}
        {draftWorks.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-6 text-2xl font-bold text-gray-900">📝 {t('myWorks.drafts')}</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {draftWorks.map((work) => (
                <div key={work.id} className="rounded-lg bg-white p-6 shadow transition-shadow hover:shadow-lg">
                  <div className="mb-3 flex items-start justify-between">
                    <h3 className="flex-1 text-xl font-semibold text-gray-900">{work.title}</h3>
                    <span className="rounded bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-700">
                      {t('myWorks.drafts')}
                    </span>
                  </div>
                  <p className="mb-3 text-gray-600">🦞 {work.lobsterName}</p>
                  {work.description && (
                    <p className="mb-3 line-clamp-2 text-sm text-gray-500">{work.description}</p>
                  )}
                  <div className="mb-4 flex items-center justify-between text-sm text-gray-500">
                    <span>💬 {work.messageCount}</span>
                    <span>{new Date(work.updatedAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/works/${work.id}/studio`}
                      className="flex-1 rounded-lg bg-lobster py-2 text-center text-white transition hover:bg-lobster-dark"
                    >
                      {t('myWorks.continueEdit')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => deleteWork(work.id)}
                      className="rounded-lg border border-red-300 px-4 py-2 text-red-600 transition hover:bg-red-50"
                    >
                      {t('myWorks.delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {draftWorks.length === 0 && publishedWorks.length === 0 && feedPosts.length === 0 && (
          <section className="mb-12">
            <div className="rounded-lg bg-white p-12 text-center shadow">
              <div className="mb-4 text-6xl">📚</div>
              <h3 className="mb-2 text-xl font-semibold text-gray-900">{t('myWorks.noWorks')}</h3>
              <p className="mb-6 text-gray-600">{t('myWorks.createPrompt')}</p>
              <Link
                href="/works/create"
                className="inline-block rounded-lg bg-lobster px-6 py-3 font-semibold text-white hover:bg-lobster-dark"
              >
                {t('myWorks.createWork')}
              </Link>
            </div>
          </section>
        )}

        {/* 已发布作品 */}
        {publishedWorks.length > 0 && (
          <section>
            <h2 className="mb-6 text-2xl font-bold text-gray-900">✅ {t('myWorks.published')}</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {publishedWorks.map((work) => (
                <div
                  key={work.id}
                  className="relative overflow-hidden rounded-xl bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <Link href={`/works/${work.id}`} className="block">
                    <div className={`relative aspect-video ${getWorkCardGradient(work.id)}`}>
                      {work.coverImage ? (
                        <img
                          src={resolveMediaUrl(work.coverImage)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <span className="text-6xl opacity-50">🦞</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="mb-2 line-clamp-2 text-base font-semibold text-gray-900">{work.title}</h3>
                      <p className="mb-3 text-sm text-gray-600">🦞 {work.lobsterName}</p>
                      <div className="flex items-center justify-between border-t pt-3 text-xs text-gray-500">
                        <div className="flex gap-2">
                          <span>👁️ {work.viewCount}</span>
                          <span>💬 {work.messageCount}</span>
                        </div>
                        {work.publishedAt && (
                          <span>{new Date(work.publishedAt).toLocaleDateString('zh-CN')}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <div className="flex gap-2 border-t border-gray-100 px-2 py-2">
                    <Link
                      href={`/works/${work.id}/studio`}
                      className="flex-1 rounded-lg bg-gray-100 py-2 text-center text-xs font-medium text-gray-800 hover:bg-gray-200"
                    >
                      {t('myProfileCenter.editWork')}
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        deleteWork(work.id);
                      }}
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      {t('myWorks.delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </MainLayout>
  );
}
