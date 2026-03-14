'use client';

import Link from 'next/link';
import { ShareButton } from './ShareButton';

interface WorkCardProps {
  id: string;
  title: string;
  description?: string;
  lobsterName: string;
  coverImage?: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  messageCount: number;
  author: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

export function WorkCard({ 
  id, 
  title, 
  description, 
  lobsterName, 
  coverImage, 
  tags, 
  viewCount, 
  messageCount, 
  author 
}: WorkCardProps) {
  return (
    <Link
      href={`/works/${id}`}
      className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2"
    >
      {/* Cover Image */}
      <div className="relative aspect-video bg-gradient-to-br from-lobster-light to-purple-200 overflow-hidden">
        {coverImage ? (
          <img
            src={coverImage}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-6xl opacity-50">🦞</span>
          </div>
        )}
        
        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-300"></div>

        {/* Share */}
        <div
          className="absolute top-2 right-2 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <ShareButton
            url={`/works/${id}`}
            title={title}
            text={description || `${lobsterName} 的作品 - ${title}`}
            variant="icon"
            className="!p-1.5 !bg-white/90 hover:!bg-white text-gray-600"
          />
        </div>
        
        {/* Stats Overlay */}
        <div className="absolute bottom-2 right-2 flex items-center gap-2 text-white text-xs font-semibold">
          <span className="px-2 py-1 bg-black/60 rounded backdrop-blur-sm">
            👁️ {viewCount}
          </span>
          <span className="px-2 py-1 bg-black/60 rounded backdrop-blur-sm">
            💬 {messageCount}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title */}
        <h3 className="text-base font-semibold mb-2 line-clamp-2 text-gray-900 group-hover:text-lobster transition-colors">
          {title}
        </h3>

        {/* Lobster Name */}
        <p className="text-sm text-gray-600 mb-3 flex items-center gap-1">
          <span>🦞</span>
          <span>{lobsterName}</span>
        </p>

        {/* Author Info */}
        <div className="flex items-center justify-between pt-3 border-t">
          <Link
            href={`/host/${author.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 hover:text-lobster transition-colors"
          >
            {author.avatarUrl ? (
              <img src={author.avatarUrl} alt={author.username} className="w-6 h-6 rounded-full" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-lobster text-white flex items-center justify-center text-xs font-semibold">
                {author.username.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-sm text-gray-600">{author.username}</span>
          </Link>
        </div>
      </div>
    </Link>
  );
}
