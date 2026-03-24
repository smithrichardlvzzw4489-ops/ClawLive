'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { WORK_PARTITIONS } from '@/lib/work-partitions';

type SourceType = 'all' | 'official' | 'user';
type UserSubType = 'all' | 'from-work' | 'direct';

interface SkillListItem {
  id: string;
  title: string;
  description?: string;
  partition: string;
  sourceWorkId?: string;
  tags: string[];
  viewCount: number;
  useCount: number;
  createdAt: string;
  sourceType?: string;
  author: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

function getSourceType(sourceType: SourceType, userSubType: UserSubType): string {
  if (sourceType === 'official') return 'official';
  if (sourceType === 'user') {
    if (userSubType === 'from-work') return 'user-work';
    if (userSubType === 'direct') return 'user-direct';
    return 'user';
  }
  return 'all';
}

export function MarketContent() {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const creatorId = searchParams.get('creator');
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePartition, setActivePartition] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('all');
  const [userSubType, setUserSubType] = useState<UserSubType>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    if (sourceType !== 'user') setUserSubType('all');
  }, [sourceType]);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/skills/tags`)
      .then((r) => r.json())
      .then((d) => setAvailableTags(d.tags || []))
      .catch(() => setAvailableTags([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (activePartition) params.set('partition', activePartition);
    if (search.trim()) params.set('search', search.trim());
    if (selectedTags.length > 0) params.set('tags', selectedTags.join(','));
    if (creatorId) params.set('authorId', creatorId);
    const st = getSourceType(sourceType, userSubType);
    if (st !== 'all') params.set('sourceType', st);
    const qs = params.toString();
    const base = process.env.NEXT_PUBLIC_API_URL || '';
    const url = base + '/api/skills' + (qs ? '?' + qs : '');
    fetch(url)
      .then((res) => (res.ok ? res.json() : { skills: [] }))
      .then((data) => {
        if (!cancelled) setSkills(data.skills || []);
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [activePartition, search, sourceType, userSubType, selectedTags, creatorId]);

  return (
    <div className="container mx-auto px-6 py-8">
      <section className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('market.title')}</h1>
          <p className="text-gray-600">{t('market.subtitle')}</p>
        </div>
        <Link
          href="/market/health-check"
          className="px-4 py-2 border border-lobster text-lobster rounded-lg font-medium hover:bg-lobster/5 transition-colors flex items-center gap-2 shrink-0"
        >
          🩺 {t('healthCheck.title')}
        </Link>
      </section>

      <section className="mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex rounded-lg bg-gray-100 p-0.5">
              {(['all', 'official', 'user'] as SourceType[]).map((st) => (
                <button
                  key={st}
                  onClick={() => setSourceType(st)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    sourceType === st ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t(`market.tab${st === 'all' ? 'All' : st === 'official' ? 'Official' : 'User'}`)}
                </button>
              ))}
            </div>
            {sourceType === 'user' && (
              <div className="flex rounded-lg bg-gray-50 border border-gray-200 p-0.5">
                {(['all', 'from-work', 'direct'] as UserSubType[]).map((ust) => (
                  <button
                    key={ust}
                    onClick={() => setUserSubType(ust)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      userSubType === ust ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {ust === 'all' ? t('works.partitionAll') : ust === 'from-work' ? t('market.tabUserWork') : t('market.tabUserDirect')}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
            />
            {availableTags.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm text-gray-500 shrink-0">{t('market.filterByTag')}:</span>
                {availableTags.slice(0, 12).map((tag) => (
                  <button
                    key={tag}
                    onClick={() =>
                      setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))
                    }
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-lobster text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => setSelectedTags([])}
                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    {t('market.clearTags')}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              onClick={() => setActivePartition(null)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activePartition === null ? 'bg-lobster text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t('works.partitionAll')}
            </button>
            {WORK_PARTITIONS.map((p) => (
              <button
                key={p.id}
                onClick={() => setActivePartition(p.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activePartition === p.id ? 'bg-lobster text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t(`partitions.${p.nameKey}`)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster" />
        </div>
      ) : skills.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
          <div className="text-6xl mb-4">📦</div>
          <p className="text-gray-600">
            {sourceType === 'official'
              ? t('market.emptyOfficial')
              : sourceType === 'user'
                ? userSubType === 'from-work'
                  ? t('market.emptyUserWork')
                  : userSubType === 'direct'
                    ? t('market.emptyUserDirect')
                    : t('market.emptyUser')
                : t('market.empty')}
          </p>
          {sourceType !== 'official' && (
            <Link
              href="/works/create"
              className="inline-block mt-4 px-6 py-2 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark"
            >
              {t('nav.createWork')}
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <Link
              key={skill.id}
              href={`/market/${skill.id}`}
              className="block bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-lobster/30 transition-all"
            >
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 line-clamp-2 flex-1">{skill.title}</h3>
                <div className="shrink-0 flex gap-1 flex-wrap justify-end">
                  {(skill.id.startsWith('official-') || skill.sourceType === 'official') && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-lobster/15 text-lobster rounded">{t('market.badgeOfficial')}</span>
                  )}
                  {skill.sourceType === 'user-work' && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-600 rounded">{t('market.badgeFromWork')}</span>
                  )}
                  {skill.sourceType === 'user-direct' && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-600 rounded">{t('market.badgeDirect')}</span>
                  )}
                </div>
              </div>
              {skill.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{skill.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                <span>{skill.author.username}</span>
                <span>{t(`partitions.${WORK_PARTITIONS.find((p) => p.id === skill.partition)?.nameKey || 'other'}`)}</span>
              </div>
              <div className="flex gap-4 text-xs text-gray-400">
                <span>{skill.viewCount} {t('market.views')}</span>
                <span>{skill.useCount} {t('market.uses')}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
