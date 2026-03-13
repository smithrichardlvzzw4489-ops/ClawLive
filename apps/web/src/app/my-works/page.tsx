'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
    if (!confirm('确认删除这个作品吗？此操作无法撤销。')) {
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
        // Reload works
        checkAuth();
      } else {
        alert('删除失败');
      }
    } catch (error) {
      console.error('Error deleting work:', error);
      alert('删除失败');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || '加载失败'}</p>
          <Link href="/works" className="text-lobster hover:underline">
            返回作品列表
          </Link>
        </div>
      </div>
    );
  }

  const { author, works, stats } = data;
  const draftWorks = works.filter(w => w.status === 'draft');
  const publishedWorks = works.filter(w => w.status === 'published');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-6">
          <Link href="/works" className="text-lobster hover:underline mb-4 inline-block">
            ← 返回作品列表
          </Link>
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
              <h1 className="text-3xl font-bold text-gray-900 mb-2">我的作品</h1>
              <p className="text-gray-600 mb-4">作者：{author?.username}</p>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="font-semibold text-gray-900">{stats.totalWorks}</span>
                  <span className="text-gray-600 ml-1">已发布作品</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-900">{stats.totalViews}</span>
                  <span className="text-gray-600 ml-1">总浏览量</span>
                </div>
                <div>
                  <span className="font-semibold text-gray-900">{stats.totalLikes}</span>
                  <span className="text-gray-600 ml-1">总点赞数</span>
                </div>
              </div>
            </div>
            <Link
              href="/works/create"
              className="px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
            >
              + 创建新作品
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Draft Works */}
        {draftWorks.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">📝 草稿</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {draftWorks.map((work) => (
                <div
                  key={work.id}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-xl font-semibold text-gray-900 flex-1">{work.title}</h3>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-600 text-xs font-semibold rounded">
                      草稿
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
                      继续创作
                    </Link>
                    <button
                      onClick={() => deleteWork(work.id)}
                      className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      删除
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
              <h3 className="text-xl font-semibold text-gray-900 mb-2">还没有作品</h3>
              <p className="text-gray-600 mb-6">开始创作你的第一个作品吧！</p>
              <Link
                href="/works/create"
                className="inline-block px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
              >
                创建作品
              </Link>
            </div>
          </section>
        )}

        {/* Published Works */}
        {publishedWorks.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">✅ 已发布</h2>
            <div className="space-y-4">
              {publishedWorks.map((work) => (
                <Link
                  key={work.id}
                  href={`/works/${work.id}`}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 block"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">{work.title}</h3>
                      <p className="text-gray-600 mb-3">🦞 {work.lobsterName}</p>
                      {work.description && (
                        <p className="text-gray-500 text-sm mb-3">{work.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>👁️ {work.viewCount} 浏览</span>
                        <span>💬 {work.messageCount} 对话</span>
                        {work.tags && work.tags.length > 0 && (
                          <span>🏷️ {work.tags.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      {work.publishedAt && (
                        <div>{new Date(work.publishedAt).toLocaleDateString('zh-CN')}</div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
