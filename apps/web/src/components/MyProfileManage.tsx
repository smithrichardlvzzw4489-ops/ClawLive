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

interface HostMetrics {
  followerCount: number;
  totalSessions: number;
  skillCount: number;
}

interface MySkillItem {
  id: string;
  title: string;
  description?: string;
  viewCount: number;
  useCount: number;
  sourceWorkId?: string;
}

export function MyProfileManage() {
  const router = useRouter();
  const { t } = useLocale();
  const [data, setData] = useState<MyWorksData | null>(null);
  const [feedPosts, setFeedPosts] = useState<MyFeedPost[]>([]);
  const [hostMetrics, setHostMetrics] = useState<HostMetrics | null>(null);
  const [mySkills, setMySkills] = useState<MySkillItem[]>([]);
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
      const uid = userData.id as string;

      const [worksRes, feedRes, hostRes, skillsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/works/user/${uid}?includeDrafts=true`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/api/feed-posts/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/api/rooms/host/${uid}`),
        fetch(`${API_BASE_URL}/api/skills?authorId=${encodeURIComponent(uid)}`),
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

      if (hostRes.ok) {
        const hd = await hostRes.json();
        const st = hd.stats ?? {};
        setHostMetrics({
          followerCount: typeof st.followerCount === 'number' ? st.followerCount : 0,
          totalSessions: typeof st.totalSessions === 'number' ? st.totalSessions : 0,
          skillCount: typeof st.skillCount === 'number' ? st.skillCount : 0,
        });
      } else {
        setHostMetrics({ followerCount: 0, totalSessions: 0, skillCount: 0 });
      }

      if (skillsRes.ok) {
        const sd = await skillsRes.json();
        const list = Array.isArray(sd.skills) ? sd.skills : [];
        setMySkills(
          list.map((s: MySkillItem & { sourceWorkId?: string }) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            viewCount: s.viewCount ?? 0,
            useCount: s.useCount ?? 0,
            sourceWorkId: s.sourceWorkId,
          })),
        );
      } else {
        setMySkills([]);
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
  const workTotal = draftWorks.length + publishedWorks.length;
  const metrics = hostMetrics ?? { followerCount: 0, totalSessions: 0, skillCount: 0 };

  return (
    <MainLayout>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* 顶部：身份 + 快捷操作 */}
        <header className="mb-8 flex flex-col gap-6 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {author?.avatarUrl ? (
              <img
                src={resolveMediaUrl(author.avatarUrl)}
                alt=""
                className="h-16 w-16 shrink-0 rounded-full border-2 border-white object-cover shadow-md ring-2 ring-lobster/20 sm:h-20 sm:w-20"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-lobster to-rose-600 text-2xl font-bold text-white shadow-md sm:h-20 sm:w-20">
                {author?.username.charAt(0).toUpperCase() ?? '?'}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t('myProfileCenter.pageTitle')}</h1>
              <p className="text-gray-600">{author?.username}</p>
              <p className="mt-1 max-w-md text-sm text-gray-500">{t('myProfileCenter.pageSubtitle')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {userId && (
              <Link
                href={`/host/${userId}`}
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
              >
                {t('myProfileCenter.openPublicProfile')}
              </Link>
            )}
            <Link
              href="/works/create"
              className="inline-flex items-center justify-center rounded-xl bg-lobster px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-lobster-dark"
            >
              + {t('myWorks.createNew')}
            </Link>
            <Link
              href="/posts/create"
              className="inline-flex items-center justify-center rounded-xl border border-lobster/30 bg-rose-50 px-4 py-2.5 text-sm font-medium text-lobster hover:bg-rose-100"
            >
              + {t('myProfileCenter.newFeedPost')}
            </Link>
          </div>
        </header>

        {/* 数据概览：粉丝 / 直播 / 能力流 / 作品 */}
        <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('myProfileCenter.statFollowers')}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{metrics.followerCount}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('myProfileCenter.statLiveSessions')}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{metrics.totalSessions}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('myProfileCenter.statSkills')}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{mySkills.length || metrics.skillCount}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('myProfileCenter.statWorks')}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{workTotal}</p>
            <p className="mt-0.5 text-[10px] text-gray-400">
              {t('myWorks.views')} {stats.totalViews} · {t('myWorks.likes')} {stats.totalLikes}
            </p>
          </div>
        </section>

        {/* 我的作品：正在创作 / 已发布 */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold text-gray-900">{t('myProfileCenter.sectionWorks')}</h2>

          <div className="space-y-8">
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-amber-950">
                  {t('myProfileCenter.sectionInProgress')}
                  <span className="ml-2 rounded-full bg-amber-200/80 px-2 py-0.5 text-xs font-medium text-amber-900">
                    {draftWorks.length}
                  </span>
                </h3>
              </div>
              {draftWorks.length === 0 ? (
                <p className="text-sm text-amber-900/70">{t('myProfileCenter.emptyInProgress')}</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {draftWorks.map((work) => (
                    <div
                      key={work.id}
                      className="rounded-xl border border-amber-100 bg-white p-4 shadow-sm"
                    >
                      <h4 className="font-semibold text-gray-900">{work.title}</h4>
                      <p className="mt-1 text-sm text-gray-500">🦞 {work.lobsterName}</p>
                      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                        <span>💬 {work.messageCount}</span>
                        <span>{new Date(work.updatedAt).toLocaleDateString('zh-CN')}</span>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <Link
                          href={`/works/${work.id}/studio`}
                          className="flex-1 rounded-lg bg-lobster py-2 text-center text-sm font-medium text-white hover:bg-lobster-dark"
                        >
                          {t('myWorks.continueEdit')}
                        </Link>
                        <button
                          type="button"
                          onClick={() => deleteWork(work.id)}
                          className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          {t('myWorks.delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/30 p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-emerald-950">
                  {t('myProfileCenter.sectionPublished')}
                  <span className="ml-2 rounded-full bg-emerald-200/80 px-2 py-0.5 text-xs font-medium text-emerald-900">
                    {publishedWorks.length}
                  </span>
                </h3>
              </div>
              {publishedWorks.length === 0 ? (
                <p className="text-sm text-emerald-900/70">{t('myProfileCenter.emptyPublished')}</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {publishedWorks.map((work) => (
                    <div
                      key={work.id}
                      className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition hover:shadow-md"
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
                              <span className="text-5xl opacity-50">🦞</span>
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <h4 className="line-clamp-2 font-semibold text-gray-900">{work.title}</h4>
                          <p className="mt-1 text-xs text-gray-500">
                            👁 {work.viewCount} · 💬 {work.messageCount}
                          </p>
                        </div>
                      </Link>
                      <div className="flex gap-2 border-t border-gray-50 px-2 py-2">
                        <Link
                          href={`/works/${work.id}/studio`}
                          className="flex-1 rounded-lg bg-gray-100 py-2 text-center text-xs font-medium text-gray-800 hover:bg-gray-200"
                        >
                          {t('myProfileCenter.editWork')}
                        </Link>
                        <button
                          type="button"
                          onClick={() => deleteWork(work.id)}
                          className="rounded-lg border border-red-200 px-2 py-2 text-xs text-red-600 hover:bg-red-50"
                        >
                          {t('myWorks.delete')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 能力流 */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold text-gray-900">{t('myProfileCenter.sectionSkills')}</h2>
          {mySkills.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-10 text-center text-sm text-gray-500">
              {t('myProfileCenter.emptySkills')}
            </div>
          ) : (
            <ul className="space-y-3">
              {mySkills.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{s.title}</p>
                    {s.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-gray-500">{s.description}</p>
                    )}
                    <p className="mt-2 text-xs text-gray-400">
                      👁 {s.viewCount} · 🔁 {s.useCount}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {s.sourceWorkId ? (
                      <Link
                        href={`/works/${s.sourceWorkId}`}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        {t('myProfileCenter.skillFromWork')}
                      </Link>
                    ) : (
                      <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600">
                        {t('myProfileCenter.skillStandalone')}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 图文动态 */}
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-bold text-gray-900">{t('myProfileCenter.feedSection')}</h2>
          {feedPosts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 py-10 text-center text-sm text-gray-500">
              {t('myProfileCenter.feedEmpty')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {feedPosts.map((post) => (
                <div
                  key={post.id}
                  className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
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
                  <div className="border-t border-gray-100 p-2">
                    <button
                      type="button"
                      onClick={() => deleteFeedPost(post.id)}
                      className="w-full rounded-lg border border-red-200 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      {t('myWorks.delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 全空引导 */}
        {draftWorks.length === 0 && publishedWorks.length === 0 && feedPosts.length === 0 && mySkills.length === 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
            <div className="mb-3 text-5xl">🦞</div>
            <h3 className="text-lg font-semibold text-gray-900">{t('myWorks.noWorks')}</h3>
            <p className="mt-2 text-gray-600">{t('myWorks.createPrompt')}</p>
            <Link
              href="/works/create"
              className="mt-6 inline-block rounded-xl bg-lobster px-6 py-3 font-semibold text-white hover:bg-lobster-dark"
            >
              {t('myWorks.createWork')}
            </Link>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
