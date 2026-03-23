'use client';

import { useState, useEffect, useRef } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { format } from 'date-fns';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { AgentConnectForInbox } from './AgentConnectForInbox';

interface Message {
  id: string;
  roomId: string;
  sender: 'user' | 'agent' | 'host';
  content: string;
  timestamp: Date;
}

export function AgentChatWidget() {
  const { t } = useLocale();
  const { socket, isConnected } = useSocket();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [inboxStatus, setInboxStatus] = useState<{ connected: boolean; hasConnections: boolean } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/inbox/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setInboxStatus({ connected: data.connected, hasConnections: data.hasConnections }))
      .catch(() => setInboxStatus({ connected: false, hasConnections: false }));
  }, [user]);

  useEffect(() => {
    if (!socket || !user || !expanded) return;
    const roomId = `inbox-${user.id}`;
    socket.emit('join-room', { roomId, role: 'viewer' });

    const onHistory = (history: Message[]) => {
      setMessages(
        (history || []).map((m) => ({
          ...m,
          timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
        }))
      );
    };
    const onMessage = (msg: Message) => {
      setMessages((prev) => [
        ...prev,
        {
          ...msg,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        },
      ]);
    };

    socket.on('message-history', onHistory);
    socket.on('new-message', onMessage);

    return () => {
      socket.emit('leave-room', { roomId });
      socket.off('message-history', onHistory);
      socket.off('new-message', onMessage);
    };
  }, [socket, user, expanded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    setSending(true);
    setInput('');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/inbox/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: text }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'NOT_CONNECTED') {
          setShowConnect(true);
        } else {
          setInput(text);
        }
      }
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const onConnectSuccess = () => {
    setShowConnect(false);
    setInboxStatus({ connected: true, hasConnections: true });
  };

  const handleToggle = () => {
    if (!user) {
      window.location.href = '/login?redirect=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.pathname : '/');
      return;
    }
    setExpanded(!expanded);
    if (!expanded && !inboxStatus?.connected && inboxStatus?.hasConnections) {
      setShowConnect(true);
    }
  };

  return (
    <>
      {/* 浮动按钮 */}
      <button
        onClick={handleToggle}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-lobster text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
        title={t('inbox.toggle')}
      >
        <span className="text-2xl">🦞</span>
        {user && inboxStatus?.connected && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
        )}
      </button>

      {/* 展开面板 */}
      {expanded && user && (
        <div className="fixed bottom-24 right-6 z-40 w-[360px] max-h-[480px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-gray-900">🦞 Agent</span>
            <button
              onClick={() => setExpanded(false)}
              className="text-gray-500 hover:text-gray-700 text-xl leading-none"
            >
              ×
            </button>
          </div>

          {showConnect ? (
            <AgentConnectForInbox onSuccess={onConnectSuccess} onClose={() => setShowConnect(false)} />
          ) : !inboxStatus?.connected ? (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
              <p className="text-gray-600 mb-4">{t('inbox.notConnected')}</p>
              <button
                onClick={() => setShowConnect(true)}
                className="px-6 py-2 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark transition-colors"
              >
                {t('inbox.connect')}
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
                {messages.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-8">{t('inbox.sayHi')}</p>
                )}
                {messages.map((msg) => {
                  const isUser = msg.sender === 'user' || msg.sender === 'host';
                  return (
                    <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 ${
                          isUser ? 'bg-lobster text-white' : 'bg-purple-100 text-purple-900'
                        }`}
                      >
                        <p className="text-xs opacity-80 mb-0.5">
                          {isUser ? '👤' : '🦞'} {format(new Date(msg.timestamp), 'HH:mm')}
                        </p>
                        <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 border-t">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder={t('inbox.placeholder')}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-lobster/30 focus:border-lobster outline-none"
                    disabled={sending}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    className="px-4 py-2 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {sending ? '...' : t('inbox.send')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
