'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { trackBehavior } from '@/hooks/useBehaviorTrack';
import { useLocale } from '@/lib/i18n/LocaleContext';

interface Message {
  id: string;
  sender: 'host' | 'agent';
  content: string;
  timestamp: Date;
}

interface HistoryData {
  id: string;
  roomId: string;
  hostId: string;
  title: string;
  lobsterName: string;
  description?: string;
  startedAt: Date;
  endedAt: Date;
  messages: Message[];
  viewerCount: number;
  host: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

export default function HistoryPage() {
  const params = useParams();
  const historyId = params.historyId as string;
  const { t } = useLocale();
  
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rooms/history/${historyId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch history');
        }

        const historyData = await response.json();
        setData(historyData);
        trackBehavior('history_view', historyId);
      } catch (err: any) {
        setError(err.message || 'Failed to load history');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [historyId]);

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

  if (error || !data) {
    return (
      <MainLayout showSidebar={false}>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error || t('history.loadFailed')}</p>
            <Link href="/rooms" className="text-lobster hover:underline">
              {t('history.backToList')}
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  const durationMs = new Date(data.endedAt).getTime() - new Date(data.startedAt).getTime();
  const duration = Math.round(durationMs / 60000);

  return (
    <MainLayout showSidebar={false}>
      <div className="container mx-auto px-6 py-8 max-w-5xl">
        {/* Header Card */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <Link href={`/host/${data.hostId}`} className="text-lobster hover:underline mb-4 inline-block text-sm">
            ← {t('history.backToHost')}
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">{data.title}</h1>
                <span className="px-3 py-1 bg-gray-200 text-gray-600 text-sm font-semibold rounded">
                  {t('history.ended')}
                </span>
              </div>
              <p className="text-gray-600 mb-2">🦞 {data.lobsterName}</p>
              {data.description && (
                <p className="text-gray-500 mb-4">{data.description}</p>
              )}
              <div className="flex items-center gap-6 text-sm text-gray-600">
                <Link href={`/host/${data.hostId}`} className="flex items-center gap-2 hover:text-lobster">
                  {data.host.avatarUrl ? (
                    <img src={data.host.avatarUrl} alt={data.host.username} className="w-6 h-6 rounded-full" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-lobster text-white flex items-center justify-center text-xs">
                      {data.host.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span>{data.host.username}</span>
                </Link>
                <span>💬 {data.messages.length} 条消息</span>
                <span>⏱️ {duration} 分钟</span>
                <span>📅 {new Date(data.endedAt).toLocaleDateString('zh-CN')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chat History */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="border-b p-4 bg-gray-50">
            <h2 className="text-xl font-semibold text-gray-900">{t('history.replayTitle')}</h2>
          <p className="text-sm text-gray-600 mt-1">
            {new Date(data.startedAt).toLocaleString('zh-CN')} - {new Date(data.endedAt).toLocaleString('zh-CN')}
          </p>
        </div>
        
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {data.messages.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                {t('history.noMessages')}
              </div>
            ) : (
              data.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'host' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-4 ${
                      msg.sender === 'host'
                        ? 'bg-blue-500 text-white'
                        : 'bg-purple-100 text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold opacity-90">
                        {msg.sender === 'host' ? '🎤 主播' : '🦞 Agent'}
                      </span>
                      <span className={`text-xs opacity-75`}>
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
    </MainLayout>
  );
}
