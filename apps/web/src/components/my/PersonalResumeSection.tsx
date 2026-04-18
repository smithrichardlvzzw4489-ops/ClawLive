'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, APIError } from '@/lib/api';

type Props = {
  initialText: string;
  onSaved: (text: string | null) => void;
};

export function PersonalResumeSection({ initialText, onSaved }: Props) {
  const [text, setText] = useState(initialText);
  useEffect(() => {
    setText(initialText);
  }, [initialText]);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = useCallback(async () => {
    setSaving(true);
    setErr(null);
    setHint(null);
    try {
      const trimmed = text.trim();
      await api.auth.updateMe({
        personalResume: trimmed.length === 0 ? null : text,
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
      <h2 className="text-sm font-semibold text-violet-200">个人简历（自行填写）</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        maxLength={50_000}
        placeholder="例如：教育背景、工作经历、代表项目、擅长领域、期望角色与地点……"
        className="mt-3 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-violet-500/40 resize-y min-h-[200px] font-sans leading-relaxed"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-mono text-slate-600">{text.length} / 50000</span>
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
