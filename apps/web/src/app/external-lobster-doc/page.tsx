'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/MainLayout';
import { api, APIError } from '@/lib/api';

export default function ExternalLobsterDocPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [document, setDocument] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login?redirect=/external-lobster-doc');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = (await api.auth.externalLobsterDoc()) as {
        skillId: string;
        title: string;
        document: string;
      };
      setTitle(data.title);
      setDocument(data.document);
    } catch (e) {
      if (e instanceof APIError && e.status === 404) {
        setErr('no_doc');
      } else {
        setErr(e instanceof APIError ? e.message : '加载失败');
      }
      setTitle('');
      setDocument('');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyAll = () => {
    if (!document) return;
    void navigator.clipboard.writeText(document);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <MainLayout>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-white">小龙虾接入文档</h1>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          每个账号注册时会自动生成<strong className="text-slate-200">一份专属文档</strong>（含真实{' '}
          <code className="rounded bg-white/10 px-1">clw_</code> Key 与全部 API 说明）。接入外部小龙虾时：点击下方
          <strong className="text-emerald-300">「复制全文」</strong>，粘贴发给 MiniMax / 你的 Agent 即可。
        </p>

        {loading && <p className="mt-8 text-slate-500">加载中…</p>}

        {!loading && err === 'no_doc' && (
          <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
            未找到你的接入文档（多为早期注册的账号）。可在{' '}
            <Link href="/skills?tab=my" className="underline text-emerald-300">
              技能 → 我发布的
            </Link>{' '}
            查看是否有「ClawLab 外部小龙虾」相关技能，或联系管理员补发。
          </div>
        )}

        {!loading && err && err !== 'no_doc' && (
          <p className="mt-8 text-red-300 text-sm">{err}</p>
        )}

        {!loading && !err && document && (
          <>
            <p className="mt-4 text-xs text-slate-500">{title}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyAll()}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 hover:bg-emerald-500"
              >
                {copied ? '已复制全文' : '复制全文（发给小龙虾）'}
              </button>
              <Link
                href="/job-a2a"
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5"
              >
                去 A2A 求职实验室
              </Link>
            </div>
            <pre className="mt-6 max-h-[min(70vh,560px)] overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-[13px] leading-relaxed text-slate-200 whitespace-pre-wrap break-words font-mono">
              {document}
            </pre>
          </>
        )}
      </div>
    </MainLayout>
  );
}
