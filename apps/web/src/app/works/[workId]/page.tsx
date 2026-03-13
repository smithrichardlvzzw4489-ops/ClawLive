'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

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
  
  const [work, setWork] = useState<Work | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadWork();
  }, [workId]);

  const loadWork = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works/${workId}`);
      
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !work) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || '作品不存在'}</p>
          <Link href="/works" className="text-lobster hover:underline">
            返回作品列表
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-6">
          <Link href="/works" className="text-lobster hover:underline mb-4 inline-block">
            ← 返回作品列表
          </Link>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{work.title}</h1>
              {work.description && (
                <p className="text-gray-600 mb-4">{work.description}</p>
              )}
              <div className="flex items-center gap-6 text-sm text-gray-600">
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
                <span>👁️ {work.viewCount} 浏览</span>
                <span>💬 {work.messages.length} 对话</span>
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
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {work.coverImage && (
          <div className="mb-8">
            <img
              src={work.coverImage}
              alt={work.title}
              className="w-full max-h-96 object-cover rounded-lg shadow"
            />
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="border-b p-4 bg-gray-50">
            <h2 className="text-xl font-semibold text-gray-900">创作过程</h2>
            <p className="text-sm text-gray-600 mt-1">
              作者与 {work.lobsterName} 的对话记录
            </p>
          </div>
          
          <div className="p-6 space-y-4">
            {work.messages.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                这个作品还没有对话记录
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
      </div>
    </div>
  );
}
