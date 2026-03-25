'use client';

import type { Components } from 'react-markdown';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { resolveMediaUrl } from '@/lib/api';
import { articleFontPresetClass, useArticleFont } from '@/components/ArticleFontProvider';

/** 允许 data: 内联图等，其余走默认安全策略（相对路径 /uploads 等默认可用） */
function markdownUrlTransform(url: string): string {
  if (url.startsWith('data:')) return url;
  return defaultUrlTransform(url);
}

const components: Components = {
  a: ({ href, children }) => {
    const hrefStr = typeof href === 'string' ? href : '';
    const external = /^https?:\/\//i.test(hrefStr);
    return (
      <a
        href={hrefStr}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
      >
        {children}
      </a>
    );
  },
  img: ({ src, alt }) => {
    const raw = typeof src === 'string' ? src : '';
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={raw ? resolveMediaUrl(raw) : ''}
        alt={typeof alt === 'string' ? alt : ''}
        className="my-4 max-h-[min(28rem,70vh)] w-full rounded-lg object-contain shadow-sm"
        loading="lazy"
      />
    );
  },
};

export function MarkdownBody({ content, className = '' }: { content: string; className?: string }) {
  const { preset } = useArticleFont();
  const fontClass = articleFontPresetClass[preset];

  return (
    <div
      className={`markdown-body prose prose-gray max-w-none text-pretty antialiased ${fontClass} prose-headings:scroll-mt-24 prose-p:leading-[1.75] prose-li:leading-relaxed prose-blockquote:border-l-lobster/40 prose-blockquote:font-normal prose-a:font-medium prose-img:mx-auto ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={markdownUrlTransform}>
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}
