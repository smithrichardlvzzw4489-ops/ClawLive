'use client';

import { Message } from '@clawlive/shared-types';
import { format } from 'date-fns';

interface ChatBubbleProps {
  message: Message;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  // 后端 host 消息映射为 user 显示（Message 类型为 user | agent | system）
  const isUser = message.sender === 'user' || message.sender === 'host';
  const isAgent = message.sender === 'agent';
  const isSystem = message.sender === 'system';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-lobster text-white'
            : isAgent
            ? 'bg-purple-100 text-purple-900'
            : 'bg-gray-100 text-gray-700'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold">
            {isUser ? '👤 用户' : isAgent ? '🦞 龙虾' : '📢 系统'}
          </span>
          <span className="text-xs opacity-70">
            {format(new Date(message.timestamp), 'HH:mm:ss')}
          </span>
        </div>
        
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        
        {message.metadata && (
          <div className="mt-2 pt-2 border-t border-current/20 text-xs opacity-70">
            {message.metadata.model && <span>Model: {message.metadata.model}</span>}
            {message.metadata.tokens && <span className="ml-3">Tokens: {message.metadata.tokens}</span>}
            {message.metadata.filtered && <span className="ml-3">⚠️ 已过滤</span>}
          </div>
        )}
      </div>
    </div>
  );
}
