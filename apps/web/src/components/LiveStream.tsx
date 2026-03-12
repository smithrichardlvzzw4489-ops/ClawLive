'use client';

import { useEffect, useState, useRef } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { Message, AgentLog, Comment, Screenshot, Room } from '@clawlive/shared-types';
import { ChatBubble } from './ChatBubble';
import { AgentLogPanel } from './AgentLogPanel';
import { CommentSection } from './CommentSection';
import { ScreenshotViewer } from './ScreenshotViewer';
import { AgentSettings } from './AgentSettings';
import Link from 'next/link';

interface LiveStreamProps {
  roomId: string;
}

export function LiveStream({ roomId }: LiveStreamProps) {
  const { socket, isConnected } = useSocket();
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [isHost, setIsHost] = useState(false);
  const [hostMessage, setHostMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTogglingLive, setIsTogglingLive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if current user is host
  useEffect(() => {
    const checkHost = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setIsHost(false);
          return;
        }

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const user = await response.json();
          const roomResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rooms/${roomId}`);
          if (roomResponse.ok) {
            const roomData = await roomResponse.json();
            setIsHost(user.id === roomData.hostId);
          }
        }
      } catch (error) {
        console.error('Error checking host:', error);
        setIsHost(false);
      }
    };

    checkHost();
  }, [roomId]);

  // Toggle live status
  const toggleLiveStatus = async () => {
    if (!isHost || isTogglingLive) return;

    setIsTogglingLive(true);
    try {
      const token = localStorage.getItem('token');
      const endpoint = room?.isLive ? 'stop' : 'start';
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rooms/${roomId}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const updatedRoom = await response.json();
        setRoom(updatedRoom);
      } else {
        const error = await response.json();
        alert(`操作失败: ${error.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to toggle live status:', error);
      alert('操作失败，请检查网络连接');
    } finally {
      setIsTogglingLive(false);
    }
  };

  // Send message as host
  const sendHostMessage = async () => {
    if (!hostMessage.trim() || isSending || !isHost || !room?.isLive) return;

    setIsSending(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rooms/${roomId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ content: hostMessage.trim() }),
      });

      if (response.ok) {
        setHostMessage('');
      } else {
        const error = await response.json();
        alert(`发送失败: ${error.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('发送失败，请检查网络连接');
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.emit('join-room', { roomId, role: 'viewer' });

    socket.on('room-info', (roomData) => {
      setRoom(roomData);
      setViewerCount(roomData.viewerCount);
    });

    socket.on('message-history', (history) => {
      setMessages(history);
    });

    socket.on('new-message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    socket.on('new-log', (log) => {
      setLogs((prev) => [...prev, log]);
    });

    socket.on('new-comment', (comment) => {
      setComments((prev) => [...prev, comment]);
    });

    socket.on('new-screenshot', (screenshot) => {
      setScreenshots((prev) => [...prev, screenshot]);
    });

    socket.on('viewer-count-update', (count) => {
      setViewerCount(count);
    });

    socket.on('room-status-change', ({ isLive, startedAt, endedAt }) => {
      setRoom((prev) => prev ? { ...prev, isLive, startedAt, endedAt } : null);
    });

    return () => {
      socket.emit('leave-room', { roomId });
      socket.off('room-info');
      socket.off('message-history');
      socket.off('new-message');
      socket.off('new-log');
      socket.off('new-comment');
      socket.off('new-screenshot');
      socket.off('viewer-count-update');
      socket.off('room-status-change');
    };
  }, [socket, isConnected, roomId]);

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-spin">🦞</div>
          <p className="text-xl text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/rooms" className="text-2xl hover:scale-110 transition-transform">
            🦞
          </Link>
          <div>
            <h1 className="text-xl font-bold">{room.title}</h1>
            <p className="text-sm text-gray-600">
              {room.lobsterName} • 主播: {room.host?.username}
            </p>
          </div>
          {room.isLive && (
            <span className="flex items-center gap-2 px-3 py-1 bg-red-500 text-white text-sm font-semibold rounded-full">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              直播中
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isHost && (
            <>
              <button
                onClick={() => setShowSettings(true)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-semibold transition-colors flex items-center gap-2"
                title="Agent 设置"
              >
                <span>⚙️</span>
                <span className="hidden sm:inline">设置</span>
              </button>
              <button
                onClick={toggleLiveStatus}
                disabled={isTogglingLive}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  room.isLive
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {isTogglingLive ? '处理中...' : room.isLive ? '🔴 结束直播' : '🎬 开始直播'}
              </button>
            </>
          )}
          <span className="flex items-center gap-1 text-sm text-gray-600">
            <span>👁️</span>
            <span className="font-semibold">{viewerCount}</span>
          </span>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 overflow-hidden">
        <div className="lg:col-span-2 flex flex-col bg-white rounded-lg shadow overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Host message input */}
          {isHost && room.isLive && (
            <div className="border-t bg-blue-50 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hostMessage}
                  onChange={(e) => setHostMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendHostMessage()}
                  placeholder="输入消息与你的 Agent 对话..."
                  className="flex-1 px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isSending}
                />
                <button
                  onClick={sendHostMessage}
                  disabled={isSending || !hostMessage.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSending ? '发送中...' : '发送'}
                </button>
              </div>
              <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                <span>🎤</span>
                <span>主播专用 - 你的消息会显示在聊天区，你的 Agent 可以看到并响应</span>
              </p>
            </div>
          )}
          
          <CommentSection roomId={roomId} socket={socket} comments={comments} />
        </div>

        <div className="flex flex-col gap-4 overflow-hidden">
          <AgentLogPanel logs={logs} />
          {screenshots.length > 0 && (
            <ScreenshotViewer screenshots={screenshots} />
          )}
          {room.dashboardUrl && (
            <div className="bg-white rounded-lg shadow overflow-hidden flex-1">
              <iframe
                src={room.dashboardUrl}
                className="w-full h-full border-0"
                title="Dashboard"
              />
            </div>
          )}
        </div>
      </div>

      {/* Agent Settings Modal */}
      {showSettings && (
        <AgentSettings
          roomId={roomId}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
