'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, APIError } from '@/lib/api';

const MAX_LEN = 50_000;
const ACCEPT =
  '.txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*';

type Props = {
  initialText: string;
  onSaved: (text: string | null) => void;
};

export function PersonalResumeSection({ initialText, onSaved }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialText);
  useEffect(() => {
    setText(initialText);
  }, [initialText]);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handleImportFile = useCallback(
    async (list: FileList | null) => {
      const file = list?.[0];
      if (!file) return;
      setImporting(true);
      setErr(null);
      setHint(null);
      try {
        const lower = file.name.toLowerCase();
        let raw = '';
        if (lower.endsWith('.txt') || lower.endsWith('.md')) {
          raw = (await file.text()).trim();
        } else {
          const data = await api.recruitment.extractJdBodyFromFile(file);
          raw = (data.text ?? '').trim();
        }
        if (!raw) {
          setErr('未能从该文件读出正文，请换用 .txt / .md / .docx / .pdf / 常见图片，或检查是否加密/扫描版 PDF。');
          return;
        }
        let mergedFull = '';
        let truncated = false;
        setText((prev) => {
          const p = prev.trim();
          mergedFull = p ? `${p}\n\n--- 来自文件: ${file.name} ---\n\n${raw}` : raw;
          truncated = mergedFull.length > MAX_LEN;
          return truncated ? mergedFull.slice(0, MAX_LEN) : mergedFull;
        });
        setHint(
          truncated
            ? `内容已截断至 ${MAX_LEN} 字（本站上限）；可编辑后保存`
            : '已合并到上方正文，记得点「保存个人简历」',
        );
        setTimeout(() => setHint(null), truncated ? 4500 : 3600);
      } catch (e: unknown) {
        setErr(e instanceof APIError ? e.message : '导入失败');
      } finally {
        setImporting(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setErr(null);
    setHint(null);
    try {
      const trimmed = text.trim();
      await api.auth.updateMe({
        personalResume: trimmed.length === 0 ? null : text.slice(0, MAX_LEN),
      });
      const stored = trimmed.length === 0 ? null : text;
      onSaved(stored);
      setHint(trimmed.length === 0 ? '已清空个人简历' : '已保存');
      setTimeout(() => setHint(null), 2400);
    } catch (e) {
      setErr(e instanceof APIError ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [text, onSaved]);

  return (
    <section className="rounded-2xl border border-violet-500/20 bg-violet-950/20 p-5 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-violet-200">个人简历（自行填写）</h2>
          <p className="mt-1 text-[11px] text-slate-500 leading-relaxed max-w-xl">
            支持导入 .txt / .md / .pdf / .docx 或<strong className="text-slate-400"> 简历截图（图片 OCR）</strong>
            ，内容会追加到正文；保存前可随意编辑。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-hidden
            disabled={importing}
            onChange={(e) => void handleImportFile(e.target.files)}
          />
          <button
            type="button"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
            aria-label="从文件导入简历正文"
            className="rounded-lg border border-violet-500/35 bg-violet-600/15 hover:bg-violet-600/25 disabled:opacity-50 px-3 py-2 text-xs font-medium text-violet-100 transition-colors"
          >
            {importing ? '解析中…' : '导入简历'}
          </button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        maxLength={MAX_LEN}
        placeholder="例如：教育背景、工作经历、代表项目、擅长领域、期望角色与地点……"
        className="mt-3 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-violet-500/40 resize-y min-h-[200px] font-sans leading-relaxed"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-mono text-slate-600">
          {text.length} / {MAX_LEN}
        </span>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition-colors"
        >
          {saving ? '保存中…' : '保存个人简历'}
        </button>
      </div>
      {err && <p className="text-xs text-red-300 mt-2">{err}</p>}
      {hint && <p className="text-xs text-emerald-400/90 mt-2 font-mono">{hint}</p>}
    </section>
  );
}
