'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { resolveMediaUrl } from '@/lib/api';

// ── 公用类型 & 工具（供渲染层使用）─────────────────────────────────────────

export type MdPart =
  | { type: 'text'; text: string }
  | { type: 'image'; alt: string; src: string };

/**
 * 将 Markdown 字符串拆成「文本 / 图片」交替片段，供帖子详情页渲染使用。
 * 兼容两种格式：
 *   旧格式  ![alt](url)        —— 标准 Markdown 图片
 *   新格式  [alt](/uploads/…)  —— 以 /uploads/ 开头的链接视为图片
 */
export function splitMarkdownByImages(md: string): MdPart[] {
  const parts: MdPart[] = [];
  // 同时匹配  ![alt](url)  和  [alt](/uploads/…)
  const re = /(?:!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]*)\]\((\/uploads\/[^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    if (m.index > last) parts.push({ type: 'text', text: md.slice(last, m.index) });
    // m[1]/m[2] = 旧格式；m[3]/m[4] = 新格式
    parts.push({ type: 'image', alt: (m[1] ?? m[3]) || '图片', src: m[2] ?? m[4] ?? '' });
    last = m.index + m[0].length;
  }
  if (last < md.length) parts.push({ type: 'text', text: md.slice(last) });
  if (parts.length === 0) parts.push({ type: 'text', text: '' });
  return parts;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Handle ────────────────────────────────────────────────────────────────────

export type FeedPostBodyEditorHandle = {
  insertSnippet: (snippet: string) => void;
  captureSelectionNow: () => void;
};

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  initialContent: string;
  onChange: (markdown: string) => void;
  maxLength: number;
  minRows?: number;
  className?: string;
  placeholder?: string;
};

// ── 编辑器组件 ────────────────────────────────────────────────────────────────
//
// 设计：单个 <textarea>，光标跟踪简单可靠。
// 图片以「缩略图条」方式展示在 textarea 下方（带 × 移除按钮）。
//
// 图片格式（新）：[图片](url)   ← 无 ! 前缀，对用户更友好
// 图片格式（旧）：![图片](url)  ← 旧帖子向下兼容，解析时同样识别

export const FeedPostBodyEditor = forwardRef<FeedPostBodyEditorHandle, Props>(
  function FeedPostBodyEditor(
    { initialContent, onChange, maxLength, minRows = 14, className = '', placeholder = '' },
    ref,
  ) {
    const [value, setValue] = useState(initialContent);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // 始终保持最新值，insertSnippet 用此读取避免闭包旧值
    const valueRef = useRef(initialContent);
    // 上次确认的插入点；由事件持续更新，captureSelectionNow 做精确覆盖
    const insertPosRef = useRef<number>(initialContent.length);
    // 插入后要恢复的光标位置
    const nextCursorRef = useRef<number | null>(null);

    // ── 内部工具 ──────────────────────────────────────────────────────────────

    const syncValue = useCallback(
      (v: string) => {
        const t = v.slice(0, maxLength);
        valueRef.current = t;
        setValue(t);
        onChange(t);
      },
      [maxLength, onChange],
    );

    const trackCursor = useCallback((ta: HTMLTextAreaElement) => {
      insertPosRef.current = ta.selectionStart;
    }, []);

    // ── 对外 handle ───────────────────────────────────────────────────────────

    /**
     * 在父组件"插入图片"按钮 onMouseDown 时调用。
     * 此时 textarea 仍有焦点，直接从 DOM 读取精确的光标位置。
     */
    const captureSelectionNow = useCallback(() => {
      const ta = textareaRef.current;
      if (ta) insertPosRef.current = ta.selectionStart;
    }, []);

    const insertSnippet = useCallback(
      (snippet: string) => {
        const cur = valueRef.current;
        const pos = Math.min(insertPosRef.current, cur.length);
        const next = (cur.slice(0, pos) + snippet + cur.slice(pos)).slice(0, maxLength);
        nextCursorRef.current = Math.min(pos + snippet.length, maxLength);
        syncValue(next);
      },
      [maxLength, syncValue],
    );

    useImperativeHandle(ref, () => ({ insertSnippet, captureSelectionNow }), [
      insertSnippet,
      captureSelectionNow,
    ]);

    // ── 插入后恢复焦点 & 光标 ────────────────────────────────────────────────
    useEffect(() => {
      if (nextCursorRef.current === null) return;
      const pos = nextCursorRef.current;
      nextCursorRef.current = null;
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(pos, pos);
        insertPosRef.current = pos;
      }
    });

    // ── 底部缩略图条：解析正文中的图片 ──────────────────────────────────────
    // 同时识别新格式 [alt](/uploads/…) 和旧格式 ![alt](url)
    const embeddedImages = useMemo(() => {
      const parts = splitMarkdownByImages(value);
      return parts
        .filter((p): p is Extract<MdPart, { type: 'image' }> => p.type === 'image')
        .map((p) => ({ alt: p.alt, src: p.src }));
    }, [value]);

    const removeImage = useCallback(
      (src: string) => {
        const esc = escapeRegex(src);
        // 同时匹配 [alt](src) 和 ![alt](src)
        const cleaned = valueRef.current
          .replace(new RegExp(`\\n?!?\\[[^\\]]*\\]\\(${esc}\\)\\n?`, 'g'), '\n')
          .replace(/\n{3,}/g, '\n\n');
        syncValue(cleaned);
      },
      [syncValue],
    );

    // ── 渲染 ──────────────────────────────────────────────────────────────────

    return (
      <div
        className={`rounded-lg border border-gray-300 bg-white focus-within:border-lobster focus-within:ring-2 focus-within:ring-lobster/30 ${className}`}
      >
        <textarea
          ref={textareaRef}
          value={value}
          rows={minRows}
          placeholder={placeholder}
          className="w-full resize-y bg-transparent px-4 py-3 font-mono text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:outline-none"
          onChange={(e) => syncValue(e.target.value)}
          onSelect={(e) => trackCursor(e.currentTarget)}
          onKeyUp={(e) => trackCursor(e.currentTarget)}
          onMouseUp={(e) => trackCursor(e.currentTarget)}
          onFocus={(e) => trackCursor(e.currentTarget)}
        />

        {embeddedImages.length > 0 && (
          <div className="border-t border-gray-100 px-3 py-2">
            <p className="mb-1.5 text-xs text-gray-400">已插入图片（悬停后点击 × 可移除）</p>
            <div className="flex flex-wrap gap-2">
              {embeddedImages.map((img, idx) => (
                <div key={`${idx}-${img.src.slice(-16)}`} className="group relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveMediaUrl(img.src)}
                    alt={img.alt}
                    className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(img.src)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-white shadow transition hover:bg-red-600 md:opacity-0 md:group-hover:opacity-100"
                    title="移除此图片"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
);
