'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { WorkCard } from '@/components/WorkCard';
import { useLocale } from '@/lib/i18n/LocaleContext';

interface Work {
  id: string;
  title: string;
  description?: string;
  lobsterName: string;
  coverImage?: string;
  videoUrl?: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  messageCount: number;
  publishedAt: Date;
  author: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

export default function WorksPage() {
  const { t } = useLocale();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkAuth();
    loadWorks();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (error) {
      console.error('Error checking auth:', error);
    }
  };

  const loadWorks = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works`);
      if (response.ok) {
        const data = await response.json();
        setWorks(data.works);
      }
    } catch (error) {
      console.error('Error loading works:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('works.title')}</h1>
          <p className="text-gray-600">{t('works.subtitle')}</p>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin text-6xl mb-4">🦞</div>
            <p className="text-gray-600">{t('loading')}</p>
          </div>
        ) : works.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl">
            <div className="text-6xl mb-4">📚</div>
            <p className="text-xl text-gray-600 mb-2">{t('works.noWorks')}</p>
            {user && (
              <Link
                href="/works/create"
                className="inline-block mt-4 px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
              >
                {t('works.createFirst')}
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {works.map((work) => (
              <WorkCard
                key={work.id}
                id={work.id}
                title={work.title}
                description={work.description}
                lobsterName={work.lobsterName}
                coverImage={work.coverImage}
                videoUrl={work.videoUrl}
                tags={work.tags}
                viewCount={work.viewCount}
                likeCount={work.likeCount}
                messageCount={work.messageCount}
                author={work.author}
              />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

