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

/** 将 Markdown 字符串拆成「文本 / 图片」交替片段，供帖子详情页渲染使用 */
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

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── 编辑器 handle ────────────────────────────────────────────────────────────

export type FeedPostBodyEditorHandle = {
  /** 在当前光标位置插入 markdown 片段（异步上传回调时调用） */
  insertSnippet: (snippet: string) => void;
  /**
   * 父组件在"插入图片"按钮 onMouseDown 时调用。
   * 此时 textarea 仍有焦点，可精确读取光标位置。
   */
  captureSelectionNow: () => void;
};

// ── 编辑器 Props ─────────────────────────────────────────────────────────────

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
// 设计原则：
//   • 使用 **单个 <textarea>**，不再拆分成多个可编辑块。
//   • 光标位置通过 insertPosRef 持续跟踪（onSelect / onKeyUp / onMouseUp / onFocus）。
//   • captureSelectionNow() 在按钮 onMouseDown 时直接从 DOM 读取，100% 精确。
//   • insertSnippet() 利用 insertPosRef 做字符串拼接，之后通过 nextCursorRef +
//     useEffect 恢复焦点和光标。
//   • 已插入的图片作为缩略图条显示在 textarea 下方，带「×」移除按钮。

export const FeedPostBodyEditor = forwardRef<FeedPostBodyEditorHandle, Props>(
  function FeedPostBodyEditor(
    { initialContent, onChange, maxLength, minRows = 14, className = '', placeholder = '' },
    ref,
  ) {
    const [value, setValue] = useState(initialContent);

    // 始终保持最新值，避免 insertSnippet 因闭包读到旧值
    const valueRef = useRef(initialContent);

    // 最后一次确认的光标插入点（由事件持续更新）
    const insertPosRef = useRef<number>(initialContent.length);

    // 插入后需要恢复的光标位置（交给 useEffect 执行）
    const nextCursorRef = useRef<number | null>(null);

    const textareaRef = useRef<HTMLTextAreaElement>(null);

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

    // ── 对外暴露的 handle ─────────────────────────────────────────────────────

    /** 在按钮 onMouseDown 时调用：此时 textarea 仍有焦点，直接从 DOM 读取 */
    const captureSelectionNow = useCallback(() => {
      const ta = textareaRef.current;
      if (ta) {
        insertPosRef.current = ta.selectionStart;
      }
    }, []);

    /** 把 snippet 插入到 insertPosRef 指向的位置 */
    const insertSnippet = useCallback(
      (snippet: string) => {
        const cur = valueRef.current;
        const pos = Math.min(insertPosRef.current, cur.length);
        const next = (cur.slice(0, pos) + snippet + cur.slice(pos)).slice(0, maxLength);
        const cursorAfter = Math.min(pos + snippet.length, maxLength);
        nextCursorRef.current = cursorAfter;
        syncValue(next);
      },
      [maxLength, syncValue],
    );

    useImperativeHandle(ref, () => ({ insertSnippet, captureSelectionNow }), [
      insertSnippet,
      captureSelectionNow,
    ]);

    // ── 插入后恢复焦点 & 光标 ────────────────────────────────────────────────
    // 每次渲染后检查，一次性消费 nextCursorRef
    useEffect(() => {
      if (nextCursorRef.current !== null) {
        const pos = nextCursorRef.current;
        nextCursorRef.current = null;
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(pos, pos);
          insertPosRef.current = pos;
        }
      }
    });

    // ── 底部缩略图条：解析正文中的图片 ──────────────────────────────────────
    const embeddedImages = useMemo(() => {
      const parts = splitMarkdownByImages(value);
      return parts
        .filter((p): p is Extract<MdPart, { type: 'image' }> => p.type === 'image')
        .map((p) => ({ alt: p.alt, src: p.src }));
    }, [value]);

    const removeImage = useCallback(
      (src: string) => {
        const esc = escapeRegex(src);
        const cleaned = valueRef.current
          .replace(new RegExp(`\\n?!\\[[^\\]]*\\]\\(${esc}\\)\\n?`, 'g'), '\n')
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
