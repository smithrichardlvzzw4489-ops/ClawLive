'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSocket } from '@/hooks/useSocket';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { WorkAgentSettings } from '@/components/WorkAgentSettings';
import { WORK_PARTITIONS, DEFAULT_PARTITION } from '@/lib/work-partitions';
import { VideoUrlPlayer } from '@/components/VideoUrlPlayer';
import { BRAND_ZH } from '@/lib/brand';

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
  skillMarkdown?: string;
  partition?: string;
  lobsterName: string;
  status: 'draft' | 'published';
  videoUrl?: string;
  updatedAt: Date;
}

export default function WorkStudioPage() {
  const params = useParams();
  const router = useRouter();
  const workId = params.workId as string;
  
  const [work, setWork] = useState<Work | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [workVideoUrl, setWorkVideoUrl] = useState('');
  const [savingVideoUrl, setSavingVideoUrl] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [waitingForAgent, setWaitingForAgent] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishResultSummary, setPublishResultSummary] = useState('');
  const [publishSkillMarkdown, setPublishSkillMarkdown] = useState('');
  const [publishPartition, setPublishPartition] = useState<string>(DEFAULT_PARTITION);
  const [listToMarket, setListToMarket] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [healthCheckResult, setHealthCheckResult] = useState<{ riskLevel: string; score: number; summary: string } | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);
  const { t } = useLocale();
  const [agentConfigured, setAgentConfigured] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agentTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    loadWork();
    loadMessages();
    checkAgentConfig();
  }, [workId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Socket.io setup
  useEffect(() => {
    if (!socket) return;

    // Join work room
    socket.emit('join-work', workId);
    console.log(`📡 Joined work room: ${workId}`);

    // Listen for Agent messages
    const handleWorkMessage = (message: Message) => {
      console.log('📨 Received work message:', message);
      if (message.sender === 'agent') {
        setWaitingForAgent(false);
        if (agentTypingTimeoutRef.current) {
          clearTimeout(agentTypingTimeoutRef.current);
          agentTypingTimeoutRef.current = null;
        }
      }
      setMessages(prev => [...prev, message]);
    };

    socket.on('work-message', handleWorkMessage);

    return () => {
      socket.off('work-message', handleWorkMessage);
      socket.emit('leave-work', workId);
      if (agentTypingTimeoutRef.current) {
        clearTimeout(agentTypingTimeoutRef.current);
      }
    };
  }, [socket, workId]);

  const checkAgentConfig = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/work-agent-config/${workId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const config = await response.json();
        setAgentConfigured(config.agentEnabled && (config.agentStatus === 'active' || config.agentStatus === 'connected'));
      }
    } catch (error) {
      console.error('Error checking agent config:', error);
    }
  };

  const loadWork = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works/${workId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load work');
      }

      const workData = await response.json();
      setWork(workData);
      setWorkVideoUrl(workData.videoUrl || '');
    } catch (error) {
      console.error('Error loading work:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works/${workId}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const saveWorkVideoUrl = async (url?: string) => {
    if (savingVideoUrl) return;
    const toSave = url ?? workVideoUrl.trim();
    setSavingVideoUrl(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works/${workId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ videoUrl: toSave || null }),
      });
      if (response.ok) {
        const savedUrl = toSave || undefined;
        setWorkVideoUrl(savedUrl ?? '');
        setWork((w) => (w ? { ...w, videoUrl: savedUrl } : null));
      }
    } catch (e) {
      console.error('Failed to save video URL:', e);
    } finally {
      setSavingVideoUrl(false);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || sending) return;

    setSending(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works/${workId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: inputMessage.trim(),
        }),
      });

      if (response.ok) {
        setInputMessage('');
        if (agentConfigured) {
          setWaitingForAgent(true);
          if (agentTypingTimeoutRef.current) clearTimeout(agentTypingTimeoutRef.current);
          agentTypingTimeoutRef.current = setTimeout(() => setWaitingForAgent(false), 60000);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('发送失败，请重试');
    } finally {
      setSending(false);
    }
  };

  const openPublishModal = () => {
    setPublishResultSummary(work?.description?.slice(0, 80) || '');
    setPublishSkillMarkdown(work?.skillMarkdown || '');
    setPublishPartition(work?.partition || DEFAULT_PARTITION);
    setShowPublishModal(true);
  };

  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works/${workId}/generate-result-summary`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.resultSummary) {
        setPublishResultSummary(data.resultSummary);
      } else {
        alert(data.error || '生成失败');
      }
    } catch (error) {
      console.error('Generate summary failed:', error);
      alert('生成失败，请重试');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const publishWork = async () => {
    setPublishing(true);
    try {
      if (workVideoUrl.trim()) {
        await saveWorkVideoUrl();
      }

      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works/${workId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          videoUrl: workVideoUrl.trim() || undefined,
          resultSummary: publishResultSummary.trim() || undefined,
          skillMarkdown: publishSkillMarkdown.trim() || undefined,
          partition: publishPartition || DEFAULT_PARTITION,
          listToMarket: !!listToMarket,
        }),
      });

      if (response.ok) {
        setShowPublishModal(false);
        alert('✅ 作品已发布！');
        router.push(`/works/${workId}`);
      } else {
        throw new Error('Failed to publish');
      }
    } catch (error) {
      console.error('Error publishing work:', error);
      alert('发布失败，请重试');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold hover:opacity-80 transition-opacity">
            🦞 {BRAND_ZH}
          </Link>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster mx-auto mb-4"></div>
            <p className="text-gray-600">加载中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!work) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold hover:opacity-80 transition-opacity">
            🦞 {BRAND_ZH}
          </Link>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">作品不存在</p>
          </div>
        </div>
      </div>
    );
  }

  if (work.status === 'published') {
    router.push(`/works/${workId}`);
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold hover:opacity-80 transition-opacity">
            🦞 {BRAND_ZH}
          </Link>
          <div>
            <h1 className="text-xl font-bold">{work.title}</h1>
            <p className="text-sm text-gray-600">🦞 {work.lobsterName} • 创作中</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/my-works"
            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            保存草稿
          </Link>
          <button
            onClick={openPublishModal}
            disabled={publishing || messages.length === 0}
            className="px-6 py-2 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {publishing ? '发布中...' : '📤 发布作品'}
          </button>
        </div>
      </header>
      
      {/* Publish Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{t('workDetail.publishModalTitle')}</h2>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('workDetail.partitionLabel')} <span className="text-red-500">*</span>
            </label>
            <select
              value={publishPartition}
              onChange={(e) => setPublishPartition(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent mb-4"
              required
            >
              {WORK_PARTITIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(`partitions.${p.nameKey}`)}
                </option>
              ))}
            </select>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('workDetail.resultSummaryLabel')}
            </label>
            <div className="flex gap-2 mb-1">
              <textarea
                value={publishResultSummary}
                onChange={(e) => setPublishResultSummary(e.target.value)}
                placeholder={t('workDetail.resultSummaryPlaceholder')}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
                rows={3}
                maxLength={120}
              />
              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={generatingSummary}
                className="self-start px-4 py-2 bg-lobster/10 text-lobster rounded-lg font-medium hover:bg-lobster/20 transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
              >
                {generatingSummary ? (
                  <span className="animate-spin">⟳</span>
                ) : (
                  <span>✨</span>
                )}
                {generatingSummary ? '生成中...' : 'AI 生成'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">建议 50 字以内，适合转发分享</p>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('workDetail.skillMarkdownLabel')}
            </label>
            <div className="flex gap-2 mb-2">
              <textarea
                value={publishSkillMarkdown}
                onChange={(e) => { setPublishSkillMarkdown(e.target.value); setHealthCheckResult(null); }}
                placeholder={t('workDetail.skillMarkdownPlaceholder')}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent font-mono text-sm"
                rows={6}
                spellCheck={false}
              />
              {publishSkillMarkdown.trim() && (
                <button
                  type="button"
                  onClick={async () => {
                    setHealthChecking(true);
                    setHealthCheckResult(null);
                    try {
                      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/skills/health-check`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content: publishSkillMarkdown.trim() }),
                      });
                      const data = await res.json();
                      if (res.ok) setHealthCheckResult({ riskLevel: data.riskLevel, score: data.score, summary: data.summary });
                    } catch { setHealthCheckResult({ riskLevel: 'unknown', score: 0, summary: '检测失败' }); }
                    finally { setHealthChecking(false); }
                  }}
                  disabled={healthChecking}
                  className="self-start px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  {healthChecking ? '…' : '🩺 ' + t('healthCheck.runCheck')}
                </button>
              )}
            </div>
            {healthCheckResult && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${
                healthCheckResult.riskLevel === 'high' ? 'bg-red-50 text-red-800' :
                healthCheckResult.riskLevel === 'medium' ? 'bg-amber-50 text-amber-800' :
                healthCheckResult.riskLevel === 'low' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-800'
              }`}>
                {healthCheckResult.riskLevel === 'safe' ? '✓' : '⚠'} {healthCheckResult.summary}（{healthCheckResult.score}/100）
              </div>
            )}
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={listToMarket}
                onChange={(e) => setListToMarket(e.target.checked)}
                className="rounded border-gray-300 text-lobster focus:ring-lobster"
              />
              <span className="text-sm text-gray-700">{t('workDetail.listToMarketLabel')}</span>
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPublishModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={publishWork}
                disabled={publishing}
                className="flex-1 px-4 py-2 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark disabled:opacity-50"
              >
                {publishing ? '发布中...' : '确认发布'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Settings Modal */}
      {showSettings && (
        <WorkAgentSettings
          workId={workId}
          onClose={() => {
            setShowSettings(false);
            checkAgentConfig();
          }}
          onConfigComplete={() => {
            checkAgentConfig();
          }}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden p-1.5 sm:p-2 flex flex-col">
        <div className="flex-1 min-h-0 bg-white rounded-lg shadow overflow-hidden flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-1.5 py-1 sm:px-2 space-y-1">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-6">
                <div className="text-2xl mb-1">💬</div>
                <p className="text-sm mb-0.5">开始与你的 Agent 对话吧！</p>
                <p className="text-[11px] text-gray-500 leading-tight px-2">
                  输入你的想法，让 {work.lobsterName} 来帮助你创作
                </p>
              </div>
            ) : (
              messages.map((msg) => (
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
                      <span className="text-[10px] font-semibold opacity-90">
                        {msg.sender === 'user' ? '你' : work.lobsterName}
                      </span>
                      <span className="text-[10px] opacity-70 tabular-nums">
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
            {waitingForAgent && (
              <div className="flex justify-start">
                <div className="bg-purple-100 text-gray-600 rounded px-2 py-0.5 flex items-center gap-1 animate-pulse">
                  <span className="text-[10px] font-semibold truncate max-w-[8rem]">{work.lobsterName}</span>
                  <span className="text-[10px]">{t('workDetail.agentTyping')}</span>
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t bg-gray-50 p-1.5 sm:p-2">
            <div className="flex gap-1.5">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="输入你的想法..."
                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-lobster"
                disabled={sending}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !inputMessage.trim()}
                className="px-3 py-1 text-xs bg-lobster text-white rounded font-medium hover:bg-lobster-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {sending ? '发送中...' : '发送'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
