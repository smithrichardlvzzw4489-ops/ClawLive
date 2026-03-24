'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { ShareButton } from '@/components/ShareButton';
import { VideoUrlPlayer } from '@/components/VideoUrlPlayer';
import { useLocale } from '@/lib/i18n/LocaleContext';

interface Message {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  videoUrl?: string;
  timestamp: Date;
}

interface Work {
  id: string;
  title: string;
  description?: string;
  resultSummary?: string;
  skillMarkdown?: string;
  lobsterName: string;
  tags?: string[];
  coverImage?: string;
  videoUrl?: string;
  viewCount: number;
  likeCount: number;
  publishedAt: Date;
  messages: Message[];
  author: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  authorLiveRoom?: {
    id: string;
    title: string;
    lobsterName: string;
    viewerCount: number;
  } | null;
}

/** 从 agent 消息中提取所有 SKILL.md 风格内容（含 YAML 头与正文），支持多个 Skill */
function extractSkillFromMessages(messages: Message[]): string | null {
  const blocks: string[] = [];
  const seen = new Set<string>();

  const addIfSkill = (raw: string) => {
    if (!raw.startsWith('---') || !raw.includes('name:')) return;
    const normalized = raw.replace(/\s+/g, ' ').trim();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    blocks.push(raw.trim());
  };

  for (const msg of messages) {
    if (msg.sender !== 'agent' || !msg.content) continue;
    // 匹配 ``` 或 ```md 或 ```yaml 等 fenced blocks
    const blockRe = /```(?:md|yaml|skill)?\s*\n([\s\S]*?)```/g;
    let m;
    while ((m = blockRe.exec(msg.content)) !== null) {
      addIfSkill(m[1].trim());
    }
    // 无语言标签的 ``` block
    const bareRe = /```\s*\n([\s\S]*?)```/g;
    while ((m = bareRe.exec(msg.content)) !== null) {
      addIfSkill(m[1].trim());
    }
  }

  if (blocks.length === 0) return null;
  return blocks.join('\n\n');
}

export default function WorkDetailPage() {
  const params = useParams();
  const workId = params.workId as string;
  const { t } = useLocale();
  
  const [work, setWork] = useState<Work | null>(null);
  const [linkedSkillId, setLinkedSkillId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedSkill, setCopiedSkill] = useState(false);

  const getSkillContent = useCallback((): string | null => {
    if (!work) return null;
    if (work.skillMarkdown?.trim()) return work.skillMarkdown.trim();
    return extractSkillFromMessages(work.messages);
  }, [work]);

  const copySkillMd = useCallback(async () => {
    const content = getSkillContent();
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedSkill(true);
      setTimeout(() => setCopiedSkill(false), 2000);
    } catch {
      // ignore
    }
  }, [getSkillContent]);

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
      const skillRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/skills?sourceWorkId=${workId}`);
      if (skillRes.ok) {
        const skillData = await skillRes.json();
        const skills = skillData.skills || [];
        if (skills.length > 0) setLinkedSkillId(skills[0].id);
      }
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
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{work.title}</h1>
              {(work.resultSummary || work.description) && (
                <div className={`mb-4 p-4 rounded-xl ${work.resultSummary ? 'bg-lobster/10 border border-lobster/30' : ''}`}>
                  <p className={`${work.resultSummary ? 'text-lg font-medium text-gray-800' : 'text-gray-600'}`}>
                    {work.resultSummary || work.description}
                  </p>
                </div>
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
                {work.authorLiveRoom && (
                  <Link
                    href={`/rooms/${work.authorLiveRoom.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 text-red-600 rounded-lg font-medium hover:bg-red-500/25 transition-colors"
                  >
                    <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                    {t('workDetail.authorLive')}
                  </Link>
                )}
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
            <div className="flex items-center gap-2 flex-wrap">
              <ShareButton
                url={`/works/${workId}`}
                title={work.title}
                text={work.resultSummary || work.description || `${work.lobsterName} 的作品 - ${work.title}`}
              />
              {getSkillContent() && (
                <button
                  type="button"
                  onClick={copySkillMd}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span>📋</span>
                  <span>{copiedSkill ? t('workDetail.copied') : t('workDetail.copySkillMd')}</span>
                </button>
              )}
            </div>
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

        {/* 作品主视频 */}
        {work.videoUrl && (
          <div className="mb-6">
            <VideoUrlPlayer url={work.videoUrl} className="w-full" />
          </div>
        )}

        {/* Chat Content */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="border-b px-3 py-2 bg-gray-50">
            <h2 className="text-base font-semibold text-gray-900">{t('workDetail.creativeProcess')}</h2>
            <p className="text-xs text-gray-600 mt-0.5 leading-snug">
              {t('workDetail.processDesc', { name: work.lobsterName })}
            </p>
          </div>
          
          <div className="px-2 py-2 space-y-1">
            {work.messages.length === 0 ? (
              <div className="text-center text-gray-500 py-6 text-sm">
                {t('workDetail.noMessages')}
              </div>
            ) : (
              work.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[min(98%,40rem)] rounded px-2 py-1 ${
                      msg.sender === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-purple-100 text-gray-900'
                    }`}
                  >
                    <div className="flex items-baseline gap-1 mb-px flex-wrap leading-none">
                      <span className="text-[10px] font-semibold opacity-90 truncate max-w-[10rem]">
                        {msg.sender === 'user' ? work.author.username : work.lobsterName}
                      </span>
                      <span className="text-[10px] opacity-70 tabular-nums shrink-0">
                        {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {msg.videoUrl && (
                      <div className="mb-1 rounded overflow-hidden max-w-sm">
                        <VideoUrlPlayer url={msg.videoUrl} />
                      </div>
                    )}
                    {msg.content ? (
                      <p className="whitespace-pre-wrap break-words text-xs leading-tight">{msg.content}</p>
                    ) : null}
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
