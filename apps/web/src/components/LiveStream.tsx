'use client';

import { useEffect, useState, useRef } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { Message, AgentLog, Comment, Screenshot, Room } from '@clawlive/shared-types';
import { ChatBubble } from './ChatBubble';
import { AgentLogPanel } from './AgentLogPanel';
import { CommentSection } from './CommentSection';
import { ScreenshotViewer } from './ScreenshotViewer';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span className="flex items-center gap-1">
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
    </div>
  );
}
