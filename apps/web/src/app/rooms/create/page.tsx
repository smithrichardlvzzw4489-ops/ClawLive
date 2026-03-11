'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';

export default function CreateRoomPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    id: '',
    title: '',
    description: '',
    lobsterName: '',
    dashboardUrl: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const room = await api.rooms.create({
        id: formData.id,
        title: formData.title,
        description: formData.description || undefined,
        lobsterName: formData.lobsterName,
        dashboardUrl: formData.dashboardUrl || undefined,
      });

      router.push(`/rooms/${room.id}`);
    } catch (err: any) {
      setError(err.message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <Link href="/rooms" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <span className="text-3xl">🦞</span>
            <span className="text-2xl font-bold text-lobster">ClawLive</span>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">创建直播间</h1>
          <p className="text-gray-600 mb-8">配置你的龙虾直播间</p>

          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-8 space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                房间 ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                placeholder="my-lobster-room"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                pattern="[a-z0-9-]+"
                title="只能包含小写字母、数字和连字符"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                唯一标识符，只能包含小写字母、数字和连字符
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                直播间标题 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="我的龙虾工作实况"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                龙虾昵称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.lobsterName}
                onChange={(e) => setFormData({ ...formData, lobsterName: e.target.value })}
                placeholder="小龙"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                描述
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="分享一下这个直播间的内容..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dashboard URL (可选)
              </label>
              <input
                type="url"
                value={formData.dashboardUrl}
                onChange={(e) => setFormData({ ...formData, dashboardUrl: e.target.value })}
                placeholder="https://lobsterboard.example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                如果你有 LobsterBoard/ClawMetry，可以嵌入到直播间
              </p>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '创建中...' : '创建直播间'}
              </button>
              <Link
                href="/rooms"
                className="px-6 py-3 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors text-center"
              >
                取消
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
