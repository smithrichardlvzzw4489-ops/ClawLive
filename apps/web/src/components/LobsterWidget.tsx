'use client';

/**
 * 虾米悬浮 Widget
 *
 * 在所有页面右下角显示 Darwin（🧬）入口，点击打开侧边对话抽屉。
 * - 复用与 /my-lobster 相同的对话历史（同一份后端记录）
 * - 打开时自动采集当前页面 DOM 文本，注入虾米上下文
 * - /my-lobster 页本身不显示（避免重复）
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api';
import { DARWIN_ICON } from '@/lib/brand';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LobsterMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  streaming?: boolean;
  statusText?: string;
}

// ─── 页面内容采集 ──────────────────────────────────────────────────────────────

function capturePageContext(): string {
  try {
    const clone = document.body.cloneNode(true) as HTMLElement;
    // 移除无关元素
    clone
      .querySelectorAll('script,style,nav,header,footer,aside,noscript,[aria-hidden="true"]')
      .forEach((el) => el.remove());
    const text = (clone.innerText || '')
      .replace(/\s{3,}/g, '\n\n')
      .trim()
      .slice(0, 3000);
    return text;
  } catch {
    return '';
  }
}

// ─── MessageBubble（精简版） ──────────────────────────────────────────────────

function WidgetBubble({ msg }: { msg: LobsterMessage }) {
  const isUser = msg.role === 'user';

  if (!isUser && msg.statusText && !msg.content) {
    return (
      <div className="flex gap-2">
        <span className="text-base flex-shrink-0">{DARWIN_ICON}</span>
        <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-xs text-gray-500 shadow-sm ring-1 ring-gray-100">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-orange-400" />
          <span>{msg.statusText}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && <span className="text-base flex-shrink-0 mt-0.5">{DARWIN_ICON}</span>}
      <div
        className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
          isUser
            ? 'rounded-tr-sm bg-lobster text-white'
            : 'rounded-tl-sm bg-white text-gray-800 shadow-sm ring-1 ring-gray-100'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        {msg.streaming && (
          <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-current opacity-70" />
        )}
      </div>
    </div>
  );
}

// ─── Widget ────────────────────────────────────────────────────────────────────

export function LobsterWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<LobsterMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [applied, setApplied] = useState<boolean | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** 是否已注入本次打开的页面上下文 */
  const contextInjectedRef = useRef(false);
  /** 记录上次注入的路径，路径变化时重置 */
  const lastInjectedPathRef = useRef('');

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 路径变化时重置上下文注入标记
  useEffect(() => {
    if (lastInjectedPathRef.current !== pathname) {
      contextInjectedRef.current = false;
      lastInjectedPathRef.current = pathname;
    }
  }, [pathname]);

  // Widget 打开时加载状态 + 历史
  useEffect(() => {
    if (!open) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    (async () => {
      setLoadingHistory(true);
      try {
        const meRes = await fetch(`${API_BASE_URL}/api/lobster/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const meData = await meRes.json();
        if (!meData.applied) {
          setApplied(false);
          return;
        }
        setApplied(true);
        const histRes = await fetch(`${API_BASE_URL}/api/lobster/history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const histData = await histRes.json();
        const msgs: LobsterMessage[] = histData.messages || [];
        setMessages(
          msgs.length > 0
            ? msgs
            : [
                {
                  id: 'welcome-widget',
                  role: 'assistant',
                  content: `你好！我是 Darwin ${DARWIN_ICON} 我已经看到你当前的页面了，有什么问题尽管问我！`,
                  timestamp: new Date().toISOString(),
                },
              ],
        );
      } catch {
        setApplied(false);
      } finally {
        setLoadingHistory(false);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    })();
  }, [open]);

  const sendMessage = useCallback(
    async (text: string, injectContext = false) => {
      if (!text.trim() || sending) return;
      const token = localStorage.getItem('token');
      if (!token) return;

      const userMsg: LobsterMessage = {
        id: `tmp-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);

      const placeholderId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: placeholderId,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          streaming: true,
          statusText: '思考中...',
        },
      ]);

      // 只在需要注入时抓取页面内容
      const pageContext = injectContext ? capturePageContext() : undefined;
      const pageUrl = injectContext ? pathname : undefined;

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const response = await fetch(`${API_BASE_URL}/api/lobster/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ message: text, pageContext, pageUrl }),
          signal: ctrl.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const msg = errData.message || errData.error || `请求失败 (${response.status})`;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId
                ? { ...m, content: `⚠️ ${msg}`, streaming: false, statusText: undefined }
                : m,
            ),
          );
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            let event: { type: string; text?: string; id?: string; message?: string };
            try { event = JSON.parse(raw); } catch { continue; }

            if (event.type === 'status') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId
                    ? { ...m, statusText: event.text, content: '', streaming: true }
                    : m,
                ),
              );
            } else if (event.type === 'delta') {
              streamContent += event.text ?? '';
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId
                    ? { ...m, content: streamContent, statusText: undefined, streaming: true }
                    : m,
                ),
              );
            } else if (event.type === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId
                    ? { ...m, streaming: false, statusText: undefined, id: event.id || m.id }
                    : m,
                ),
              );
            } else if (event.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId
                    ? { ...m, content: `⚠️ ${event.message}`, streaming: false, statusText: undefined }
                    : m,
                ),
              );
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? { ...m, content: '⚠️ 请求被中断，请重试', streaming: false, statusText: undefined }
              : m,
          ),
        );
      } finally {
        setSending(false);
        abortRef.current = null;
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [sending, pathname],
  );

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    // 首次发送时注入页面上下文（当前路径未注入过）
    const needsContext = !contextInjectedRef.current;
    if (needsContext) contextInjectedRef.current = true;
    sendMessage(text, needsContext);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // /my-lobster 页面自身不显示 Widget；未登录不显示
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (pathname === '/my-lobster' || !token) return null;

  return (
    <>
      {/* 悬浮按钮 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 text-2xl shadow-lg transition hover:scale-105 hover:shadow-xl active:scale-95"
          title="打开 Darwin"
          aria-label="打开 Darwin 助手"
        >
          {DARWIN_ICON}
        </button>
      )}

      {/* 侧边抽屉 */}
      {open && (
        <>
          {/* 遮罩（点击关闭） */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />

          {/* 面板 */}
          <div className="fixed bottom-0 right-0 top-0 z-50 flex w-[380px] max-w-[95vw] flex-col bg-gray-50 shadow-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center gap-3 border-b border-gray-200/60 bg-white/90 px-4 py-3 backdrop-blur-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 text-lg shadow-sm">
                {DARWIN_ICON}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Darwin</p>
                <p className="text-[10px] text-green-500 truncate">
                  ● 已加载当前页面 · {pathname}
                </p>
              </div>
              <a
                href="/my-lobster"
                target="_blank"
                className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="在完整页面打开"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <button
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-400"
                title="关闭"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {loadingHistory ? (
                <div className="flex justify-center py-12">
                  <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-lobster" />
                </div>
              ) : applied === false ? (
                <div className="py-12 text-center">
                  <p className="text-3xl mb-2">{DARWIN_ICON}</p>
                  <p className="text-sm font-medium text-gray-700">还没有 Darwin</p>
                  <p className="text-xs text-gray-400 mt-1 mb-4">申请你的专属 Darwin 助手</p>
                  <a
                    href="/my-lobster"
                    className="inline-block rounded-xl bg-lobster px-5 py-2 text-sm font-semibold text-white hover:bg-lobster-dark"
                  >
                    去申请
                  </a>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <WidgetBubble key={msg.id} msg={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>


            {/* Input */}
            {applied && (
              <div className="shrink-0 border-t border-gray-200/60 bg-white px-3 py-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="问我关于这个页面的任何事..."
                    rows={1}
                    maxLength={2000}
                    disabled={sending}
                    className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-lobster/40 focus:bg-white focus:ring-2 focus:ring-lobster/10 disabled:opacity-60"
                    style={{ maxHeight: '100px', overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden' }}
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.style.height = 'auto';
                      el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lobster text-white shadow transition hover:bg-lobster-dark disabled:opacity-40"
                  >
                    {sending ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
