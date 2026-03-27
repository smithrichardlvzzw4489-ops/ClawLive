'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { api, APIError } from '@/lib/api';

interface LobsterMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface LobsterInstance {
  userId: string;
  appliedAt: string;
  lastActiveAt: string;
  messageCount: number;
}

const WELCOME_MESSAGE: LobsterMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好！我是虾壳小龙虾 🦀 你的专属 AI 助手。有什么我可以帮你的吗？无论是平台使用、内容创作还是 AI 相关的问题，都可以问我～',
  timestamp: new Date().toISOString(),
};

function LobsterAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-lg' : size === 'lg' ? 'h-16 w-16 text-4xl' : 'h-10 w-10 text-2xl';
  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-400 to-orange-500 font-bold text-white shadow-sm`}>
      🦀
    </div>
  );
}

function MessageBubble({ msg }: { msg: LobsterMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && <LobsterAvatar size="sm" />}
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
        isUser
          ? 'rounded-tr-sm bg-lobster text-white'
          : 'rounded-tl-sm bg-white text-gray-800 shadow-sm ring-1 ring-gray-100'
      }`}>
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        <p className={`mt-1 text-[11px] ${isUser ? 'text-white/60' : 'text-gray-400'}`}>
          {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {isUser && (
        <div className="h-8 w-8 shrink-0 rounded-full bg-gray-300 flex items-center justify-center text-sm font-bold text-gray-600 self-end">
          我
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <LobsterAvatar size="sm" />
      <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-gray-100">
        <div className="flex gap-1 items-center">
          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

export default function MyLobsterPage() {
  const router = useRouter();
  const [applied, setApplied] = useState<boolean | null>(null);
  const [instance, setInstance] = useState<LobsterInstance | null>(null);
  const [messages, setMessages] = useState<LobsterMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login?redirect=/my-lobster');
      return;
    }
    loadStatus();
  }, [router]);

  const loadStatus = async () => {
    try {
      const data = await api.lobster.me();
      setApplied(data.applied);
      if (data.applied) {
        setInstance(data.instance);
        await loadHistory();
      }
    } catch {
      setApplied(false);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await api.lobster.history();
      const msgs: LobsterMessage[] = data.messages || [];
      setMessages(msgs.length > 0 ? msgs : [WELCOME_MESSAGE]);
    } catch {
      setMessages([WELCOME_MESSAGE]);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    setError('');
    try {
      const data = await api.lobster.apply();
      if (data.success) {
        setApplied(true);
        setInstance(data.instance);
        setMessages([WELCOME_MESSAGE]);
      }
    } catch (err) {
      setError(err instanceof APIError ? err.message : '申请失败，请稍后重试');
    } finally {
      setApplying(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: LobsterMessage = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setError('');

    try {
      const data = await api.lobster.chat(text);
      setMessages((prev) => [...prev, data.message]);
    } catch (err) {
      const msg = err instanceof APIError ? err.message : '发送失败，请稍后重试';
      setError(msg);
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'assistant', content: `⚠️ ${msg}`, timestamp: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = async () => {
    try {
      await api.lobster.clearHistory();
      setMessages([WELCOME_MESSAGE]);
      setShowClearConfirm(false);
    } catch {
      setShowClearConfirm(false);
    }
  };

  if (applied === null) {
    return (
      <MainLayout>
        <div className="flex justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-lobster" />
        </div>
      </MainLayout>
    );
  }

  if (!applied) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-red-400 to-orange-500 text-5xl shadow-lg">
            🦀
          </div>
          <h1 className="mb-3 text-2xl font-bold text-gray-900">虾壳小龙虾</h1>
          <p className="mb-2 text-gray-600">虾壳平台专属 AI 助手，部署在虾壳自己的服务器上</p>
          <p className="mb-8 text-sm text-gray-500">随时帮你创作内容、解答疑惑、提供灵感</p>

          <div className="mb-8 grid grid-cols-3 gap-4 rounded-2xl bg-gray-50 p-4 text-center">
            <div>
              <p className="text-2xl font-bold text-lobster">免费</p>
              <p className="mt-0.5 text-xs text-gray-500">申请无门槛</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-lobster">记忆</p>
              <p className="mt-0.5 text-xs text-gray-500">记住你的偏好</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-lobster">自托管</p>
              <p className="mt-0.5 text-xs text-gray-500">数据不外流</p>
            </div>
          </div>

          {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

          <button
            onClick={handleApply}
            disabled={applying}
            className="w-full rounded-2xl bg-lobster py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-lobster-dark disabled:opacity-60"
          >
            {applying ? '申请中...' : '申请我的虾壳小龙虾'}
          </button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-200/60 bg-white/80 px-4 py-3 backdrop-blur-sm">
          <LobsterAvatar size="md" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900">虾壳小龙虾</p>
            <p className="text-xs text-green-500">● 在线</p>
          </div>
          {instance && (
            <p className="shrink-0 text-xs text-gray-400">已发送 {instance.messageCount} 条</p>
          )}
          <button
            onClick={() => setShowClearConfirm(true)}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            清空记录
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-4">
          <div className="space-y-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {sending && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-gray-200/60 bg-white px-4 py-3">
          {error && !sending && (
            <p className="mb-2 text-xs text-red-500">{error}</p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="有什么想问的？按 Enter 发送，Shift+Enter 换行"
              rows={1}
              maxLength={1000}
              className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-lobster/40 focus:bg-white focus:ring-2 focus:ring-lobster/10"
              style={{ maxHeight: '120px', overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lobster text-white shadow transition hover:bg-lobster-dark disabled:opacity-40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-gray-300">虾壳小龙虾可能犯错，重要信息请自行核实</p>
        </div>
      </div>

      {/* Clear confirm modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-bold text-gray-900">清空对话记录</h3>
            <p className="mb-6 text-sm text-gray-600">清空后小龙虾将失去对之前对话的记忆，无法恢复。确定要清空吗？</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleClearHistory}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white hover:bg-red-600"
              >
                确定清空
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
