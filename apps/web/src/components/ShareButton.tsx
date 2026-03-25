'use client';

import { useState, useCallback, useEffect } from 'react';

interface ShareButtonProps {
  url: string;
  title: string;
  text?: string;
  className?: string;
  variant?: 'icon' | 'button' | 'stat';
  /** variant stat：初始分享次数，服务端 GET 作品时带回 */
  statCount?: number;
  /** 复制成功后 POST，用于累加 shareCount（如 /api/works/xxx/share） */
  recordShareUrl?: string;
}

export function ShareButton({
  url,
  title,
  text,
  className = '',
  variant = 'button',
  statCount = 0,
  recordShareUrl,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [count, setCount] = useState(statCount);

  useEffect(() => {
    setCount(statCount);
  }, [statCount]);

  const handleShare = useCallback(async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    let shareUrl = url.startsWith('http') ? url : `${origin}${url.startsWith('/') ? url : `/${url}`}`;
    const sep = shareUrl.includes('?') ? '&' : '?';
    shareUrl = `${shareUrl}${sep}og=6`;
    const toCopy = text && text.trim() ? `「${text.trim()}」\n${shareUrl}` : shareUrl;

    try {
      await navigator.clipboard.writeText(toCopy);
      setCopied(true);
      setShowTooltip(true);
      if (recordShareUrl) {
        try {
          const res = await fetch(recordShareUrl, { method: 'POST' });
          if (res.ok) {
            const data = await res.json();
            if (typeof data.shareCount === 'number') setCount(data.shareCount);
            else setCount((c) => c + 1);
          } else {
            setCount((c) => c + 1);
          }
        } catch {
          setCount((c) => c + 1);
        }
      }
      setTimeout(() => {
        setCopied(false);
        setShowTooltip(false);
      }, 2000);
    } catch {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 3000);
    }
  }, [url, text, recordShareUrl]);

  if (variant === 'stat') {
    return (
      <div className="relative inline-flex">
        <button
          type="button"
          onClick={handleShare}
          className={`flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-gray-900 transition-colors hover:bg-gray-100/80 ${className}`}
          title={title}
          aria-label={title}
        >
          <svg
            viewBox="0 0 24 24"
            width={22}
            height={22}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden
          >
            {copied ? (
              <path d="M20 6L9 17l-5-5" />
            ) : (
              <>
                <path d="M7 17L17 7" />
                <path d="M7 7h6v6" />
                <path d="M17 17v-6h-6" />
              </>
            )}
          </svg>
          <span className="min-w-[1.25rem] text-[15px] font-normal tabular-nums">{count}</span>
        </button>
        {showTooltip && !copied && (
          <span className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white">
            复制失败，请手动复制链接
          </span>
        )}
      </div>
    );
  }

  const baseClass =
    variant === 'icon'
      ? 'rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-lobster'
      : 'flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-200';

  return (
    <div className="relative inline-flex">
      <button
        type="button"
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
        <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white">
          复制失败，请手动复制链接
        </span>
      )}
    </div>
  );
}
