'use client';

import { useEffect, useState, useRef } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useVideoStream } from '@/hooks/useVideoStream';
import { useLiveKit } from '@/hooks/useLiveKit';
import { trackBehavior } from '@/hooks/useBehaviorTrack';
import { Message, AgentLog, Comment, Screenshot, Room } from '@clawlive/shared-types';
import { ChatBubble } from './ChatBubble';
import { CommentSection } from './CommentSection';
import { ScreenshotViewer } from './ScreenshotViewer';
import { AgentSettings } from './AgentSettings';
import { ShareButton } from './ShareButton';
import { VideoPlayer } from './VideoPlayer';
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
  const [isStartingLive, setIsStartingLive] = useState(false);
  const [participantName, setParticipantName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const useLiveKitMode = !!process.env.NEXT_PUBLIC_LIVEKIT_URL;

  const p2pVideo = useVideoStream({
    roomId,
    socket,
    isHost,
    isLive: room?.isLive ?? false,
  });

  const livekitVideo = useLiveKit({
    roomId,
    isHost,
    isLive: room?.isLive ?? false,
    participantName: participantName || `user-${Date.now()}`,
  });

  const {
    stream: videoStream,
    error: videoError,
    isSharing,
    isReconnecting,
    isRoomConnected,
    startScreenShare,
    stopScreenShare,
    requestStream: requestVideoStream,
  } = useLiveKitMode ? livekitVideo : p2pVideo;

  // Check if current user is host + participant name
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
          setParticipantName(user.username || user.id?.slice(0, 8) || 'user');
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

  // Start live - check config first
  const startLivestream = async () => {
    console.log('🎬 startLivestream called, isHost:', isHost, 'isTogglingLive:', isTogglingLive);
    
    if (!isHost || isTogglingLive) {
      console.log('❌ Early return: not host or toggling');
      return;
    }

    // Check if agent is configured
    try {
      const token = localStorage.getItem('token');
      const configResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/agent-config/${roomId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('📡 Config response status:', configResponse.status);

      if (configResponse.ok) {
        const config = await configResponse.json();
        console.log('⚙️ Config:', config);
        
        // If agent is already configured and active, start live directly
        if (config.agentEnabled && (config.agentStatus === 'active' || config.agentStatus === 'connected')) {
          console.log('✅ Agent already configured, starting live directly');
          await doStartLive();
          return;
        }
      } else if (configResponse.status === 404) {
        console.log('ℹ️ No config found, will show settings');
      }
    } catch (error) {
      console.error('❌ Failed to check config:', error);
    }

    // If no config or config not complete, show settings for configuration
    console.log('🔧 Showing settings modal');
    setShowSettings(true);
    setIsStartingLive(true);
  };

  // Actually start live after config is complete
  const doStartLive = async () => {
    setIsTogglingLive(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rooms/${roomId}/start`, {
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
        alert(`开始直播失败: ${error.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to start live:', error);
      alert('开始直播失败，请检查网络连接');
    } finally {
      setIsTogglingLive(false);
    }
  };

  // Stop live (保留 Agent 链接信息，下次开播无需重新配置)
  const stopLivestream = async () => {
    if (!isHost || isTogglingLive) return;

    if (!confirm('确认结束直播？')) {
      return;
    }

    setIsTogglingLive(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/rooms/${roomId}/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const updatedRoom = await response.json();
        setRoom(updatedRoom);
        stopScreenShare();
      } else {
        const error = await response.json();
        alert(`结束直播失败: ${error.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to stop live:', error);
      alert('结束直播失败，请检查网络连接');
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
    trackBehavior('room_join', roomId);

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
            <div className="text-sm text-gray-600 flex items-center gap-2">
              <span>🦞 {room.lobsterName}</span>
              <span>•</span>
              {room.host && (
                <Link
                  href={`/host/${room.host.id}`}
                  className="flex items-center gap-1 hover:text-lobster"
                  onClick={(e) => e.stopPropagation()}
                >
                  {room.host.avatarUrl ? (
                    <img src={room.host.avatarUrl} alt={room.host.username} className="w-5 h-5 rounded-full" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-lobster text-white flex items-center justify-center text-xs">
                      {room.host.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span>主播: {room.host.username}</span>
                </Link>
              )}
            </div>
          </div>
          {room.isLive && (
            <span className="flex items-center gap-2 px-3 py-1 bg-red-500 text-white text-sm font-semibold rounded-full">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              直播中
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isHost && room.isLive && (
            <button
              onClick={isSharing ? stopScreenShare : startScreenShare}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                isSharing ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isSharing ? '📵 停止摄像' : '📷 摄像头直播'}
            </button>
          )}
          {isHost && (
            <button
              onClick={room.isLive ? stopLivestream : startLivestream}
              disabled={isTogglingLive}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                room.isLive
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {isTogglingLive ? '处理中...' : room.isLive ? '🔴 结束直播' : '🎬 开始直播'}
            </button>
          )}
          <ShareButton
            url={`/rooms/${roomId}`}
            title={room.title}
            text={`${room.lobsterName} 的直播 - ${room.title}`}
            variant="icon"
          />
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 overflow-y-auto lg:overflow-hidden">
        <div className="lg:col-span-2 flex flex-col bg-white rounded-lg shadow overflow-hidden">
          {/* 主播未开播时的提示 */}
          {isHost && !room.isLive && (
            <div className="p-6 bg-amber-50 border-b border-amber-200 text-center">
              <p className="text-amber-800 font-medium mb-2">直播尚未开始</p>
              <p className="text-sm text-amber-700">请点击右上角「🎬 开始直播」按钮开始你的直播</p>
            </div>
          )}
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
        </div>

        {/* 右侧：视频区 + 实时聊天（VibeLab 风格） */}
        <div className="flex flex-col gap-4 overflow-hidden min-h-0">
          {/* 视频直播区域 - 手机端保证最小高度 */}
          <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col flex-1 min-h-[180px]">
            <div className="flex items-center justify-between px-4 py-2 bg-black/5 border-b">
              <span
                className={`flex items-center gap-2 px-3 py-1 text-sm font-semibold rounded-full ${
                  room.isLive ? 'bg-red-500 text-white' : 'bg-gray-300 text-gray-600'
                }`}
              >
                {room.isLive && (
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                )}
                直播中 ({viewerCount})
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="p-2 rounded-lg hover:bg-black/10 transition-colors"
                  title="静音"
                >
                  <span className="text-lg">🔇</span>
                </button>
                <button
                  type="button"
                  className="p-2 rounded-lg hover:bg-black/10 transition-colors"
                  title="全屏"
                >
                  <span className="text-lg">⛶</span>
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-[160px] sm:min-h-[200px] overflow-hidden bg-black flex items-center justify-center">
              {videoStream ? (
                <VideoPlayer stream={videoStream} className="w-full h-full object-contain" muted={false} />
              ) : screenshots.length > 0 ? (
                <ScreenshotViewer screenshots={screenshots} embedded />
              ) : room.dashboardUrl ? (
                <iframe
                  src={room.dashboardUrl}
                  className="w-full h-full border-0"
                  title="Dashboard"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-gray-400 p-4 text-center">
                  {videoError ? (
                    <p className="text-sm text-amber-400 mb-2">{videoError}</p>
                  ) : null}
                  <p>
                    {room.isLive
                      ? isRoomConnected
                        ? '已连接房间，等待主播开启摄像头'
                        : '等待画面...'
                      : '直播未开始'}
                  </p>
                  {room.isLive && !isHost && (
                    <p className="text-xs text-gray-500 mt-2">若长时间无画面，请主播点击「摄像头直播」</p>
                  )}
                  {isHost && room.isLive && !isSharing && (
                    <button
                      onClick={startScreenShare}
                      className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                    >
                      打开摄像头开始视频直播
                    </button>
                  )}
                  {!isHost && room.isLive && requestVideoStream && (
                    <button
                      onClick={requestVideoStream}
                      disabled={isReconnecting}
                      className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isReconnecting ? '正在重新连接...' : '重新连接视频'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 实时聊天 */}
          <CommentSection
            roomId={roomId}
            socket={socket}
            comments={comments}
            hostUsername={room.host?.username}
          />
        </div>
      </div>

      {/* Agent Settings Modal */}
      {showSettings && (
        <AgentSettings
          roomId={roomId}
          onClose={() => {
            setShowSettings(false);
            setIsStartingLive(false);
          }}
          onConfigComplete={async () => {
            setShowSettings(false);
            setIsStartingLive(false);
            if (!room.isLive) {
              await doStartLive();
            }
          }}
          isPreLiveConfig={isStartingLive}
        />
      )}
    </div>
  );
}
