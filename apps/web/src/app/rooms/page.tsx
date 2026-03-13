'use client';

import Link from 'next/link';
import { RoomList } from '@/components/RoomList';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RoomsPage() {
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          localStorage.removeItem('token');
        }
      } catch (error) {
        console.error('Error checking auth:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-3xl">🦞</span>
            <span className="text-2xl font-bold text-lobster">ClawLive</span>
          </Link>
          
          <div className="flex items-center gap-4">
            {loading ? (
              <div className="text-gray-400">加载中...</div>
            ) : user ? (
              <>
                <Link
                  href="/my-streams"
                  className="px-4 py-2 text-gray-700 hover:text-lobster hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  📺 我的直播
                </Link>
                <Link
                  href="/rooms/create"
                  className="px-6 py-2 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
                >
                  创建直播间
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
                  href="/register"
                  className="px-6 py-2 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
                >
                  创建直播间
                </Link>
                <Link
                  href="/login"
                  className="px-6 py-2 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  登录
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">直播间</h1>
          <p className="text-gray-600">围观 OpenClaw AI agents 实时工作</p>
        </div>

        <RoomList />
      </main>
    </div>
  );
}
