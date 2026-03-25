'use client';

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { resolveMediaUrl } from '@/lib/api';

export type MdPart =
  | { type: 'text'; text: string }
  | { type: 'image'; alt: string; src: string };

/** 将正文拆成「文本 / 图片」交替片段，便于在编辑区直接显示图片 */
export function splitMarkdownByImages(md: string): MdPart[] {
  const parts: MdPart[] = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    if (m.index > last) parts.push({ type: 'text', text: md.slice(last, m.index) });
    parts.push({ type: 'image', alt: m[1] || '图片', src: m[2] });
    last = m.index + m[0].length;
  }
  if (last < md.length) parts.push({ type: 'text', text: md.slice(last) });
  if (parts.length === 0) parts.push({ type: 'text', text: '' });
  return parts;
}

/** 首尾保证有可编辑文本块，避免纯图片时无法继续输入 */
function splitAndNormalize(md: string): MdPart[] {
  const raw = splitMarkdownByImages(md);
  if (raw.length === 0) return [{ type: 'text', text: '' }];
  const out: MdPart[] = [...raw];
  if (out[0].type === 'image') out.unshift({ type: 'text', text: '' });
  if (out[out.length - 1].type === 'image') out.push({ type: 'text', text: '' });
  return out;
}

function joinMarkdownParts(parts: MdPart[]): string {
  return parts
    .map((p) => (p.type === 'text' ? p.text : `![${p.alt}](${p.src})`))
    .join('');
}

function joinRange(parts: MdPart[], start: number, end: number): string {
  return joinMarkdownParts(parts.slice(start, end));
}

export type FeedPostBodyEditorHandle = {
  insertSnippet: (snippet: string) => void;
};

type Props = {
  initialContent: string;
  onChange: (markdown: string) => void;
  maxLength: number;
  minRows?: number;
  className?: string;
  placeholder?: string;
};

export const FeedPostBodyEditor = forwardRef<FeedPostBodyEditorHandle, Props>(
  function FeedPostBodyEditor(
    { initialContent, onChange, maxLength, minRows = 14, className = '', placeholder = '' },
    ref
  ) {
    const [parts, setParts] = useState<MdPart[]>(() => splitAndNormalize(initialContent));
    const containerRef = useRef<HTMLDivElement>(null);

    const updateTextPart = useCallback(
      (index: number, text: string) => {
        setParts((prev) => {
          const next = prev.map((p, i) => (i === index && p.type === 'text' ? { ...p, text } : p));
          const md = joinMarkdownParts(next).slice(0, maxLength);
          onChange(md);
          return splitAndNormalize(md);
        });
      },
      [maxLength, onChange]
    );

    const removeImageAt = useCallback(
      (index: number) => {
        setParts((prev) => {
          const filtered = prev.filter((_, i) => i !== index);
          const final = filtered.length ? filtered : [{ type: 'text' as const, text: '' }];
          const md = joinMarkdownParts(final).slice(0, maxLength);
          onChange(md);
          return splitAndNormalize(md);
        });
      },
      [maxLength, onChange]
    );

    const insertSnippet = useCallback(
      (snippet: string) => {
        setParts((prev) => {
          const ta = document.activeElement;
          if (
            ta instanceof HTMLTextAreaElement &&
            containerRef.current?.contains(ta) &&
            ta.dataset.partIndex !== undefined
          ) {
            const idx = parseInt(ta.dataset.partIndex, 10);
            if (idx >= 0 && idx < prev.length && prev[idx].type === 'text') {
              const partText = prev[idx].text;
              const start = ta.selectionStart;
              const end = ta.selectionEnd;
              const before = joinRange(prev, 0, idx) + partText.slice(0, start);
              const after = partText.slice(end) + joinRange(prev, idx + 1, prev.length);
              const merged = (before + snippet + after).slice(0, maxLength);
              onChange(merged);
              return splitAndNormalize(merged);
            }
          }
          const base = joinMarkdownParts(prev);
          const merged = (base + snippet).slice(0, maxLength);
          onChange(merged);
          return splitAndNormalize(merged);
        });
      },
      [maxLength, onChange]
    );

    useImperativeHandle(ref, () => ({ insertSnippet }), [insertSnippet]);

    return (
      <div
        ref={containerRef}
        className={`rounded-lg border border-gray-300 bg-white px-4 py-3 focus-within:border-lobster focus-within:ring-2 focus-within:ring-lobster/30 ${className}`}
      >
        <div className="flex min-h-[min(28rem,70vh)] flex-col gap-4 overflow-y-auto">
          {parts.map((part, i) =>
            part.type === 'image' ? (
              <figure key={`img-${i}-${part.src.slice(-24)}`} className="relative mx-auto max-w-full">
                <img
                  src={resolveMediaUrl(part.src)}
                  alt={part.alt}
                  className="max-h-72 w-auto max-w-full rounded-lg border border-gray-100 object-contain shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => removeImageAt(i)}
                  className="mt-2 text-xs text-gray-500 underline hover:text-red-600"
                >
                  移除图片
                </button>
              </figure>
            ) : (
              <textarea
                key={`txt-${i}`}
                data-part-index={i}
                value={part.text}
                onChange={(e) => updateTextPart(i, e.target.value)}
                rows={i === 0 ? minRows : Math.max(4, Math.min(14, part.text.split('\n').length + 2))}
                placeholder={i === 0 ? placeholder : undefined}
                className="w-full resize-y bg-transparent font-mono text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
            )
          )}
        </div>
      </div>
    );
  }
);
