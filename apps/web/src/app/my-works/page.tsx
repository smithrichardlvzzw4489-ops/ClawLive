'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';

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

export default function MyWorksPage() {
  const router = useRouter();
  const { t } = useLocale();
  const [data, setData] = useState<MyWorksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkAuth();
  }, [router]);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      // Get current user
      const userResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!userResponse.ok) {
        router.push('/login');
        return;
      }

      const userData = await userResponse.json();
      setUser(userData);

      // Get user's works
      const worksResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/works/user/${userData.id}?includeDrafts=true`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!worksResponse.ok) {
        throw new Error('Failed to fetch works');
      }

      const worksData = await worksResponse.json();
      setData(worksData);
    } catch (err: any) {
      setError(err.message || 'Failed to load works');
    } finally {
      setLoading(false);
    }
  };

  const deleteWork = async (workId: string) => {
    if (!confirm(t('myWorks.confirmDelete'))) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works/${workId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        checkAuth();
      } else {
        alert(t('myWorks.deleteFailed'));
      }
    } catch (error) {
      console.error('Error deleting work:', error);
      alert(t('myWorks.deleteFailed'));
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster mx-auto mb-4"></div>
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
          <div className="text-center">
            <p className="text-red-600 mb-4">{error || t('workDetail.loadFailed')}</p>
            <Link href="/my-works" className="text-lobster hover:underline">
              {t('workDetail.backToList')}
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  const { author, works, stats } = data;
  const draftWorks = works.filter((w) => w.status === 'draft');
  const publishedWorks = works.filter((w) => w.status === 'published');

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8">
        {/* User Profile Card */}
        <div className="bg-white rounded-xl shadow-sm p-8 mb-8">
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              {author?.avatarUrl ? (
                <img
                  src={author.avatarUrl}
                  alt={author.username}
                  className="w-24 h-24 rounded-full object-cover border-4 border-lobster"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-lobster text-white flex items-center justify-center text-3xl font-bold">
                  {author?.username.charAt(0).toUpperCase() || '?'}
                </div>
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('myWorks.title')}</h1>
              <p className="text-gray-600 mb-4">{author?.username}</p>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="font-semibold text-gray-900">{stats.totalWorks}</span>
                  <span className="text-gray-600 ml-1">{t('myWorks.works')}</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-900">{stats.totalViews}</span>
                  <span className="text-gray-600 ml-1">{t('myWorks.views')}</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-900">{stats.totalLikes}</span>
                  <span className="text-gray-600 ml-1">{t('myWorks.likes')}</span>
                </div>
              </div>
            </div>
            <Link
              href="/works/create"
              className="px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
            >
              + {t('myWorks.createNew')}
            </Link>
          </div>
        </div>

        {/* Draft Works */}
        {draftWorks.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">📝 {t('myWorks.drafts')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {draftWorks.map((work) => (
                <div
                  key={work.id}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-xl font-semibold text-gray-900 flex-1">{work.title}</h3>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-600 text-xs font-semibold rounded">
                      {t('myWorks.drafts')}
                    </span>
                  </div>
                  <p className="text-gray-600 mb-3">🦞 {work.lobsterName}</p>
                  {work.description && (
                    <p className="text-gray-500 text-sm mb-3 line-clamp-2">{work.description}</p>
                  )}
                  <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                    <span>💬 {work.messageCount} 对话</span>
                    <span>{new Date(work.updatedAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/works/${work.id}/studio`}
                      className="flex-1 px-4 py-2 bg-lobster text-white text-center rounded-lg hover:bg-lobster-dark transition-colors"
                    >
                      {t('myWorks.continueEdit')}
                    </Link>
                    <button
                      onClick={() => deleteWork(work.id)}
                      className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      {t('myWorks.delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* No drafts prompt */}
        {draftWorks.length === 0 && publishedWorks.length === 0 && (
          <section className="mb-12">
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <div className="text-6xl mb-4">📚</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{t('myWorks.noWorks')}</h3>
              <p className="text-gray-600 mb-6">{t('myWorks.createPrompt')}</p>
              <Link
                href="/works/create"
                className="inline-block px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
              >
                {t('myWorks.createWork')}
              </Link>
            </div>
          </section>
        )}

        {/* Published Works */}
        {publishedWorks.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">✅ {t('myWorks.published')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {publishedWorks.map((work) => (
                <div key={work.id} className="bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2 overflow-hidden relative">
                  <Link href={`/works/${work.id}`} className="block">
                    <div className="relative aspect-video bg-gradient-to-br from-lobster-light to-purple-200">
                      {work.coverImage ? (
                        <img src={work.coverImage} alt={work.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-6xl opacity-50">🦞</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="text-base font-semibold mb-2 line-clamp-2 text-gray-900">{work.title}</h3>
                      <p className="text-sm text-gray-600 mb-3">🦞 {work.lobsterName}</p>
                      <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t">
                        <div className="flex items-center gap-2">
                          <span>👁️ {work.viewCount}</span>
                          <span>💬 {work.messageCount}</span>
                        </div>
                        {work.publishedAt && (
                          <span>{new Date(work.publishedAt).toLocaleDateString('zh-CN')}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteWork(work.id);
                    }}
                    className="absolute top-3 right-3 p-2 bg-white/90 hover:bg-red-600 text-gray-600 hover:text-white rounded-lg shadow transition-colors"
                    title={t('myWorks.delete')}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </MainLayout>
  );
}
