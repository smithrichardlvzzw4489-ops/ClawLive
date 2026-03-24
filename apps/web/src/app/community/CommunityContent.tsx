'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from '@/lib/i18n/LocaleContext';

type PostType = 'question' | 'discussion' | 'experience' | 'retrospective';

interface Post {
  id: string;
  type: PostType;
  title: string;
  content: string;
  tags: string[];
  likeCount: number;
  commentCount: number;
  viewCount: number;
  solved?: boolean;
  createdAt: string;
  author: { id: string; username: string; avatarUrl?: string | null };
}

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  category: string;
  tags: string[];
  insight?: string;
  discussionCount: number;
  publishedAt: string;
}

interface SidebarData {
  hotTopics: { tag: string; count: number }[];
  latestQuestions: { id: string; title: string; commentCount: number; solved?: boolean }[];
  hotCreators: { id: string; username: string; avatarUrl?: string | null; postCount: number }[];
  recommendedSkills: { id: string; title: string; viewCount: number; useCount: number }[];
  creators: { id: string; username: string; avatarUrl?: string | null }[];
}

interface MyUpdate {
  id: string;
  title: string;
  type: string;
  commentCount: number;
  updatedAt: string;
}

export function CommunityContent() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tagParam = searchParams.get('tag');
  const [posts, setPosts] = useState<Post[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [sidebar, setSidebar] = useState<SidebarData | null>(null);
  const [postTab, setPostTab] = useState<PostType | 'all'>('all');
  const [postSort, setPostSort] = useState<'latest' | 'hot'>('latest');
  const [loading, setLoading] = useState(true);
  const [myUpdates, setMyUpdates] = useState<MyUpdate[]>([]);
  const [user, setUser] = useState<{ id: string } | null>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : null)
        .then((u) => u ? setUser(u) : setUser(null))
        .catch(() => setUser(null));
    }
  }, []);

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('token');
      if (token) {
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/community/my-updates`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.ok ? r.json() : { updates: [] })
          .then((d) => setMyUpdates(d.updates || []))
          .catch(() => setMyUpdates([]));
      }
    } else {
      setMyUpdates([]);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [postTab, postSort, tagParam]);

  const loadData = async () => {
    setLoading(true);
    try {
      const typeParam = postTab === 'all' ? '' : `&type=${postTab}`;
      const tagQuery = tagParam ? `&tag=${encodeURIComponent(tagParam)}` : '';
      const [postsRes, newsRes, sidebarRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/community/posts?sort=${postSort}${typeParam}${tagQuery}`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/community/news`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/community/sidebar`),
      ]);
      if (postsRes.ok) {
        const d = await postsRes.json();
        setPosts(d.posts || []);
      }
      if (newsRes.ok) {
        const d = await newsRes.json();
        setNews(d.news || []);
      }
      if (sidebarRes.ok) {
        const d = await sidebarRes.json();
        setSidebar(d);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const postTypeIcon = (type: PostType) => {
    switch (type) {
      case 'question': return '❓';
      case 'discussion': return '💬';
      case 'experience': return '💡';
      case 'retrospective': return '📋';
      default: return '📌';
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <section className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">{t('community.title')}</h1>
        <p className="text-gray-600">{t('community.subtitle')}</p>
      </section>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* 左侧主区 65% */}
        <div className="lg:w-[65%] flex flex-col gap-8">
          {/* 最新 AI 资讯 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-gray-900">{t('community.newsTitle')}</h2>
            </div>
            <div className="p-4 space-y-4">
              {news.length === 0 ? (
                <p className="text-gray-500 text-center py-8">{t('community.emptyNews')}</p>
              ) : (
                <>
                  {news.slice(0, 1).map((n) => (
                    <div key={n.id} className="p-4 bg-lobster/5 rounded-lg border border-lobster/20">
                      <h3 className="font-semibold text-gray-900 mb-1">{n.title}</h3>
                      <p className="text-sm text-gray-600 mb-2">{n.summary}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                        <span>{n.source}</span>
                        <span>·</span>
                        <span>{n.category}</span>
                        {n.insight && (
                          <>
                            <span>·</span>
                            <span className="text-lobster">{t('community.insightLabel')}: {n.insight}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {news.slice(1, 6).map((n) => (
                    <div key={n.id} className="py-3 border-b last:border-0">
                      <h4 className="font-medium text-gray-900 mb-0.5">{n.title}</h4>
                      <p className="text-sm text-gray-500 line-clamp-1">{n.summary}</p>
                      <div className="flex gap-2 text-xs text-gray-400 mt-1">
                        {n.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 bg-gray-100 rounded">{tag}</span>
                        ))}
                        <span>{n.discussionCount} 讨论</span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>

          {/* 交流区域 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-gray-900">{t('community.discussionTitle')}</h2>
              <div className="flex gap-2">
                <div className="flex gap-1">
                  <button
                    onClick={() => setPostSort('latest')}
                    className={`px-2 py-1 rounded text-xs ${postSort === 'latest' ? 'bg-gray-800 text-white' : 'bg-gray-100'}`}
                  >
                    {t('community.newsLatest')}
                  </button>
                  <button
                    onClick={() => setPostSort('hot')}
                    className={`px-2 py-1 rounded text-xs ${postSort === 'hot' ? 'bg-gray-800 text-white' : 'bg-gray-100'}`}
                  >
                    {t('community.newsHot')}
                  </button>
                </div>
                <div className="flex gap-1">
                {(['all', 'question', 'discussion', 'experience', 'retrospective'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setPostTab(tab)}
                    className={`px-3 py-1.5 rounded-lg text-sm ${
                      postTab === tab ? 'bg-lobster text-white' : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    {tab === 'all' ? t('community.tabAll') : t(`community.tab${tab === 'question' ? 'Question' : tab === 'discussion' ? 'Discussion' : tab === 'experience' ? 'Experience' : 'Retrospective'}`)}
                  </button>
                ))}
                </div>
              </div>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-lobster" />
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="mb-4">{t('community.emptyPosts')}</p>
                  <Link
                    href="/community/create"
                    className="inline-block px-6 py-2 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark"
                  >
                    {t('community.publishQuestion')}
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {posts.map((p) => (
                    <Link
                      key={p.id}
                      href={`/community/${p.id}`}
                      className="block p-4 rounded-lg border border-gray-100 hover:border-lobster/30 hover:bg-gray-50/50 transition-all"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{postTypeIcon(p.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium text-gray-900 line-clamp-1">{p.title}</h3>
                            {p.type === 'question' && (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${p.solved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {p.solved ? t('community.postSolved') : t('community.postUnsolved')}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 line-clamp-2 mt-0.5">{p.content}</p>
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
                            <Link href={`/host/${p.author.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-lobster">
                              {p.author.username}
                            </Link>
                            {p.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="px-1.5 py-0.5 bg-gray-100 rounded">{tag}</span>
                            ))}
                            <span>{p.commentCount} {t('community.commentCount')}</span>
                            <span>{p.likeCount} {t('community.likeCount')}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* 右侧辅助栏 35% */}
        <div className="lg:w-[35%] space-y-6">
          {sidebar && (
            <>
              <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h3 className="font-semibold text-gray-900 mb-3">{t('community.sideHotTopics')}</h3>
                <div className="flex flex-wrap gap-2">
                  {sidebar.hotTopics.map(({ tag }) => (
                    <Link key={tag} href={`/community?tag=${tag}`} className="px-2.5 py-1 bg-gray-100 hover:bg-lobster/15 rounded-full text-sm">
                      {tag}
                    </Link>
                  ))}
                  {sidebar.hotTopics.length === 0 && <p className="text-gray-500 text-sm">暂无话题</p>}
                </div>
              </section>

              <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h3 className="font-semibold text-gray-900 mb-3">{t('community.sideLatestQuestions')}</h3>
                <div className="space-y-2">
                  {sidebar.latestQuestions.map((q) => (
                    <Link key={q.id} href={`/community/${q.id}`} className="block text-sm hover:text-lobster">
                      <span className="line-clamp-2">{q.title}</span>
                      <span className="text-xs text-gray-400">{q.commentCount} 回答 · {q.solved ? '已解决' : '待回答'}</span>
                    </Link>
                  ))}
                  {sidebar.latestQuestions.length === 0 && <p className="text-gray-500 text-sm">暂无提问</p>}
                </div>
              </section>

              <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h3 className="font-semibold text-gray-900 mb-3">{t('community.sideHotCreators')}</h3>
                <div className="space-y-2">
                  {sidebar.hotCreators.map((c) => (
                    <Link key={c.id} href={`/host/${c.id}`} className="flex items-center gap-2 hover:bg-gray-50 p-1.5 rounded-lg -mx-1.5">
                      {c.avatarUrl ? (
                        <img src={c.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-lobster/20 text-lobster flex items-center justify-center font-medium text-sm">
                          {c.username.charAt(0)}
                        </div>
                      )}
                      <span className="flex-1 text-sm font-medium">{c.username}</span>
                      <span className="text-xs text-gray-400">{c.postCount} 篇</span>
                    </Link>
                  ))}
                  {sidebar.hotCreators.length === 0 && <p className="text-gray-500 text-sm">暂无创作者</p>}
                </div>
              </section>

              {myUpdates.length > 0 && (
                <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">我的更新</h3>
                  <div className="space-y-2">
                    {myUpdates.map((u) => (
                      <Link key={u.id} href={`/community/${u.id}`} className="block text-sm hover:text-lobster py-1">
                        <span className="line-clamp-1">{u.title}</span>
                        <span className="text-xs text-gray-400">{u.commentCount} 回复</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <h3 className="font-semibold text-gray-900 mb-3">{t('community.sideRecommendedSkills')}</h3>
                <div className="space-y-2">
                  {sidebar.recommendedSkills.slice(0, 5).map((s) => (
                    <Link key={s.id} href={`/market/${s.id}`} className="block text-sm hover:text-lobster py-1">
                      {s.title}
                    </Link>
                  ))}
                  {sidebar.recommendedSkills.length === 0 && <p className="text-gray-500 text-sm">暂无 Skill</p>}
                </div>
              </section>
            </>
          )}

          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">{t('community.sideQuickPublish')}</h3>
            <div className="space-y-2">
              <Link href="/community/create?type=question" className="block w-full px-4 py-2 bg-lobster text-white rounded-lg text-center text-sm font-medium hover:bg-lobster-dark">
                {t('community.publishQuestion')}
              </Link>
              <Link href="/community/create?type=discussion" className="block w-full px-4 py-2 border border-lobster text-lobster rounded-lg text-center text-sm font-medium hover:bg-lobster/5">
                {t('community.publishDiscussion')}
              </Link>
              <Link href="/community/create?type=experience" className="block w-full px-4 py-2 border border-gray-300 rounded-lg text-center text-sm font-medium hover:bg-gray-50">
                {t('community.publishExperience')}
              </Link>
              <Link href="/community/create?type=retrospective" className="block w-full px-4 py-2 border border-gray-300 rounded-lg text-center text-sm font-medium hover:bg-gray-50">
                {t('community.publishRetrospective')}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
