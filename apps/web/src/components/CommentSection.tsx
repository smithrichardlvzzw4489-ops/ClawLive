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
    <div className="bg-white rounded-lg shadow flex flex-col overflow-hidden flex-1 min-h-0 min-h-[160px] sm:min-h-0">
      <h3 className="px-2 py-1.5 text-xs font-semibold text-gray-700 border-b bg-gray-50/80 flex-shrink-0">
        实时聊天
      </h3>

      {/* 参与者头像 */}
      {participants.length > 0 && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b overflow-x-auto flex-shrink-0">
          {participants.map((c) => (
            <div
              key={c.id}
              className="flex-shrink-0 w-6 h-6 rounded-full bg-lobster/20 flex items-center justify-center text-[10px] font-semibold text-lobster"
              title={c.nickname}
            >
              {c.nickname.charAt(0).toUpperCase()}
            </div>
          ))}
          {overflowCount > 0 && (
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-600">
              +{overflowCount}
            </span>
          )}
        </div>
      )}

      {/* 消息列表 */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-1.5 space-y-1 min-h-[72px] max-h-[120px] sm:max-h-[200px]"
      >
        {comments.slice(-20).map((comment) => {
          const isHost = !!hostUsername && comment.nickname === hostUsername;
          return (
            <div key={comment.id} className="flex gap-1.5">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-lobster/20 flex items-center justify-center text-[10px] font-semibold text-lobster">
                {comment.nickname.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1 flex-wrap leading-none">
                  <span className="text-xs font-semibold text-gray-800 truncate max-w-[7rem]">{comment.nickname}</span>
                  {isHost && (
                    <span className="text-[10px] px-1 py-0 bg-lobster/20 text-lobster rounded shrink-0">
                      主播
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
                    {format(new Date(comment.timestamp), 'HH:mm')}
                  </span>
                </div>
                <p className="text-xs text-gray-700 leading-tight mt-px break-words">{comment.content}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 输入区 / 登录 CTA - flex-shrink-0 确保手机端不被挤压 */}
      <div className="p-1.5 border-t bg-white flex-shrink-0">
        {!isLoggedIn ? (
          <div className="p-2 bg-gray-50 rounded border border-dashed border-gray-200 text-center">
            <p className="text-xs text-gray-600 mb-2">登录后可发消息和申请配对</p>
            <Link
              href={`/login?redirect=${encodeURIComponent(`/rooms/${roomId}`)}`}
              className="inline-block px-4 py-1.5 text-xs bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors min-h-[40px] flex items-center justify-center"
            >
              登录
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex gap-1.5">
            <input
              type="text"
              placeholder="发送弹幕..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-lobster focus:border-transparent text-sm min-h-[40px]"
              maxLength={500}
              autoComplete="off"
              inputMode="text"
            />
            <button
              type="submit"
              disabled={!content.trim()}
              className="px-3 py-1.5 bg-lobster text-white rounded font-medium hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs min-h-[40px] flex-shrink-0"
            >
              发送
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
