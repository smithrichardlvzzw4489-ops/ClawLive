'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSocket } from '@/hooks/useSocket';
import { WorkAgentSettings } from '@/components/WorkAgentSettings';

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
  status: 'draft' | 'published';
  updatedAt: Date;
}

export default function WorkStudioPage() {
  const params = useParams();
  const router = useRouter();
  const workId = params.workId as string;
  
  const [work, setWork] = useState<Work | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [agentConfigured, setAgentConfigured] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
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
      setMessages(prev => [...prev, message]);
    };

    socket.on('work-message', handleWorkMessage);

    return () => {
      socket.off('work-message', handleWorkMessage);
      socket.emit('leave-work', workId);
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
        body: JSON.stringify({ content: inputMessage.trim() }),
      });

      if (response.ok) {
        // Don't add message here - wait for Socket.io to push it back
        // This prevents duplicate messages
        setInputMessage('');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('发送失败，请重试');
    } finally {
      setSending(false);
    }
  };

  const publishWork = async () => {
    if (!confirm('确认发布这个作品吗？发布后将无法继续编辑。')) {
      return;
    }

    setPublishing(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works/${workId}/publish`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-lobster mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (!work) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">作品不存在</p>
          <Link href="/works" className="text-lobster hover:underline">
            返回作品列表
          </Link>
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
          <Link href="/my-works" className="text-2xl hover:scale-110 transition-transform">
            🦞
          </Link>
          <div>
            <h1 className="text-xl font-bold">{work.title}</h1>
            <p className="text-sm text-gray-600">🦞 {work.lobsterName} • 创作中</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Agent Status */}
          {agentConfigured ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              Agent 已连接
            </div>
          ) : (
            <button
              onClick={() => setShowSettings(true)}
              className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm hover:bg-yellow-200 transition"
            >
              ⚠️ 配置 Agent
            </button>
          )}
          
          <Link
            href="/my-works"
            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            保存草稿
          </Link>
          <button
            onClick={publishWork}
            disabled={publishing || messages.length === 0}
            className="px-6 py-2 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {publishing ? '发布中...' : '📤 发布作品'}
          </button>
        </div>
      </header>
      
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
      <div className="flex-1 overflow-hidden p-4">
        <div className="h-full bg-white rounded-lg shadow overflow-hidden flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <div className="text-6xl mb-4">💬</div>
                <p className="text-lg mb-2">开始与你的 Agent 对话吧！</p>
                <p className="text-sm">输入你的想法，让 {work.lobsterName} 来帮助你创作</p>
              </div>
            ) : (
              messages.map((msg) => (
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
                        {msg.sender === 'user' ? '👤 你' : `🦞 ${work.lobsterName}`}
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
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t bg-gray-50 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="输入你的想法..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lobster"
                disabled={sending}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !inputMessage.trim()}
                className="px-6 py-3 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? '发送中...' : '发送'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              💡 提示：与 Agent 充分交流，创作出更好的内容。满意后点击「发布作品」
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
