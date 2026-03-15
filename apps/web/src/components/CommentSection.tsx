'use client';

import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Comment } from '@clawlive/shared-types';
import { format } from 'date-fns';
import Link from 'next/link';

interface CommentSectionProps {
  roomId: string;
  socket: Socket | null;
  comments: Comment[];
  hostUsername?: string;
}

export function CommentSection({ roomId, socket, comments, hostUsername }: CommentSectionProps) {
  const [content, setContent] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    setIsLoggedIn(!!token);
    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((user) => user && setCurrentUsername(user.username))
        .catch(() => {});
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !content.trim()) return;

    const displayName = currentUsername || '匿名观众';

    socket.emit('send-comment', {
      roomId,
      content: content.trim(),
      nickname: displayName,
    });
    setContent('');
  };

  // 参与者（去重，取最近发言的）
  const uniqueParticipants = Array.from(
    new Map(comments.slice().reverse().map((c) => [c.nickname, c])).values()
  );
  const participants = uniqueParticipants.slice(0, 8);
  const overflowCount = Math.max(0, uniqueParticipants.length - 8);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments]);

  return (
    <div className="bg-white rounded-lg shadow flex flex-col overflow-hidden flex-1 min-h-0">
      <h3 className="px-4 py-3 font-semibold text-gray-700 border-b bg-gray-50/80">
        实时聊天
      </h3>

      {/* 参与者头像 */}
      {participants.length > 0 && (
        <div className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto">
          {participants.map((c) => (
            <div
              key={c.id}
              className="flex-shrink-0 w-8 h-8 rounded-full bg-lobster/20 flex items-center justify-center text-sm font-semibold text-lobster"
              title={c.nickname}
            >
              {c.nickname.charAt(0).toUpperCase()}
            </div>
          ))}
          {overflowCount > 0 && (
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
              +{overflowCount}
            </span>
          )}
        </div>
      )}

      {/* 消息列表 */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[120px] max-h-[200px]"
      >
        {comments.slice(-20).map((comment) => {
          const isHost = !!hostUsername && comment.nickname === hostUsername;
          return (
            <div key={comment.id} className="flex gap-2">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-lobster/20 flex items-center justify-center text-sm font-semibold text-lobster">
                {comment.nickname.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800">{comment.nickname}</span>
                  {isHost && (
                    <span className="text-xs px-2 py-0.5 bg-lobster/20 text-lobster rounded">
                      主播
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {format(new Date(comment.timestamp), 'HH:mm')}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mt-0.5 break-words">{comment.content}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 输入区 / 登录 CTA */}
      <div className="p-3 border-t bg-white">
        {!isLoggedIn ? (
          <div className="p-4 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-center">
            <p className="text-sm text-gray-600 mb-3">登录后可发消息和申请配对</p>
            <Link
              href={`/login?redirect=${encodeURIComponent(`/rooms/${roomId}`)}`}
              className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              登录
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="发送弹幕..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-lobster focus:border-transparent text-sm"
              maxLength={500}
            />
            <button
              type="submit"
              disabled={!content.trim()}
              className="px-5 py-2 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              发送
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
