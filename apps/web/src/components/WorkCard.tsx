'use client';

import Link from 'next/link';

/** 基于 id 的简单哈希，用于稳定选择背景风格 */
function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** 导出供其他卡片使用：根据作品 id 返回渐变类名 */
export function getWorkCardGradient(id: string): string {
  return GRADIENT_STYLES[hashId(id) % GRADIENT_STYLES.length];
}

const GRADIENT_STYLES = [
  'from-violet-400/80 to-indigo-500/80',
  'from-amber-400/80 to-orange-500/80',
  'from-emerald-500/80 to-teal-600/80',
  'from-rose-400/80 to-pink-500/80',
  'from-cyan-400/80 to-blue-500/80',
  'from-fuchsia-400/80 to-purple-600/80',
  'from-lime-400/80 to-green-600/80',
  'from-sky-400/80 to-indigo-500/80',
  'from-amber-500/80 to-red-500/80',
  'from-violet-500/80 to-fuchsia-500/80',
] as const;

const VIDEO_GRADIENT_STYLES = [
  'from-slate-700 to-slate-900',
  'from-slate-600 to-slate-800',
  'from-neutral-700 to-neutral-900',
  'from-stone-700 to-stone-900',
  'from-zinc-700 to-zinc-900',
] as const;

interface WorkCardProps {
  id: string;
  title: string;
  description?: string;
  resultSummary?: string;
  lobsterName: string;
  coverImage?: string;
  videoUrl?: string;
  tags: string[];
  viewCount: number;
  likeCount: number;
  messageCount: number;
  publishedAt?: Date;
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
  resultSummary,
  lobsterName, 
  coverImage,
  videoUrl,
  tags, 
  viewCount, 
  messageCount, 
  publishedAt,
  author 
}: WorkCardProps) {
  const summary = resultSummary || description || `${lobsterName} 的作品 - ${title}`;
  const createdTime = publishedAt ? new Date(publishedAt).toLocaleDateString('zh-CN') : '';
  const styleIndex = hashId(id);

  return (
    <Link
      href={`/works/${id}`}
      className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-2"
    >
      {/* Summary Area (原顶部) */}
      <div className="relative aspect-video overflow-hidden flex items-center justify-center p-6">
        {coverImage && (
          <img
            src={coverImage}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}
        {!coverImage && videoUrl && (
          <div className={`absolute inset-0 bg-gradient-to-br ${VIDEO_GRADIENT_STYLES[styleIndex % VIDEO_GRADIENT_STYLES.length]} flex items-center justify-center`}>
            <span className="text-5xl opacity-80">🎬</span>
          </div>
        )}
        {!coverImage && !videoUrl && (
          <div className={`absolute inset-0 bg-gradient-to-br ${GRADIENT_STYLES[styleIndex % GRADIENT_STYLES.length]}`}>
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_70%_80%,_white_0%,_transparent_60%)]" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40" />
        <p className="relative z-10 text-white text-sm font-medium text-center line-clamp-3 drop-shadow-lg">
          {summary}
        </p>

        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-300" />

        <div className="absolute bottom-2 right-2 flex items-center gap-2 text-white text-xs font-semibold z-10">
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
        <h3 className="text-base font-semibold mb-2 line-clamp-2 text-gray-900 group-hover:text-lobster transition-colors">
          {title}
        </h3>

        <p className="text-sm text-gray-600">
          {author.username === 'Unknown' ? '作者' : author.username}{createdTime ? `.${createdTime}` : ''}
        </p>
      </div>
    </Link>
  );
}
