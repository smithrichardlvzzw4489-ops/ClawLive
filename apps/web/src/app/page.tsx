'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { WorkCard } from '@/components/WorkCard';
import { RoomCard } from '@/components/RoomCard';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { WORK_PARTITIONS } from '@/lib/work-partitions';

interface Work {
  id: string;
  title: string;
  description?: string;
  resultSummary?: string;
  partition?: string;
  lobsterName: string;
  coverImage?: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  messageCount: number;
  publishedAt: Date;
  author: { id: string; username: string; avatarUrl?: string };
}

interface LiveRoom {
  id: string;
  title: string;
  lobsterName: string;
  description?: string;
  viewerCount: number;
  isLive: boolean;
  startedAt?: Date;
  host: { id: string; username: string; avatarUrl?: string | null };
}

interface Skill {
  id: string;
  title: string;
  description?: string;
  partition: string;
  sourceType: string;
  tags: string[];
  viewCount: number;
  useCount: number;
  author: { id: string; username: string; avatarUrl?: string | null };
}

interface Post {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string[];
  likeCount: number;
  commentCount: number;
  solved?: boolean;
  createdAt: string;
  author: { id: string; username: string; avatarUrl?: string | null };
}

interface Creator {
  id: string;
  username: string;
  avatarUrl?: string | null;
  postCount: number;
  workCount?: number;
  skillCount?: number;
  followerCount?: number;
}

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  category: string;
  tags: string[];
  publishedAt: string;
}

export default function HomePage() {
  const { t } = useLocale();
  const [recommendedWorks, setRecommendedWorks] = useState<Work[]>([]);
  const [liveRooms, setLiveRooms] = useState<LiveRoom[]>([]);
  const [recommendedSkills, setRecommendedSkills] = useState<Skill[]>([]);
  const [latestQuestions, setLatestQuestions] = useState<Post[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [hotCreators, setHotCreators] = useState<Creator[]>([]);
  const [hotDiscussions, setHotDiscussions] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePartition, setActivePartition] = useState<string | null>(null);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/recommendations/home`, { headers });
      if (res.ok) {
        const data = await res.json();
        setRecommendedWorks(data.recommendedWorks || []);
        setLiveRooms(data.liveRooms || []);
        setRecommendedSkills(data.recommendedSkills || []);
        setLatestQuestions(data.latestQuestions || []);
        setNews(data.news || []);
        setHotCreators(data.hotCreators || []);
        setHotDiscussions(data.hotDiscussions || []);
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredWorks =
    activePartition === null
      ? recommendedWorks
      : recommendedWorks.filter((w) => w.partition === activePartition);

  const SectionCard = ({
    href,
    icon,
    title,
    desc,
  }: {
    href: string;
    icon: string;
    title: string;
    desc?: string;
  }) => (
    <Link
      href={href}
      className="block p-6 bg-white rounded-xl border border-gray-100 hover:border-lobster/30 hover:shadow-md transition-all"
    >
      <span className="text-3xl block mb-3">{icon}</span>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {desc && <p className="text-sm text-gray-500 mt-1">{desc}</p>}
    </Link>
  );

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        {/* 首屏价值主张 */}
        <section className="mb-12 text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 max-w-3xl mx-auto">
            {t('home.heroTitle')}
          </h1>
          <p className="text-gray-600 text-base md:text-lg mb-8 max-w-2xl mx-auto">
            {t('home.heroSubtitle')}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/market"
              className="px-6 py-3 bg-lobster text-white rounded-xl font-semibold hover:bg-lobster-dark transition-colors"
            >
              {t('home.btnSkillsFlow')}
            </Link>
            <Link
              href="/community"
              className="px-6 py-3 bg-white border-2 border-lobster text-lobster rounded-xl font-semibold hover:bg-lobster/5 transition-colors"
            >
              {t('home.btnCommunity')}
            </Link>
            <Link
              href="/works/create"
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              {t('home.btnCreator')}
            </Link>
          </div>
        </section>

        {/* 四宫格入口 */}
        <section className="mb-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          <SectionCard href="/market" icon="📦" title={t('home.fourGridSkills')} />
          <SectionCard href="/community?type=question" icon="❓" title={t('home.fourGridQuestions')} />
          <SectionCard href="/creators" icon="👤" title={t('home.fourGridCreators')} />
          <SectionCard href="/rooms" icon="📺" title={t('home.fourGridLive')} />
        </section>

        {/* 频道说明 */}
        <p className="text-gray-500 text-center mb-10">{t('home.channelDesc')}</p>

        {/* 热门能力流 */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <span className="w-1 h-6 bg-lobster rounded-full"></span>
              {t('home.skillsSection')}
            </h2>
            <Link href="/market" className="text-lobster hover:underline text-sm">
              {t('more')} →
            </Link>
          </div>
          <p className="text-sm text-gray-500 mb-4">{t('home.skillsDesc')}</p>
          {recommendedSkills.length === 0 ? (
            <p className="text-gray-400 py-8 text-center">{t('home.noSkills')}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommendedSkills.slice(0, 6).map((skill) => (
                <Link
                  key={skill.id}
                  href={`/market/${skill.id}`}
                  className="block p-4 bg-white rounded-xl border border-gray-100 hover:border-lobster/30 transition-all"
                >
                  <h3 className="font-semibold text-gray-900 line-clamp-2">{skill.title}</h3>
                  {skill.description && <p className="text-sm text-gray-500 line-clamp-2 mt-1">{skill.description}</p>}
                  <p className="text-xs text-gray-400 mt-2">{skill.author.username} · {skill.viewCount} 浏览</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 最新 AI 资讯 */}
        {news.length > 0 && (
          <section className="mb-16">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
              {t('home.newsSection')}
            </h2>
            <div className="space-y-3">
              {news.slice(0, 5).map((n) => (
                <Link
                  key={n.id}
                  href="/community"
                  className="block p-4 bg-white rounded-xl border border-gray-100 hover:border-lobster/30 transition-all"
                >
                  <h3 className="font-medium text-gray-900">{n.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">{n.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 最新问题 */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <span className="w-1 h-6 bg-amber-500 rounded-full"></span>
              {t('home.questionsSection')}
            </h2>
            <Link href="/community?type=question" className="text-lobster hover:underline text-sm">
              {t('more')} →
            </Link>
          </div>
          <p className="text-sm text-gray-500 mb-4">{t('home.questionsDesc')}</p>
          {latestQuestions.length === 0 ? (
            <p className="text-gray-400 py-8 text-center">{t('home.noQuestions')}</p>
          ) : (
            <div className="space-y-3">
              {latestQuestions.map((p) => (
                <Link
                  key={p.id}
                  href={`/community/${p.id}`}
                  className="block p-4 bg-white rounded-xl border border-gray-100 hover:border-lobster/30 transition-all"
                >
                  <h3 className="font-medium text-gray-900 line-clamp-1">{p.title}</h3>
                  <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                    <span>{p.author.username}</span>
                    <span>{p.commentCount} 回答</span>
                    {p.solved && <span className="text-green-600">已解决</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 分区栏 + 推荐作品 */}
        <section className="mb-10">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActivePartition(null)}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${activePartition === null ? 'bg-lobster text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                {t('works.partitionAll')}
              </button>
              {WORK_PARTITIONS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActivePartition(p.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${activePartition === p.id ? 'bg-lobster text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  {t(`partitions.${p.nameKey}`)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <span className="w-1 h-6 bg-lobster rounded-full"></span>
              {t('home.worksSection')}
            </h2>
            <Link href="/works" className="text-lobster hover:underline text-sm">
              {t('more')} →
            </Link>
          </div>
          <p className="text-sm text-gray-500 mb-4">{t('home.worksDesc')}</p>
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-lobster" />
            </div>
          ) : filteredWorks.length === 0 ? (
            <div className="text-center py-16 bg-white/80 rounded-2xl border-2 border-dashed border-gray-200">
              <p className="text-gray-600 mb-4">{activePartition ? t('home.noWorksInPartition') : t('home.noWorks')}</p>
              {!activePartition && (
                <Link href="/works/create" className="inline-block px-6 py-3 bg-lobster text-white rounded-xl font-medium">
                  {t('works.createFirst')}
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredWorks.map((work) => (
                <WorkCard key={work.id} {...work} />
              ))}
            </div>
          )}
        </section>

        {/* 热门创作者 */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <span className="w-1 h-6 bg-emerald-500 rounded-full"></span>
              {t('home.creatorsSection')}
            </h2>
            <Link href="/creators" className="text-lobster hover:underline text-sm">
              {t('more')} →
            </Link>
          </div>
          <p className="text-sm text-gray-500 mb-4">{t('home.creatorsDesc')}</p>
          {hotCreators.length === 0 ? (
            <p className="text-gray-400 py-8 text-center">{t('home.noCreators')}</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {hotCreators.slice(0, 8).map((c) => (
                <Link
                  key={c.id}
                  href={`/host/${c.id}`}
                  className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-lobster/30 transition-all"
                >
                  {c.avatarUrl ? (
                    <img src={c.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-lobster/20 text-lobster flex items-center justify-center font-bold">
                      {c.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{c.username}</p>
                    <p className="text-xs text-gray-500">{c.postCount} 帖 · {(c.workCount || 0) + (c.skillCount || 0)} 能力</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 正在直播 */}
        {liveRooms.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="w-1 h-6 bg-red-500 rounded-full"></span>
                {t('home.liveSection')}
              </h2>
              <Link href="/rooms" className="text-lobster hover:underline text-sm">
                {t('more')} →
              </Link>
            </div>
            <p className="text-sm text-gray-500 mb-4">{t('home.liveDesc')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {liveRooms.map((room) => (
                <RoomCard key={room.id} {...room} host={{ ...room.host, avatarUrl: room.host.avatarUrl ?? undefined }} />
              ))}
            </div>
          </section>
        )}

        {/* 社区热门讨论 */}
        {hotDiscussions.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
                {t('home.discussionSection')}
              </h2>
              <Link href="/community" className="text-lobster hover:underline text-sm">
                {t('more')} →
              </Link>
            </div>
            <div className="space-y-3">
              {hotDiscussions.map((p) => (
                <Link
                  key={p.id}
                  href={`/community/${p.id}`}
                  className="block p-4 bg-white rounded-xl border border-gray-100 hover:border-lobster/30 transition-all"
                >
                  <h3 className="font-medium text-gray-900 line-clamp-2">{p.title}</h3>
                  <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                    <span>{p.author.username}</span>
                    <span>{p.likeCount} 点赞</span>
                    <span>{p.commentCount} 评论</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </MainLayout>
  );
}
