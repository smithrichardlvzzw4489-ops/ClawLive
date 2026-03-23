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
  tags: string[];
  viewCount: number;
  useCount: number;
  author: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

export default function SkillDetailPage() {
  const params = useParams();
  const skillId = params.skillId as string;
  const { t } = useLocale();

  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadSkill();
  }, [skillId]);

  const loadSkill = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/skills/${skillId}`);
      if (res.ok) {
        const data = await res.json();
        setSkill(data);
      } else {
        setSkill(null);
      }
    } catch (error) {
      console.error('Error loading skill:', error);
      setSkill(null);
    } finally {
      setLoading(false);
    }
  };

  const copySkill = useCallback(async () => {
    if (!skill?.skillMarkdown) return;
    try {
      await navigator.clipboard.writeText(skill.skillMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/skills/${skillId}/use`, {
        method: 'POST',
      });
    } catch {
      // ignore
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

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <Link href="/market" className="text-lobster hover:underline mb-6 inline-block">
          ← {t('back')} {t('market.title')}
        </Link>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{skill.title}</h1>
            {skill.description && (
              <p className="text-gray-600 mb-4">{skill.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
              <span>{skill.author.username}</span>
              <span>{t(`partitions.${partitionName}`)}</span>
              <span>{skill.viewCount} {t('market.views')}</span>
              <span>{skill.useCount} {t('market.uses')}</span>
              {skill.sourceWorkId && (
                <Link
                  href={`/works/${skill.sourceWorkId}`}
                  className="text-lobster hover:underline"
                >
                  {t('market.sourceWork')} →
                </Link>
              )}
            </div>
            <button
              onClick={copySkill}
              className="mt-4 px-6 py-2 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark transition-colors flex items-center gap-2"
            >
              {copied ? '✓ ' + t('workDetail.copied') : t('market.copySkill')}
            </button>
          </div>

          <div className="p-6">
            <pre className="bg-gray-50 rounded-lg p-4 text-sm overflow-x-auto whitespace-pre-wrap font-mono border border-gray-100">
              {skill.skillMarkdown}
            </pre>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
