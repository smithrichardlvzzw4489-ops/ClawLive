'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { ShareButton } from '@/components/ShareButton';
import { useLocale } from '@/lib/i18n/LocaleContext';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

interface Work {
  id: string;
  title: string;
  description?: string;
  lobsterName: string;
  tags?: string[];
  coverImage?: string;
  viewCount: number;
  likeCount: number;
  publishedAt: Date;
  messages: Message[];
  author: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

export default function WorkDetailPage() {
  const params = useParams();
  const workId = params.workId as string;
  const { t } = useLocale();
  
  const [work, setWork] = useState<Work | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadWork();
  }, [workId]);

  const loadWork = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works/${workId}`, { headers });
      
      if (!response.ok) {
        throw new Error('Failed to load work');
      }

      const workData = await response.json();
      setWork(workData);
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <MainLayout showSidebar={false}>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster mx-auto mb-4"></div>
            <p className="text-gray-600">{t('loading')}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !work) {
    return (
      <MainLayout showSidebar={false}>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error || t('workDetail.notFound')}</p>
            <Link href="/works" className="text-lobster hover:underline">
              {t('workDetail.backToList')}
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout showSidebar={false}>
      <div className="container mx-auto px-6 py-8 max-w-5xl">
        {/* Header Card */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <Link href="/works" className="text-lobster hover:underline mb-4 inline-block text-sm">
            ← {t('workDetail.backToList')}
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{work.title}</h1>
              {work.description && (
                <p className="text-gray-600 mb-4">{work.description}</p>
              )}
              <div className="flex items-center gap-6 text-sm text-gray-600 flex-wrap">
                <Link href={`/host/${work.author.id}`} className="flex items-center gap-2 hover:text-lobster">
                  {work.author.avatarUrl ? (
                    <img src={work.author.avatarUrl} alt={work.author.username} className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-lobster text-white flex items-center justify-center text-xs">
                      {work.author.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span>{work.author.username}</span>
                </Link>
                <span>🦞 {work.lobsterName}</span>
                <span>👁️ {work.viewCount}</span>
                <span>💬 {work.messages.length}</span>
                <span>📅 {new Date(work.publishedAt).toLocaleDateString('zh-CN')}</span>
              </div>
              {work.tags && work.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {work.tags.map((tag, index) => (
                    <span key={index} className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <ShareButton
              url={`/works/${workId}`}
              title={work.title}
              text={work.description || `${work.lobsterName} 的作品 - ${work.title}`}
            />
          </div>
        </div>

        {/* Cover Image */}
        {work.coverImage && (
          <div className="mb-6">
            <img
              src={work.coverImage}
              alt={work.title}
              className="w-full max-h-96 object-cover rounded-xl shadow-sm"
            />
          </div>
        )}

        {/* Chat Content */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="border-b p-4 bg-gray-50">
            <h2 className="text-xl font-semibold text-gray-900">{t('workDetail.creativeProcess')}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {t('workDetail.processDesc', { name: work.lobsterName })}
            </p>
          </div>
          
          <div className="p-6 space-y-4">
            {work.messages.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                {t('workDetail.noMessages')}
              </div>
            ) : (
              work.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-4 ${
                      msg.sender === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-purple-100 text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold opacity-90">
                        {msg.sender === 'user' ? `👤 ${work.author.username}` : `🦞 ${work.lobsterName}`}
                      </span>
                      <span className="text-xs opacity-75">
                        {new Date(msg.timestamp).toLocaleTimeString('zh-CN')}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
