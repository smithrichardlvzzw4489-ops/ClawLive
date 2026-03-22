'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { WorkAgentSettings } from '@/components/WorkAgentSettings';

export default function CreateWorkPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [createdWorkId, setCreatedWorkId] = useState<string | null>(null);

  // Auth guard: 未登录则跳转登录页，登录成功后返回
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('token')) {
      router.replace('/login?redirect=/works/create');
      return;
    }
  }, [router]);

  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    lobsterName: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to create work');
      }

      const work = await response.json();
      setCreatedWorkId(work.id);
    } catch (err: any) {
      setError(err.message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  const handleEnterStudio = () => {
    if (createdWorkId) {
      router.push(`/works/${createdWorkId}/studio`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <Link href="/works" className="text-lobster hover:underline inline-block mb-4">
            ← 返回作品列表
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">创建新作品</h1>
          <p className="text-gray-600">与你的 Agent 互动，创作独特的内容</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              作品标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="给你的作品起个名字"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Agent 名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.lobsterName}
              onChange={(e) => setFormData({ ...formData, lobsterName: e.target.value })}
              placeholder="小龙"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
              required
            />
            <p className="text-xs text-gray-500 mt-1">你的 AI Agent 的昵称</p>
          </div>

          {createdWorkId && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <WorkAgentSettings
                workId={createdWorkId}
                onClose={() => {}}
                inline
                onEnterStudio={handleEnterStudio}
              />
            </div>
          )}

          {!createdWorkId && (
            <div className="py-6 px-4 rounded-lg bg-gray-50 border border-dashed border-gray-200 text-center text-gray-500 text-sm">
              创建作品后，将在此配置 Agent
            </div>
          )}

          <div className="flex gap-4">
            {createdWorkId ? (
              <button
                type="button"
                onClick={handleEnterStudio}
                className="flex-1 px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
              >
                进入工作室 →
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '创建中...' : '创建并配置 Agent →'}
              </button>
            )}
            <Link
              href="/works"
              className="px-6 py-3 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors text-center"
            >
              取消
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
