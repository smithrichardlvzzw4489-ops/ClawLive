'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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

/** 首尾保证有可编辑文本块，图片两侧多余换行也会被清理 */
function splitAndNormalize(md: string): MdPart[] {
  const raw = splitMarkdownByImages(md);
  if (raw.length === 0) return [{ type: 'text', text: '' }];
  const out: MdPart[] = [...raw];
  if (out[0].type === 'image') out.unshift({ type: 'text', text: '' });
  if (out[out.length - 1].type === 'image') out.push({ type: 'text', text: '' });
  for (let i = 0; i < out.length; i++) {
    if (out[i].type !== 'text') continue;
    const t = out[i] as MdPart & { type: 'text' };
    if (i + 1 < out.length && out[i + 1].type === 'image') t.text = t.text.replace(/\n+$/g, '');
    if (i > 0 && out[i - 1].type === 'image') t.text = t.text.replace(/^\n+/g, '');
  }
  return out;
}

function joinMarkdownParts(parts: MdPart[]): string {
  let out = '';
  for (const p of parts) {
    if (p.type === 'text') {
      out += p.text;
    } else {
      if (out.length > 0 && !out.endsWith('\n')) out += '\n';
      out += `![${p.alt}](${p.src})`;
    }
  }
  return out;
}

function joinRange(parts: MdPart[], start: number, end: number): string {
  return joinMarkdownParts(parts.slice(start, end));
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
// 设计原则：
//   • 多段 textarea + 图片内联渲染（用户可直接看到已插入的图片）
//   • 光标跟踪：用 textareaRefsMap（Map<partIndex, HTMLTextAreaElement>）存每个
//     textarea 的 DOM ref；captureSelectionNow() 在按钮 onMouseDown 时直接从 DOM
//     读取 selectionStart，不依赖 document.activeElement（该 API 在 mousedown 时
//     焦点已切换到按钮，不可靠）
//   • lastSelRef 由 onFocus / onSelect / onKeyUp / onMouseUp 持续更新，作为日常
//     备份；captureSelectionNow() 在异步上传前做最终精确确认

export const FeedPostBodyEditor = forwardRef<FeedPostBodyEditorHandle, Props>(
  function FeedPostBodyEditor(
    { initialContent, onChange, maxLength, minRows = 14, className = '', placeholder = '' },
    ref,
  ) {
    const [parts, setParts] = useState<MdPart[]>(() => splitAndNormalize(initialContent));

    // partIndex -> 对应 textarea 的 DOM 节点
    const textareaRefsMap = useRef<Map<number, HTMLTextAreaElement>>(new Map());
    // 最后一次获得焦点的 textarea 的 part 下标
    const lastFocusedIdxRef = useRef<number | null>(null);
    // 最后确认的光标位置（由事件持续更新，captureSelectionNow 做精确覆盖）
    const lastSelRef = useRef<{ partIndex: number; start: number; end: number } | null>(null);
    // 插入图片后需要自动聚焦的 part 下标（图片后面紧跟的文字段）
    const nextFocusPartIdxRef = useRef<number | null>(null);

    // ── 辅助：更新光标 ref（统一入口）────────────────────────────────────────
    const updateSel = useCallback((i: number, ta: HTMLTextAreaElement) => {
      lastFocusedIdxRef.current = i;
      lastSelRef.current = { partIndex: i, start: ta.selectionStart, end: ta.selectionEnd };
    }, []);

    // ── 行数自适应 ────────────────────────────────────────────────────────────
    const rowsForTextPart = useCallback(
      (part: MdPart, index: number) => {
        if (part.type !== 'text') return 4;
        const lines = part.text.split('\n');
        let end = lines.length;
        while (end > 0 && lines[end - 1] === '') end--;
        const contentLines = Math.max(1, end);
        const padded = contentLines + 1;
        return index === 0
          ? Math.max(3, Math.min(minRows, padded))
          : Math.max(3, Math.min(14, padded));
      },
      [minRows],
    );

    // ── 修改某段文字 ──────────────────────────────────────────────────────────
    const updateTextPart = useCallback(
      (index: number, text: string) => {
        setParts((prev) => {
          const next = prev.map((p, i) => (i === index && p.type === 'text' ? { ...p, text } : p));
          const md = joinMarkdownParts(next).slice(0, maxLength);
          onChange(md);
          return splitAndNormalize(md);
        });
      },
      [maxLength, onChange],
    );

    // ── 移除某个图片 ──────────────────────────────────────────────────────────
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
      [maxLength, onChange],
    );

    // ── captureSelectionNow ───────────────────────────────────────────────────
    // 在父组件"插入图片"按钮的 onMouseDown 里调用。
    // 此时浏览器的 mousedown 尚未完全处理（焦点还在 textarea），
    // 可以从 textareaRefsMap 直接读到精确的 selectionStart。
    const captureSelectionNow = useCallback(() => {
      const idx = lastFocusedIdxRef.current;
      if (idx === null) return;
      const ta = textareaRefsMap.current.get(idx);
      if (ta) {
        lastSelRef.current = {
          partIndex: idx,
          start: ta.selectionStart,
          end: ta.selectionEnd,
        };
      }
    }, []);

    // ── insertSnippet ─────────────────────────────────────────────────────────
    // 用 lastSelRef 里保存的 partIndex + 偏移量做字符串拼接，
    // 不依赖 document.activeElement 或 React 渲染时序。
    const insertSnippet = useCallback(
      (snippet: string) => {
        // 提取本次要插入的图片 URL，用于插入后自动定位光标
        const urlMatch = snippet.match(/!\[[^\]]*\]\(([^)]+)\)/);
        const insertedUrl = urlMatch ? urlMatch[1] : null;

        setParts((prev) => {
          const sel = lastSelRef.current;
          let merged: string;

          if (sel) {
            const { partIndex: idx, start, end } = sel;
            if (idx >= 0 && idx < prev.length && prev[idx].type === 'text') {
              const partText = (prev[idx] as MdPart & { type: 'text' }).text;
              // clamp：防止上次插入后 partText 已变短而越界
              const s = Math.min(start, partText.length);
              const e = Math.min(end, partText.length);
              const before = joinRange(prev, 0, idx) + partText.slice(0, s);
              const after = partText.slice(e) + joinRange(prev, idx + 1, prev.length);
              merged = (before + snippet + after).slice(0, maxLength);
            } else {
              merged = (joinMarkdownParts(prev) + snippet).slice(0, maxLength);
            }
          } else {
            merged = (joinMarkdownParts(prev) + snippet).slice(0, maxLength);
          }

          const newParts = splitAndNormalize(merged);

          // 插入后把光标自动移到图片后面那段文字，避免下次插入定位错误
          if (insertedUrl) {
            const imgIdx = newParts.findIndex(
              (p) => p.type === 'image' && (p as MdPart & { type: 'image' }).src === insertedUrl,
            );
            if (imgIdx >= 0 && imgIdx + 1 < newParts.length) {
              nextFocusPartIdxRef.current = imgIdx + 1;
            }
          }

          onChange(merged);
          return newParts;
        });
      },
      [maxLength, onChange],
    );

    useImperativeHandle(ref, () => ({ insertSnippet, captureSelectionNow }), [
      insertSnippet,
      captureSelectionNow,
    ]);

    // ── 插入图片后自动聚焦图片后的文字段 ────────────────────────────────────
    // 每次渲染后消费 nextFocusPartIdxRef，把焦点和光标移到图片紧后的 textarea，
    // 确保下一次"插入图片"能从正确位置开始，而不是停留在上一段文字里。
    useEffect(() => {
      if (nextFocusPartIdxRef.current === null) return;
      const idx = nextFocusPartIdxRef.current;
      nextFocusPartIdxRef.current = null;
      const ta = textareaRefsMap.current.get(idx);
      if (ta) {
        ta.focus();
        ta.setSelectionRange(0, 0);
        lastFocusedIdxRef.current = idx;
        lastSelRef.current = { partIndex: idx, start: 0, end: 0 };
      }
    });

    // ── 渲染 ──────────────────────────────────────────────────────────────────

    return (
      <div
        className={`rounded-lg border border-gray-300 bg-white px-4 py-3 focus-within:border-lobster focus-within:ring-2 focus-within:ring-lobster/30 ${className}`}
      >
        <div className="flex max-h-[min(70vh,36rem)] min-h-0 flex-col gap-2 overflow-y-auto">
          {parts.map((part, i) =>
            part.type === 'image' ? (
              <figure
                key={`img-${i}-${part.src.slice(-24)}`}
                className="relative mx-auto max-w-full shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveMediaUrl(part.src)}
                  alt={part.alt}
                  className="max-h-72 w-auto max-w-full rounded-lg border border-gray-100 object-contain shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => removeImageAt(i)}
                  className="mt-1.5 text-xs text-gray-500 underline hover:text-red-600"
                >
                  移除图片
                </button>
              </figure>
            ) : (
              <textarea
                key={`txt-${i}`}
                ref={(el) => {
                  if (el) textareaRefsMap.current.set(i, el);
                  else textareaRefsMap.current.delete(i);
                }}
                data-part-index={i}
                value={part.text}
                onChange={(e) => updateTextPart(i, e.target.value)}
                onFocus={(e) => updateSel(i, e.currentTarget)}
                onSelect={(e) => updateSel(i, e.currentTarget)}
                onKeyUp={(e) => updateSel(i, e.currentTarget)}
                onMouseUp={(e) => updateSel(i, e.currentTarget)}
                rows={rowsForTextPart(part, i)}
                placeholder={i === 0 ? placeholder : undefined}
                className="w-full resize-y bg-transparent font-mono text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
            ),
          )}
        </div>
      </div>
    );
  },
);
