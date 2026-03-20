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

/** 将相对路径或非完整 URL 解析为可访问的绝对地址 */
function resolveVideoUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  // 已是完整 URL（http/https）或外部链接，直接使用
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // 相对路径（如 /uploads/works/xxx/file.webm）补全为 API 地址
  if (trimmed.startsWith('/')) {
    const base = API_URL.replace(/\/$/, '');
    return base ? `${base}${trimmed}` : trimmed;
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
  return (
    <div className={`w-full overflow-hidden rounded-lg ${className}`}>
      <video
        src={videoSrc}
        controls
        playsInline
        poster={poster}
        className="w-full max-h-[480px]"
      >
        您的浏览器不支持视频播放
      </video>
    </div>
  );
}
