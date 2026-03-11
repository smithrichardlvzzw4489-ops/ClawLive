'use client';

import { useState } from 'react';
import { Socket } from 'socket.io-client';
import { Comment } from '@clawlive/shared-types';
import { format } from 'date-fns';

interface CommentSectionProps {
  roomId: string;
  socket: Socket | null;
  comments: Comment[];
}

export function CommentSection({ roomId, socket, comments }: CommentSectionProps) {
  const [content, setContent] = useState('');
  const [nickname, setNickname] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!socket || !content.trim()) return;

    const displayName = nickname.trim() || '匿名观众';
    
    socket.emit('send-comment', {
      roomId,
      content: content.trim(),
      nickname: displayName,
    });

    setContent('');
  };

  return (
    <div className="border-t">
      <div className="max-h-32 overflow-y-auto p-3 space-y-2 bg-gray-50">
        {comments.slice(-10).map((comment) => (
          <div key={comment.id} className="text-sm">
            <span className="font-semibold text-lobster">{comment.nickname}: </span>
            <span className="text-gray-700">{comment.content}</span>
            <span className="text-xs text-gray-400 ml-2">
              {format(new Date(comment.timestamp), 'HH:mm')}
            </span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-3 bg-white flex gap-2">
        <input
          type="text"
          placeholder="昵称 (可选)"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="px-3 py-2 border rounded-lg w-32 text-sm"
          maxLength={20}
        />
        <input
          type="text"
          placeholder="发送弹幕..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 px-3 py-2 border rounded-lg"
          maxLength={500}
        />
        <button
          type="submit"
          disabled={!content.trim()}
          className="px-6 py-2 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          发送
        </button>
      </form>
    </div>
  );
}
