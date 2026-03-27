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

  /** 去掉「紧邻图片」两侧多余换行，避免 textarea 出现大片空行 */
  for (let i = 0; i < out.length; i++) {
    if (out[i].type !== 'text') continue;
    const t = out[i] as MdPart & { type: 'text' };
    if (i + 1 < out.length && out[i + 1].type === 'image') {
      t.text = t.text.replace(/\n+$/g, '');
    }
    if (i > 0 && out[i - 1].type === 'image') {
      t.text = t.text.replace(/^\n+/g, '');
    }
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

export type FeedPostBodyEditorHandle = {
  /** 在当前光标位置插入 markdown 片段 */
  insertSnippet: (snippet: string) => void;
  /**
   * 在父组件按钮 onMouseDown 时调用，此时光标还在 textarea 里。
   * 把当前选区保存到内部 ref，供后续 insertSnippet 使用。
   */
  captureSelectionNow: () => void;
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

    /**
     * 记录「最近一次确认的」光标位置。
     * 由两条路径写入：
     *   1. textarea onFocus / onSelect（用户交互时实时更新）
     *   2. captureSelectionNow()（父组件在按钮 onMouseDown 时主动调用，
     *      此时焦点还没有离开 textarea，是最精确的时机）
     */
    const lastSelRef = useRef<{ partIndex: number; start: number; end: number } | null>(null);

    /** 首段 textarea 行数：随内容增高，避免仅两行字却占满 18 行导致与图片距离过大 */
    const rowsForTextPart = useCallback(
      (part: MdPart, index: number) => {
        if (part.type !== 'text') return 4;
        const lines = part.text.split('\n');
        let end = lines.length;
        while (end > 0 && lines[end - 1] === '') end--;
        const contentLines = Math.max(1, end);
        const padded = contentLines + 1;
        if (index === 0) {
          return Math.max(3, Math.min(minRows, padded));
        }
        return Math.max(3, Math.min(14, padded));
      },
      [minRows],
    );

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

    /**
     * captureSelectionNow：从 DOM 实时读取当前 textarea 的光标。
     * 父组件在插入图片按钮的 onMouseDown 里调用——此时焦点尚未从 textarea 离开，
     * 所以 document.activeElement 一定是用户光标所在的 textarea。
     */
    const captureSelectionNow = useCallback(() => {
      const ta = document.activeElement;
      if (
        ta instanceof HTMLTextAreaElement &&
        containerRef.current?.contains(ta) &&
        ta.dataset.partIndex !== undefined
      ) {
        lastSelRef.current = {
          partIndex: parseInt(ta.dataset.partIndex, 10),
          start: ta.selectionStart,
          end: ta.selectionEnd,
        };
      }
    }, []);

    const insertSnippet = useCallback(
      (snippet: string) => {
        setParts((prev) => {
          const sel = lastSelRef.current;
          let merged: string;

          if (sel) {
            const { partIndex: idx, start, end } = sel;
            if (idx >= 0 && idx < prev.length && prev[idx].type === 'text') {
              const partText = (prev[idx] as MdPart & { type: 'text' }).text;
              // clamp start/end 防止 partText 在上次插入后已变短
              const s = Math.min(start, partText.length);
              const e = Math.min(end, partText.length);
              const before = joinRange(prev, 0, idx) + partText.slice(0, s);
              const after = partText.slice(e) + joinRange(prev, idx + 1, prev.length);
              merged = (before + snippet + after).slice(0, maxLength);
            } else {
              // partIndex 已超出 parts 范围（结构变化），追加到末尾
              merged = (joinMarkdownParts(prev) + snippet).slice(0, maxLength);
            }
          } else {
            merged = (joinMarkdownParts(prev) + snippet).slice(0, maxLength);
          }

          onChange(merged);
          return splitAndNormalize(merged);
        });
      },
      [maxLength, onChange]
    );

    useImperativeHandle(ref, () => ({ insertSnippet, captureSelectionNow }), [insertSnippet, captureSelectionNow]);

    return (
      <div
        ref={containerRef}
        className={`rounded-lg border border-gray-300 bg-white px-4 py-3 focus-within:border-lobster focus-within:ring-2 focus-within:ring-lobster/30 ${className}`}
      >
        <div className="flex max-h-[min(70vh,36rem)] min-h-0 flex-col gap-2 overflow-y-auto">
          {parts.map((part, i) =>
            part.type === 'image' ? (
              <figure key={`img-${i}-${part.src.slice(-24)}`} className="relative mx-auto max-w-full shrink-0">
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
                onSelect={(e) => {
                  const ta = e.currentTarget;
                  lastSelRef.current = { partIndex: i, start: ta.selectionStart, end: ta.selectionEnd };
                }}
                onFocus={(e) => {
                  const ta = e.currentTarget;
                  lastSelRef.current = { partIndex: i, start: ta.selectionStart, end: ta.selectionEnd };
                }}
                rows={rowsForTextPart(part, i)}
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
