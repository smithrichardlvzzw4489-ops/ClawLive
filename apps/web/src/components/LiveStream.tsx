'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { useLocale } from '@/lib/i18n/LocaleContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { sendMessageToGateway } from '@/hooks/useGateway';
import { API_BASE_URL } from '@/lib/api';

interface LiveStreamProps {
  roomId: string;
}

export function LiveStream({ roomId }: LiveStreamProps) {
  const searchParams = useSearchParams();
  const debugMode = searchParams.get('debug') === '1';
  const { t } = useLocale();
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
  const [waitingForAgent, setWaitingForAgent] = useState(false);
  const agentTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isTogglingLive, setIsTogglingLive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isStartingLive, setIsStartingLive] = useState(false);
  const [participantName, setParticipantName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const stableViewerId = useMemo(() => `viewer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, []);
  const hasAutoStartedCameraRef = useRef(false);
  const [isAutoStarting, setIsAutoStarting] = useState(false);
  const [openclawDirectConfig, setOpenclawDirectConfig] = useState<{ gatewayUrl: string; token: string } | null>(null);
  const [converting, setConverting] = useState(false);
  const router = useRouter();

  const useLiveKitMode = !!process.env.NEXT_PUBLIC_LIVEKIT_URL;

  const p2pVideo = useVideoStream({
    roomId,
    socket,
    isHost,
    isLive: room?.isLive ?? false,
    disabled: useLiveKitMode,
  });

  const livekitVideo = useLiveKit({
    roomId,
    isHost,
    isLive: room?.isLive ?? false,
    participantName: participantName || stableViewerId,
    liveMode: room?.liveMode ?? 'video',
  });

  const {
    stream: videoStream,
    error: videoError,
    isSharing,
    isReconnecting,
    isRoomConnected,
    noHostRegistered = false,
    startScreenShare,
    stopScreenShare,
    requestStream: requestVideoStream,
  } = useLiveKitMode ? livekitVideo : p2pVideo;

  // 主播进入直播界面后自动开启摄像头/麦克风，无需手动点击
  useEffect(() => {
    if (!room) return;
    if (!room.isLive) {
      hasAutoStartedCameraRef.current = false;
      setIsAutoStarting(false);
      return;
    }
    if (!isHost || isSharing || isTogglingLive) return;
    const liveMode = room.liveMode ?? 'video';
    if (hasAutoStartedCameraRef.current) return;

    setIsAutoStarting(true);
    const timer = setTimeout(() => {
      hasAutoStartedCameraRef.current = true;
      startScreenShare(liveMode === 'video');
    }, 400);
    const fallbackTimer = setTimeout(() => setIsAutoStarting(false), 2500);
    return () => {
      clearTimeout(timer);
      clearTimeout(fallbackTimer);
    };
  }, [room?.isLive, room?.liveMode, isHost, isSharing, isTogglingLive, startScreenShare]);

  // 自动开启成功时立即清除「正在开启」状态
  useEffect(() => {
    if (isSharing && isAutoStarting) setIsAutoStarting(false);
  }, [isSharing, isAutoStarting]);

  // Check if current user is host + participant name
  useEffect(() => {
    const checkHost = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          setIsHost(false);
          return;
        }

        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const user = await response.json();
          setParticipantName(user.username || user.id?.slice(0, 8) || 'user');
          const roomResponse = await fetch(`${API_BASE_URL}/api/rooms/${roomId}`);
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

  // 主播 + 直播中 + OpenClaw 直连：拉取 Gateway 连接信息供浏览器直连
  useEffect(() => {
    if (!isHost || !room?.isLive) {
      setOpenclawDirectConfig(null);
      return;
    }
    let cancelled = false;
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API_BASE_URL}/api/agent-config/${roomId}/browser-gateway`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.agentType === 'openclaw-direct' && data.openclawGatewayUrl && data.openclawToken) {
          setOpenclawDirectConfig({ gatewayUrl: data.openclawGatewayUrl, token: data.openclawToken });
        } else {
          setOpenclawDirectConfig(null);
        }
      })
      .catch(() => setOpenclawDirectConfig(null));
    return () => { cancelled = true; };
  }, [roomId, isHost, room?.isLive]);

  const [pendingLiveMode, setPendingLiveMode] = useState<'video' | 'audio'>('video');
  const [videoMuted, setVideoMuted] = useState(true);

  const startLivestream = async (liveMode: 'video' | 'audio' = 'video') => {
    console.log('🎬 startLivestream called, isHost:', isHost, 'isTogglingLive:', isTogglingLive);
    
    if (!isHost || isTogglingLive) return;
    setPendingLiveMode(liveMode);

    // Check if agent is configured
    try {
      const token = localStorage.getItem('token');
      const configResponse = await fetch(`${API_BASE_URL}/api/agent-config/${roomId}`, {
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
          await doStartLive(liveMode);
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

  const doStartLive = async (liveMode: 'video' | 'audio' = 'video') => {
    setIsTogglingLive(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ liveMode }),
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
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/stop`, {
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

    const content = hostMessage.trim();
    setIsSending(true);
    setHostMessage('');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok && data.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        setWaitingForAgent(true);
        if (agentTypingTimeoutRef.current) clearTimeout(agentTypingTimeoutRef.current);
        agentTypingTimeoutRef.current = setTimeout(() => setWaitingForAgent(false), 60000);

        // OpenClaw 直连：主播浏览器直连 Gateway，收到回复后同步到服务器
        if (openclawDirectConfig?.gatewayUrl && openclawDirectConfig?.token) {
          sendMessageToGateway(openclawDirectConfig.gatewayUrl, openclawDirectConfig.token, content)
            .then((result) => {
              setWaitingForAgent(false);
              if (agentTypingTimeoutRef.current) {
                clearTimeout(agentTypingTimeoutRef.current);
                agentTypingTimeoutRef.current = null;
              }
              const agentContent = result.error ? `❌ Agent 回复失败：${result.error}` : (result.response || '');
              if (!agentContent.trim()) return;
              fetch(`${API_BASE_URL}/api/rooms/${roomId}/agent-message`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ content: agentContent }),
              }).catch((err) => console.error('Failed to post agent message:', err));
            })
            .catch((err) => {
              setWaitingForAgent(false);
              if (agentTypingTimeoutRef.current) {
                clearTimeout(agentTypingTimeoutRef.current);
                agentTypingTimeoutRef.current = null;
              }
              fetch(`${API_BASE_URL}/api/rooms/${roomId}/agent-message`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ content: `❌ Agent 连接失败：${err?.message || String(err)}` }),
              }).catch(() => {});
            });
        }
      } else {
        setHostMessage(content);
        alert(`发送失败: ${data?.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setHostMessage(content);
      alert('发送失败，请检查网络连接');
    } finally {
      setIsSending(false);
    }
  };

  // API 兜底：Socket 可能在多实例时返回 未知房间，用 API 获取真实房间信息
  useEffect(() => {
    const apiUrl = API_BASE_URL;
    if (!apiUrl) return;
    let cancelled = false;
    fetch(`${apiUrl}/api/rooms/${roomId}`)
      .then((res) => {
        if (cancelled) return null;
        if (res.ok) return res.json();
        if (res.status === 404) {
          setRoom({
            id: roomId,
            hostId: '',
            title: '房间不存在',
            lobsterName: '',
            isLive: false,
            privacyFilters: [],
            viewerCount: 0,
            createdAt: new Date(),
            host: { id: '', username: 'Unknown', avatarUrl: undefined },
          } as Room);
          return null;
        }
        return null;
      })
      .then((apiRoom) => {
        if (cancelled || !apiRoom) return;
        setRoom(apiRoom);
        setViewerCount(apiRoom.viewerCount ?? 0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [roomId]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    if (debugMode) console.log('[DIAG] join-room', roomId);
    socket.emit('join-room', { roomId, role: 'viewer' });
    trackBehavior('room_join', roomId);

    socket.on('room-info', (roomData) => {
      setRoom((prev) => {
        // 若 Socket 返回 未知房间 但已有 API 数据，仅合并 viewerCount（实时人数），不覆盖 isLive 等
        if (roomData.title === '未知房间' && prev && prev.title !== '未知房间') {
          return { ...prev, viewerCount: roomData.viewerCount ?? prev.viewerCount };
        }
        return roomData;
      });
      setViewerCount(roomData.viewerCount ?? 0);
    });

    socket.on('message-history', (history) => {
      setMessages(history);
    });

    socket.on('new-message', (msg) => {
      if (debugMode) console.log('[DIAG] new-message received', msg?.id, msg?.sender, msg?.content?.slice(0, 40));
      if ((msg as { sender?: string }).sender === 'agent') {
        setWaitingForAgent(false);
        if (agentTypingTimeoutRef.current) {
          clearTimeout(agentTypingTimeoutRef.current);
          agentTypingTimeoutRef.current = null;
        }
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
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

    socket.on('room-status-change', ({ isLive, liveMode, startedAt, endedAt }) => {
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              isLive,
              // 结束直播时 liveMode 为 undefined，需清除以便下次重新选择
              ...(liveMode !== undefined ? { liveMode } : { liveMode: undefined }),
              ...(startedAt !== undefined && { startedAt }),
              ...(endedAt !== undefined && { endedAt }),
            }
          : null
      );
    });

    return () => {
      socket.emit('leave-room', { roomId });
      if (agentTypingTimeoutRef.current) clearTimeout(agentTypingTimeoutRef.current);
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
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-lobster" />
          <p className="text-xl text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {debugMode && (
        <div className="bg-slate-800 text-green-300 text-xs p-2 font-mono overflow-x-auto">
          [DEBUG] LiveKit={String(useLiveKitMode)} | isHost={String(isHost)} | isLive={String(room.isLive)} |
          hasStream={String(!!videoStream)} | socket={String(isConnected)} | noHost={String(noHostRegistered)} |
          error={videoError || '-'}
        </div>
      )}
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
              <span className="opacity-90 text-xs">
                ({(room.liveMode ?? 'video') === 'video' ? '视频' : '语音'}模式)
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isHost && room.isLive && (
            <button
              onClick={isSharing ? stopScreenShare : () => startScreenShare((room.liveMode ?? 'video') === 'video')}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                isSharing ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isSharing
                ? (room.liveMode ?? 'video') === 'video'
                  ? '📵 停止摄像'
                  : '📵 停止麦克风'
                : (room.liveMode ?? 'video') === 'video'
                  ? '📷 摄像头直播'
                  : '🎤 麦克风直播'}
            </button>
          )}
          {isHost && !room.isLive && (
            <>
              <button
                onClick={() => startLivestream('video')}
                disabled={isTogglingLive}
                className="px-4 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isTogglingLive ? '处理中...' : '📷 视频直播'}
              </button>
              <button
                onClick={() => startLivestream('audio')}
                disabled={isTogglingLive}
                className="px-4 py-2 rounded-lg font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isTogglingLive ? '处理中...' : '🎤 语音直播'}
              </button>
            </>
          )}
          {isHost && room.isLive && (
            <button
              onClick={stopLivestream}
              disabled={isTogglingLive}
              className="px-4 py-2 rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isTogglingLive ? '处理中...' : '🔴 结束直播'}
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

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-1.5 sm:gap-2 p-1.5 sm:p-2 overflow-y-auto lg:overflow-hidden min-h-0">
        {/* 观众端移动端：视频区优先显示（order-1），主播端聊天区在前 */}
        <div className={`lg:col-span-2 flex flex-col bg-white rounded-lg shadow overflow-hidden ${!isHost ? 'order-2 lg:order-1' : 'order-1'}`}>
          <div className="flex-1 overflow-y-auto px-1.5 py-1 sm:px-2 space-y-1">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
            {waitingForAgent && (
              <div className="flex justify-start animate-slide-up">
                <div className="bg-purple-100 text-purple-900 rounded px-2 py-0.5 flex items-center gap-1 animate-pulse">
                  <span className="text-[10px] font-semibold truncate max-w-[8rem]">{room.lobsterName}</span>
                  <span className="text-[10px]">{t('workDetail.agentTyping')}</span>
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Host message input */}
          {isHost && room.isLive && (
            <div className="border-t bg-blue-50 p-1.5 sm:p-2">
              {messages.length > 0 && (
                <div className="mb-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      if (converting) return;
                      const token = localStorage.getItem('token');
                      if (!token) { router.push('/login'); return; }
                      setConverting(true);
                      try {
                        const res = await fetch(`${API_BASE_URL}/api/works/convert-from-chat`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ sourceType: 'live', roomId }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok && data.workId) {
                          router.push(`/works/${data.workId}/studio`);
                        } else {
                          alert(data.error || t('convertToWork.error'));
                        }
                      } catch {
                        alert(t('convertToWork.error'));
                      } finally {
                        setConverting(false);
                      }
                    }}
                    disabled={converting}
                    className="text-sm text-lobster hover:text-lobster-dark font-medium disabled:opacity-50"
                  >
                    📄 {t('convertToWork.action')}
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hostMessage}
                  onChange={(e) => setHostMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendHostMessage()}
                  placeholder="输入消息与你的 Agent 对话..."
                  className="flex-1 px-2 py-1 text-xs border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isSending}
                />
                <button
                  onClick={sendHostMessage}
                  disabled={isSending || !hostMessage.trim()}
                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {isSending ? '发送中...' : '发送'}
                </button>
              </div>
              <p className="text-[10px] text-blue-600 mt-1 flex items-center gap-1 leading-tight">
                <span>🎤</span>
                <span>主播专用 - 你的消息会显示在聊天区，你的 Agent 可以看到并响应</span>
              </p>
            </div>
          )}
        </div>

        {/* 右侧：视频区 + 实时聊天（观众端移动端优先显示） */}
        <div className={`flex flex-col gap-2 overflow-hidden min-h-0 ${!isHost ? 'order-1 lg:order-2' : 'order-2'}`}>
          {/* 视频直播区域 - 保证最小高度，避免空白 */}
          <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col flex-1 min-h-[200px] sm:min-h-[260px]">
            {/* 主播未开摄像头时的提示：自动开启中 vs 开启失败需手动 */}
            {isHost && room.isLive && !isSharing && (
              <div
                className={`px-4 py-2 text-center text-sm font-medium flex flex-col sm:flex-row items-center justify-center gap-2 ${
                  isAutoStarting ? 'bg-blue-100 text-blue-800' : 'bg-amber-500 text-white'
                }`}
              >
                <span>{(room.liveMode ?? 'video') === 'video' ? '📷' : '🎤'}</span>
                <span>
                  {isAutoStarting
                    ? (room.liveMode ?? 'video') === 'video'
                      ? '正在开启摄像头...'
                      : '正在开启麦克风...'
                    : (room.liveMode ?? 'video') === 'video'
                      ? '开启失败，请点击下方按钮重新开启摄像头'
                      : '开启失败，请点击下方按钮重新开启麦克风'}
                </span>
                {!isAutoStarting && (
                  <span className="text-xs opacity-90">
                    （需语音直播？请先结束直播，再选择「语音直播」）
                  </span>
                )}
              </div>
            )}
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
                  onClick={() => videoStream && setVideoMuted((m) => !m)}
                  className="p-2 rounded-lg hover:bg-black/10 transition-colors"
                  title={videoMuted ? '取消静音' : '静音'}
                >
                  <span className="text-lg">{videoMuted ? '🔇' : '🔊'}</span>
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
            <div className="flex-1 min-h-[180px] sm:min-h-[220px] overflow-hidden bg-black flex items-center justify-center relative">
              {videoStream ? (
                <>
                  <VideoPlayer stream={videoStream} className="w-full h-full object-contain" muted={videoMuted} />
                  {videoMuted && (
                    <button
                      type="button"
                      onClick={() => setVideoMuted(false)}
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/60 text-white text-sm hover:bg-black/80 cursor-pointer transition-colors"
                    >
                      点击播放声音 🔊
                    </button>
                  )}
                </>
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
                      ? isHost && !isSharing
                        ? isAutoStarting
                          ? (room.liveMode ?? 'video') === 'video'
                            ? '正在开启摄像头...'
                            : '正在开启麦克风...'
                          : (room.liveMode ?? 'video') === 'video'
                            ? '开启失败，点击下方按钮重新开启摄像头'
                            : '开启失败，点击下方按钮重新开启麦克风'
                        : noHostRegistered
                          ? '主播尚未开启摄像头'
                          : isRoomConnected
                            ? (room.liveMode ?? 'video') === 'video'
                              ? '已连接房间，等待主播画面'
                              : '已连接房间，等待主播声音'
                            : (room.liveMode ?? 'video') === 'video'
                              ? '等待画面...'
                              : '等待声音...'
                      : '直播未开始'}
                  </p>
                  {room.isLive && !isHost && (
                    <p className="text-xs text-gray-500 mt-2">
                      若长时间无画面，请稍候或刷新页面
                    </p>
                  )}
                  {isHost && room.isLive && !isSharing && (
                    <button
                      onClick={() => !isAutoStarting && startScreenShare(room.liveMode === 'video')}
                      disabled={isAutoStarting}
                      className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {isAutoStarting
                        ? '连接中...'
                        : (room.liveMode ?? 'video') === 'video'
                          ? '重新开启摄像头'
                          : '重新开启麦克风'}
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
              await doStartLive(pendingLiveMode);
            }
          }}
          isPreLiveConfig={isStartingLive}
        />
      )}
    </div>
  );
}
