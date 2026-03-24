'use client';

import { Message } from '@clawlive/shared-types';
import { format } from 'date-fns';

interface ChatBubbleProps {
  message: Message;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  // 后端 rooms-simple 使用 sender='host'，需运行时判断（避免与 Prisma MessageSender 冲突）
  const sender = (message as { sender: string }).sender;
  const isUser = sender === 'user' || sender === 'host';
  const isAgent = sender === 'agent';
  const isSystem = sender === 'system';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}
    >
      <div
        className={`max-w-[min(98%,40rem)] rounded px-2 py-1 ${
          isUser
            ? 'bg-lobster text-white'
            : isAgent
            ? 'bg-purple-100 text-purple-900'
            : 'bg-gray-100 text-gray-700'
        }`}
      >
        <div className="flex items-baseline gap-1 mb-px flex-wrap leading-none">
          <span className="text-[10px] font-semibold opacity-95">
            {isUser ? '用户' : isAgent ? '龙虾' : '系统'}
          </span>
          <span className="text-[10px] opacity-60 tabular-nums">
            {format(new Date(message.timestamp), 'HH:mm')}
          </span>
        </div>

        <p className="whitespace-pre-wrap break-words text-xs leading-tight">{message.content}</p>

        {message.metadata && (
          <div className="mt-0.5 pt-0.5 border-t border-current/15 text-[10px] opacity-70 leading-tight">
            {message.metadata.model && <span>Model: {message.metadata.model}</span>}
            {message.metadata.tokens && <span className="ml-3">Tokens: {message.metadata.tokens}</span>}
            {message.metadata.filtered && <span className="ml-3">⚠️ 已过滤</span>}
          </div>
        )}
      </div>
    </div>
  );
}
