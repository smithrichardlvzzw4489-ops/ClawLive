'use client';

import { useState, useCallback } from 'react';

interface ShareButtonProps {
  url: string;
  title: string;
  text?: string;
  className?: string;
  variant?: 'icon' | 'button';
}

export function ShareButton({ url, title, text, className = '', variant = 'button' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleShare = useCallback(async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    let shareUrl = url.startsWith('http') ? url : `${origin}${url.startsWith('/') ? url : `/${url}`}`;
    // 微信缓存强：加版本号强制刷新预览（bump when OG 设计变更）
    const sep = shareUrl.includes('?') ? '&' : '?';
    shareUrl = `${shareUrl}${sep}og=2`;
    const toCopy = text && text.trim() ? `「${text.trim()}」\n${shareUrl}` : shareUrl;

    try {
      await navigator.clipboard.writeText(toCopy);
      setCopied(true);
      setShowTooltip(true);
      setTimeout(() => {
        setCopied(false);
        setShowTooltip(false);
      }, 2000);
    } catch {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 3000);
    }
  }, [url, text]);

  const baseClass = variant === 'icon'
    ? 'p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-lobster transition-colors'
    : 'px-4 py-2 rounded-lg font-medium flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors';

  return (
    <div className="relative inline-flex">
      <button
        onClick={handleShare}
        className={`${baseClass} ${className}`}
        title="分享"
        aria-label="分享"
      >
        {variant === 'icon' ? (
          <span className="text-xl">{copied ? '✓' : '🔗'}</span>
        ) : (
          <>
            <span>{copied ? '✓' : '🔗'}</span>
            <span>{copied ? '已复制' : '分享'}</span>
          </>
        )}
      </button>
      {showTooltip && !copied && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap">
          复制失败，请手动复制链接
        </span>
      )}
    </div>
  );
}
