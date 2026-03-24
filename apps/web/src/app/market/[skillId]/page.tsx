'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { WORK_PARTITIONS } from '@/lib/work-partitions';

interface Skill {
  id: string;
  title: string;
  description?: string;
  skillMarkdown: string;
  partition: string;
  sourceWorkId?: string;
  sourceType?: string;
  tags: string[];
  viewCount: number;
  useCount: number;
  updatedAt: Date;
  author: { id: string; username: string; avatarUrl?: string };
  authorTagline?: string;
  authorFollowerCount?: number;
  discussionCount?: number;
}

interface DiscussionPost {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string[];
  likeCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: Date;
  author: { id: string; username: string; avatarUrl?: string };
}

interface RelatedSkill {
  id: string;
  title: string;
  description?: string;
  partition: string;
  viewCount: number;
  useCount: number;
  author: { id: string; username: string; avatarUrl?: string };
}

type TabKey = 'overview' | 'discussions' | 'integrate' | 'creator';

export default function SkillDetailPage() {
  const params = useParams();
  const skillId = params.skillId as string;
  const { t } = useLocale();

  const [skill, setSkill] = useState<Skill | null>(null);
  const [discussions, setDiscussions] = useState<DiscussionPost[]>([]);
  const [related, setRelated] = useState<{ similarSkills: RelatedSkill[]; authorOtherSkills: RelatedSkill[] }>({
    similarSkills: [],
    authorOtherSkills: [],
  });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [skillRes, discRes, relatedRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/skills/${skillId}`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/skills/${skillId}/discussions`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/skills/${skillId}/related`),
        ]);
        if (skillRes.ok) {
          const data = await skillRes.json();
          setSkill(data);
        } else setSkill(null);
        if (discRes.ok) {
          const { posts } = await discRes.json();
          setDiscussions(posts || []);
        }
        if (relatedRes.ok) {
          const data = await relatedRes.json();
          setRelated({ similarSkills: data.similarSkills || [], authorOtherSkills: data.authorOtherSkills || [] });
        }
      } catch (error) {
        console.error('Error loading skill:', error);
        setSkill(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [skillId]);

  const copySkill = useCallback(async () => {
    if (!skill?.skillMarkdown) return;
    try {
      await navigator.clipboard.writeText(skill.skillMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/skills/${skillId}/use`, { method: 'POST' });
    } catch {
      /* ignore */
    }
  }, [skill, skillId]);

  if (loading) {
    return (
      <MainLayout>
        <div className="container mx-auto px-6 py-16 flex justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster" />
        </div>
      </MainLayout>
    );
  }

  if (!skill) {
    return (
      <MainLayout>
        <div className="container mx-auto px-6 py-16 text-center">
          <p className="text-gray-600 mb-4">Skill 不存在</p>
          <Link href="/market" className="text-lobster hover:underline">
            返回市场
          </Link>
        </div>
      </MainLayout>
    );
  }

  const partitionName = WORK_PARTITIONS.find((p) => p.id === skill.partition)?.nameKey || 'other';
  const tags = [...(skill.tags || []), t(`partitions.${partitionName}`)].filter(Boolean);
  const valueStatement = skill.description || (skill.skillMarkdown ? skill.skillMarkdown.split('\n').slice(0, 3).join(' ').slice(0, 120) : '');

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: t('skillDetail.tabOverview') },
    { key: 'discussions', label: t('skillDetail.tabDiscussions') },
    { key: 'integrate', label: t('skillDetail.tabIntegrate') },
    { key: 'creator', label: t('skillDetail.tabCreator') },
  ];

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        <Link href="/market" className="text-lobster hover:underline mb-6 inline-block">
          ← {t('skillDetail.backToMarket')}
        </Link>

        {/* 顶部头部区 */}
        <div className="bg-gradient-to-br from-lobster/10 via-white to-purple-50 rounded-xl border border-gray-100 p-6 mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{skill.title}</h1>
          {valueStatement && (
            <p className="text-gray-600 text-base mb-4 max-w-3xl">{valueStatement}</p>
          )}
          <div className="flex flex-wrap gap-2 mb-4">
            {tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-0.5 rounded-full text-sm bg-lobster/10 text-lobster border border-lobster/20"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {skill.author.id !== 'official' ? (
            <Link
              href={`/host/${skill.author.id}`}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              {skill.author.avatarUrl ? (
                <img src={skill.author.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-lobster/20 text-lobster flex items-center justify-center text-sm font-semibold">
                  {skill.author.username.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <span className="font-medium text-gray-900">{skill.author.username}</span>
                {skill.authorTagline && (
                  <span className="text-gray-500 text-sm ml-2">— {skill.authorTagline}</span>
                )}
              </div>
            </Link>
            ) : (
              <div className="flex items-center gap-2">
                {skill.author.avatarUrl ? (
                  <img src={skill.author.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-lobster/20 text-lobster flex items-center justify-center text-sm font-semibold">
                    {skill.author.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="font-medium text-gray-900">{skill.author.username}</span>
              </div>
            )}
            {skill.author.id !== 'official' && (
              <Link
                href={`/host/${skill.author.id}`}
                className="px-3 py-1.5 text-sm border border-lobster text-lobster rounded-lg hover:bg-lobster/5 transition-colors"
              >
                {t('skillDetail.viewCreator')}
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-6 mt-4 pt-4 border-t border-gray-200 text-sm">
            <span><strong className="text-gray-900">{skill.viewCount}</strong> {t('market.views')}</span>
            <span><strong className="text-gray-900">{skill.useCount}</strong> {t('market.uses')}</span>
            {skill.authorFollowerCount != null && (
              <span><strong className="text-gray-900">{skill.authorFollowerCount}</strong> {t('skillDetail.fans')}</span>
            )}
            <span><strong className="text-gray-900">{skill.discussionCount ?? 0}</strong> {t('skillDetail.discussions')}</span>
            <span>{t('skillDetail.lastUpdated')}: {new Date(skill.updatedAt).toLocaleDateString('zh-CN')}</span>
          </div>
        </div>

        {/* 主内容 70/30 */}
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 min-w-0 lg:max-w-[70%]">
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-6 overflow-x-auto">
              {tabs.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${
                    activeTab === key ? 'bg-white text-lobster shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === 'overview' && (
              <div className="space-y-6">
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('skillDetail.outputContent')}</h2>
                  <p className="text-gray-600">{t('skillDetail.outputFormat')}: Markdown</p>
                  <p className="text-gray-600 text-sm mt-1">
                    复制 SKILL.md 到你的 Agent（如 OpenClaw），即可让 Agent 掌握该能力。
                  </p>
                </section>
                {skill.sourceWorkId && (
                  <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('skillDetail.inputSource')}</h2>
                    <Link
                      href={`/works/${skill.sourceWorkId}`}
                      className="text-lobster hover:underline"
                    >
                      {t('skillDetail.fromWork')} →
                    </Link>
                  </section>
                )}
                <section>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('skillDetail.sampleOutput')}</h2>
                  <pre className="bg-gray-50 rounded-lg p-4 text-sm overflow-x-auto whitespace-pre-wrap font-mono border border-gray-100 max-h-80 overflow-y-auto">
                    {skill.skillMarkdown}
                  </pre>
                </section>
              </div>
            )}

            {activeTab === 'discussions' && (
              <section>
                {discussions.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 bg-white rounded-xl border border-gray-100">
                    {t('skillDetail.noDiscussions')}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {discussions.map((p) => (
                      <Link
                        key={p.id}
                        href={`/community/${p.id}`}
                        className="block p-4 bg-white rounded-xl border border-gray-100 hover:border-lobster/30 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{p.type}</span>
                          <span className="text-sm text-gray-500">{p.author.username}</span>
                        </div>
                        <h3 className="font-semibold text-gray-900 line-clamp-2">{p.title}</h3>
                        <p className="text-sm text-gray-600 line-clamp-2 mt-1">{p.content}</p>
                        <div className="text-xs text-gray-400 mt-2 flex gap-4">
                          <span>{p.likeCount} 点赞</span>
                          <span>{p.commentCount} 评论</span>
                          <span>{new Date(p.createdAt).toLocaleDateString('zh-CN')}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'integrate' && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('skillDetail.accessMethods')}</h2>
                  <p className="text-gray-600">{t('skillDetail.copyToAgent')}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">SKILL.md 内容</h3>
                  <pre className="bg-gray-50 rounded-lg p-4 text-sm overflow-x-auto whitespace-pre-wrap font-mono border border-gray-100">
                    {skill.skillMarkdown}
                  </pre>
                </div>
              </section>
            )}

            {activeTab === 'creator' && (
              <section>
                <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100">
                  {skill.author.id !== 'official' ? (
                    <>
                      <Link href={`/host/${skill.author.id}`} className="flex items-center gap-3">
                        {skill.author.avatarUrl ? (
                          <img src={skill.author.avatarUrl} alt="" className="w-16 h-16 rounded-full object-cover" />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-lobster/20 text-lobster flex items-center justify-center text-2xl font-bold">
                            {skill.author.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold text-gray-900">{skill.author.username}</h3>
                          {skill.authorTagline && <p className="text-sm text-gray-500">{skill.authorTagline}</p>}
                          {skill.authorFollowerCount != null && (
                            <p className="text-sm text-gray-500">{skill.authorFollowerCount} {t('skillDetail.fans')}</p>
                          )}
                        </div>
                      </Link>
                      <Link
                        href={`/host/${skill.author.id}`}
                        className="ml-auto px-4 py-2 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark transition-colors"
                      >
                        {t('skillDetail.viewCreator')}
                      </Link>
                    </>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-lobster/20 text-lobster flex items-center justify-center text-2xl font-bold">
                        官
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{skill.author.username}</h3>
                        <p className="text-sm text-gray-500">平台官方推荐能力</p>
                      </div>
                    </div>
                  )}
                </div>
                {related.authorOtherSkills.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-semibold text-gray-900 mb-3">{t('skillDetail.creatorOtherSkills')}</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {related.authorOtherSkills.map((s) => (
                        <Link
                          key={s.id}
                          href={`/market/${s.id}`}
                          className="block p-3 rounded-lg border border-gray-100 hover:border-lobster/30 hover:shadow-sm transition-all"
                        >
                          <h4 className="font-medium text-gray-900 line-clamp-1">{s.title}</h4>
                          <p className="text-xs text-gray-500 mt-1">{s.viewCount} 浏览 · {s.useCount} 使用</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* 右侧订阅侧栏 */}
          <aside className="w-full lg:w-[30%] lg:min-w-[280px] flex-shrink-0 space-y-6">
            <div className="bg-white rounded-xl border border-gray-100 p-5 sticky top-4">
              <div className="text-center mb-4">
                <p className="text-2xl font-bold text-gray-900">免费</p>
                <p className="text-sm text-gray-500">复制即用，无需订阅</p>
              </div>
              <div className="space-y-3">
                <button
                  onClick={copySkill}
                  className="w-full px-4 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors flex items-center justify-center gap-2"
                >
                  {copied ? '✓ 已复制' : t('market.copySkill')}
                </button>
                <Link
                  href={`/works/create?skillId=${skillId}`}
                  className="block w-full px-4 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors text-center"
                >
                  ✏️ {t('market.createWithSkill')}
                </Link>
                <Link
                  href={`/market/health-check?skillId=${skillId}`}
                  className="block w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors text-center"
                >
                  🩺 {t('healthCheck.title')}
                </Link>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <h3 className="font-semibold text-gray-900 mb-2">{t('skillDetail.suitableFor')}</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• 研究型 Agent</li>
                  <li>• 需要该领域能力的 Agent</li>
                </ul>
              </div>
              <div className="mt-3">
                <h3 className="font-semibold text-gray-900 mb-2">{t('skillDetail.trustCard')}</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• {t('skillDetail.trustSource')}</li>
                  <li>• {t('skillDetail.trustStable')}</li>
                  <li>• {t('skillDetail.trustMaintained')}</li>
                </ul>
              </div>
            </div>
          </aside>
        </div>

        {/* 底部推荐 */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {discussions.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('skillDetail.relatedDiscussions')}</h2>
                <div className="space-y-3">
                  {discussions.slice(0, 3).map((p) => (
                    <Link
                      key={p.id}
                      href={`/community/${p.id}`}
                      className="block p-3 rounded-lg border border-gray-100 hover:border-lobster/30 text-sm"
                    >
                      <span className="font-medium text-gray-900 line-clamp-1">{p.title}</span>
                      <span className="text-gray-500 text-xs">{p.author.username} · {new Date(p.createdAt).toLocaleDateString('zh-CN')}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {related.similarSkills.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('skillDetail.similarSkills')}</h2>
                <div className="space-y-3">
                  {related.similarSkills.slice(0, 4).map((s) => (
                    <Link
                      key={s.id}
                      href={`/market/${s.id}`}
                      className="block p-3 rounded-lg border border-gray-100 hover:border-lobster/30"
                    >
                      <span className="font-medium text-gray-900 line-clamp-2">{s.title}</span>
                      <span className="text-gray-500 text-xs">{s.author.username}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {related.authorOtherSkills.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('skillDetail.creatorOtherSkills')}</h2>
                <div className="space-y-3">
                  {related.authorOtherSkills.slice(0, 4).map((s) => (
                    <Link
                      key={s.id}
                      href={`/market/${s.id}`}
                      className="block p-3 rounded-lg border border-gray-100 hover:border-lobster/30"
                    >
                      <span className="font-medium text-gray-900 line-clamp-2">{s.title}</span>
                      <span className="text-gray-500 text-xs">{s.viewCount} 浏览</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
