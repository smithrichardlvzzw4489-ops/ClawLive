'use client';

import { useState, useEffect } from 'react';

/**
 * 播放视频 URL，支持直接视频链接、YouTube、Bilibili 等
 * 本项目的 /uploads/ 视频统一走代理，彻底解决跨域问题
 */
interface VideoUrlPlayerProps {
  url: string;
  className?: string;
  poster?: string;
}

/** 提取 URL 的路径部分（如 /uploads/works/xxx/file.webm） */
function getPathFromUrl(url: string): string | null {
  try {
    const u = new URL(url, 'http://dummy');
    return u.pathname || null;
  } catch {
    return null;
  }
}

/**
 * 解析视频地址：本项目的 uploads 视频统一走 Next.js 代理（同源，无跨域）
 * 外部链接（YouTube、Bilibili、其他）直接使用
 */
function resolveVideoUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const path = trimmed.startsWith('/') ? trimmed : getPathFromUrl(trimmed);
  if (path && path.startsWith('/uploads/')) {
    return `/api/video-proxy?path=${encodeURIComponent(path)}`;
  }
  if (trimmed.startsWith('/')) return trimmed;
  return trimmed;
}

function getYouTubeEmbedUrl(url: string): string {
  let videoId = '';
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?#]+)/);
  if (youtubeMatch) videoId = youtubeMatch[1];
  return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
}

function getBilibiliEmbedUrl(url: string): string {
  const bvMatch = url.match(/video\/(BV[a-zA-Z0-9]+)/);
  const avMatch = url.match(/av(\d+)/);
  if (bvMatch) {
    return `https://player.bilibili.com/player.html?bvid=${bvMatch[1]}&high_quality=1`;
  }
  if (avMatch) {
    return `https://player.bilibili.com/player.html?aid=${avMatch[1]}&high_quality=1`;
  }
  return '';
}

type LoadState = 'idle' | 'loading' | 'ready' | 'not_found' | 'error';

export function VideoUrlPlayer({ url, className = '', poster }: VideoUrlPlayerProps) {
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const trimmedUrl = url?.trim();
  const videoSrc = trimmedUrl ? resolveVideoUrl(trimmedUrl) : '';
  const isProxyUrl = videoSrc.startsWith('/api/video-proxy');

  // 代理视频：预检是否存在，避免黑屏无提示
  useEffect(() => {
    if (!isProxyUrl || !videoSrc) return;
    setLoadState('loading');
    fetch(videoSrc, { method: 'HEAD' })
      .then((r) => {
        if (r.ok) setLoadState('ready');
        else if (r.status === 404) setLoadState('not_found');
        else setLoadState('error');
      })
      .catch(() => setLoadState('error'));
  }, [videoSrc, isProxyUrl]);

  if (!trimmedUrl) return null;

  // YouTube 嵌入
  const ytEmbed = getYouTubeEmbedUrl(trimmedUrl);
  if (ytEmbed) {
    return (
      <div className={`aspect-video w-full overflow-hidden rounded-lg ${className}`}>
        <iframe
          src={ytEmbed}
          title="YouTube video"
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  // Bilibili 嵌入
  const biliEmbed = getBilibiliEmbedUrl(trimmedUrl);
  if (biliEmbed) {
    return (
      <div className={`aspect-video w-full overflow-hidden rounded-lg ${className}`}>
        <iframe
          src={biliEmbed}
          title="Bilibili video"
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  // 直接视频文件：uploads 走代理（同源），外部链接直接使用
  if (isProxyUrl) {
    if (loadState === 'loading') {
      return (
        <div className={`flex flex-col items-center justify-center bg-gray-100 rounded-lg p-8 ${className}`}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-lobster mb-3" />
          <p className="text-gray-600 text-sm">加载视频中...</p>
        </div>
      );
    }
    if (loadState === 'not_found') {
      return (
        <div className={`flex flex-col items-center justify-center bg-amber-50 border border-amber-200 rounded-lg p-8 ${className}`}>
          <p className="text-amber-800 font-medium mb-1">视频文件不存在</p>
          <p className="text-amber-700 text-sm">若为旧作品，视频可能已过期。请重新录制并上传视频后发布。</p>
        </div>
      );
    }
    if (loadState === 'error') {
      return (
        <div className={`flex flex-col items-center justify-center bg-gray-100 rounded-lg p-8 ${className}`}>
          <p className="text-gray-600 mb-2">视频加载失败</p>
          <p className="text-sm text-gray-500">请检查网络或稍后重试。若持续失败，请确认 Vercel 已配置 NEXT_PUBLIC_API_URL。</p>
        </div>
      );
    }
  }

  return (
    <div className={`w-full overflow-hidden rounded-lg ${className}`}>
      <video
        src={loadState === 'ready' || !isProxyUrl ? videoSrc : undefined}
        controls
        playsInline
        poster={poster}
        className="w-full max-h-[480px]"
        onError={() => setLoadState('error')}
      >
        您的浏览器不支持视频播放
      </video>
    </div>
  );
}
