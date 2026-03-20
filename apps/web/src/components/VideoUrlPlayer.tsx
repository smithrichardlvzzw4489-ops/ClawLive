'use client';

/**
 * 播放视频 URL，支持直接视频链接、YouTube、Bilibili 等
 * 相对路径（如 /uploads/...）会自动补全为 API 地址，确保跨域部署时能正确加载
 */
interface VideoUrlPlayerProps {
  url: string;
  className?: string;
  poster?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

/** 提取 URL 的路径部分（如 /uploads/works/xxx/file.webm） */
function getPathFromUrl(url: string): string | null {
  try {
    const u = new URL(url, 'http://dummy');
    return u.pathname || null;
  } catch {
    return null;
  }
}

/** 将相对路径或非完整 URL 解析为可访问的绝对地址 */
function resolveVideoUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  const base = API_URL.replace(/\/$/, '');
  // 相对路径（如 /uploads/works/xxx/file.webm）补全为 API 地址
  if (trimmed.startsWith('/')) {
    return base ? `${base}${trimmed}` : trimmed;
  }
  // 完整 URL：若是本项目的 uploads 路径但 host 为 localhost（开发时保存的），重写为当前 API 地址
  if (/^https?:\/\//i.test(trimmed)) {
    const path = getPathFromUrl(trimmed);
    if (path && path.startsWith('/uploads/') && base) {
      try {
        const urlHost = new URL(trimmed).host;
        if (urlHost === 'localhost' || urlHost.startsWith('127.0.0.1')) {
          return `${base}${path}`;
        }
      } catch {}
    }
    return trimmed;
  }
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

export function VideoUrlPlayer({ url, className = '', poster }: VideoUrlPlayerProps) {
  const trimmedUrl = url?.trim();
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

  // 直接视频文件（mp4、webm 等）：相对路径补全为 API 地址
  const videoSrc = resolveVideoUrl(trimmedUrl);
  const isCrossOrigin = videoSrc.startsWith('http') && typeof window !== 'undefined' && !videoSrc.startsWith(window.location.origin);
  return (
    <div className={`w-full overflow-hidden rounded-lg ${className}`}>
      <video
        src={videoSrc}
        controls
        playsInline
        poster={poster}
        crossOrigin={isCrossOrigin ? 'anonymous' : undefined}
        className="w-full max-h-[480px]"
      >
        您的浏览器不支持视频播放
      </video>
    </div>
  );
}
