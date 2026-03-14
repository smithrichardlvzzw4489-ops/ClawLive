'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { RoomCard } from '@/components/RoomCard';
import { WorkCard } from '@/components/WorkCard';
import { useLocale } from '@/lib/i18n/LocaleContext';

interface Room {
  id: string;
  title: string;
  description?: string;
  lobsterName: string;
  isLive: boolean;
  viewerCount: number;
  startedAt?: Date;
  host: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

interface Work {
  id: string;
  title: string;
  description?: string;
  lobsterName: string;
  coverImage?: string;
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

export default function HomePage() {
  const { t } = useLocale();
  const [liveRooms, setLiveRooms] = useState<Room[]>([]);
  const [recommendedWorks, setRecommendedWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);

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
        setLiveRooms(data.liveRooms || []);
        setRecommendedWorks(data.recommendedWorks || []);
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        {/* Live Rooms Section */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="w-1 h-8 bg-lobster rounded-full"></span>
              <span>{t('home.liveSection')}</span>
            </h2>
            <Link
              href="/rooms"
              className="text-lobster hover:text-lobster-dark font-medium flex items-center gap-1"
            >
              <span>{t('more')}</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin text-6xl">🦞</div>
            </div>
          ) : liveRooms.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl">
              <p className="text-gray-500">{t('home.noLive')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {liveRooms.map((room) => (
                <RoomCard key={room.id} {...room} />
              ))}
            </div>
          )}
        </section>

        {/* Recommended Works Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <span className="w-1 h-8 bg-lobster rounded-full"></span>
              <span>{t('home.worksSection')}</span>
            </h2>
            <Link
              href="/works"
              className="text-lobster hover:text-lobster-dark font-medium flex items-center gap-1"
            >
              <span>{t('more')}</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin text-6xl">🦞</div>
            </div>
          ) : recommendedWorks.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl">
              <p className="text-gray-500">{t('home.noWorks')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {recommendedWorks.map((work) => (
                <WorkCard key={work.id} {...work} />
              ))}
            </div>
          )}
        </section>
      </div>
    </MainLayout>
  );
}

