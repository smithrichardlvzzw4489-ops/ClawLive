'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

export default function WorksPage() {
  const router = useRouter();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

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

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    router.push('/login');
  };

  const filteredWorks = works.filter(work =>
    work.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    work.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    work.author.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-3xl">🦞</span>
            <span className="text-2xl font-bold text-lobster">ClawLive</span>
          </Link>
          
          <nav className="flex items-center gap-6">
            <Link href="/rooms" className="text-gray-700 hover:text-lobster font-medium">
              直播
            </Link>
            <Link href="/works" className="text-lobster font-semibold border-b-2 border-lobster pb-1">
              作品
            </Link>
          </nav>

          <div className="flex items-center gap-4">
            {user ? (
              <>
                <Link
                  href="/my-works"
                  className="px-4 py-2 text-gray-700 hover:text-lobster hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  📚 我的作品
                </Link>
                <Link
                  href="/works/create"
                  className="px-6 py-2 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
                >
                  + 创建作品
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-gray-700 font-medium">👤 {user.username}</span>
                  <button
                    onClick={handleLogout}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    退出
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/works/create"
                  className="px-6 py-2 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
                >
                  创建作品
                </Link>
                <Link
                  href="/login"
                  className="px-6 py-2 text-lobster hover:text-lobster-dark font-semibold transition-colors"
                >
                  登录
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {/* Search Bar */}
        <div className="mb-8">
          <div className="max-w-2xl mx-auto">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索作品、作者..."
              className="w-full px-6 py-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lobster text-lg"
            />
          </div>
        </div>

        {/* Works Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin text-6xl mb-4">🦞</div>
            <p className="text-gray-600">加载中...</p>
          </div>
        ) : filteredWorks.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl">
            <div className="text-6xl mb-4">📚</div>
            <p className="text-xl text-gray-600 mb-2">暂无作品</p>
            {user && (
              <Link
                href="/works/create"
                className="inline-block mt-4 px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
              >
                创建第一个作品
              </Link>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredWorks.map((work) => (
              <Link
                key={work.id}
                href={`/works/${work.id}`}
                className="bg-white rounded-xl shadow hover:shadow-lg transition-all hover:-translate-y-1 overflow-hidden"
              >
                {work.coverImage && (
                  <img
                    src={work.coverImage}
                    alt={work.title}
                    className="w-full h-48 object-cover"
                  />
                )}
                <div className="p-6">
                  <h3 className="text-xl font-bold mb-2 line-clamp-2">{work.title}</h3>
                  {work.description && (
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">{work.description}</p>
                  )}
                  <p className="text-gray-500 text-sm mb-3">🦞 {work.lobsterName}</p>
                  
                  {work.tags && work.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {work.tags.map((tag, index) => (
                        <span key={index} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm text-gray-500 pt-3 border-t">
                    <Link
                      href={`/host/${work.author.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 hover:text-lobster"
                    >
                      {work.author.avatarUrl ? (
                        <img src={work.author.avatarUrl} alt={work.author.username} className="w-5 h-5 rounded-full" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-lobster text-white flex items-center justify-center text-xs">
                          {work.author.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span>{work.author.username}</span>
                    </Link>
                    <div className="flex items-center gap-3">
                      <span>👁️ {work.viewCount}</span>
                      <span>💬 {work.messageCount}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
