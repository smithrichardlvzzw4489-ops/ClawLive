'use client';

import type { Components } from 'react-markdown';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { resolveMediaUrl } from '@/lib/api';

/** 允许 data: 内联图等，其余走默认安全策略（相对路径 /uploads 等默认可用） */
function markdownUrlTransform(url: string): string {
  if (url.startsWith('data:')) return url;
  return defaultUrlTransform(url);
}

const components: Components = {
  h1: ({ children }) => <h1 className="mb-3 mt-4 text-2xl font-bold text-gray-900 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-xl font-semibold text-gray-900">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-3 text-lg font-semibold text-gray-900">{children}</h3>,
  p: ({ children }) => <p className="mb-3 leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-6">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-gray-300 pl-4 italic text-gray-600">{children}</blockquote>
  ),
  hr: () => <hr className="my-6 border-gray-200" />,
  a: ({ href, children }) => (
    <a href={href} className="font-medium text-lobster underline decoration-lobster/30 hover:decoration-lobster" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ src, alt }) => {
    const raw = typeof src === 'string' ? src : '';
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={raw ? resolveMediaUrl(raw) : ''}
        alt={typeof alt === 'string' ? alt : ''}
        className="my-3 max-h-[min(28rem,70vh)] w-full rounded-lg object-contain"
        loading="lazy"
      />
    );
  },
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className?.startsWith('language-'));
    if (isBlock) {
      return (
        <code className={`block font-mono text-sm text-gray-100 ${className || ''}`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.9em] text-gray-800" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-3 overflow-x-auto rounded-lg border border-gray-200 bg-gray-900 p-3 text-gray-100 [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full min-w-[16rem] border-collapse border border-gray-200 text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
  th: ({ children }) => <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-gray-200 px-2 py-1.5">{children}</td>,
  tr: ({ children }) => <tr>{children}</tr>,
};

export function MarkdownBody({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`markdown-body text-[15px] leading-relaxed text-gray-800 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={markdownUrlTransform}>
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}
