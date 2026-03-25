'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/lib/i18n/LocaleContext';

export interface WorkCommentItem {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; username: string; avatarUrl?: string | null };
}

export function WorkCommentsSection({
  workId,
  onCountChange,
}: {
  workId: string;
  onCountChange?: (n: number) => void;
}) {
  const { t } = useLocale();
  const [comments, setComments] = useState<WorkCommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(typeof window !== 'undefined' ? localStorage.getItem('token') : null);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works/${workId}/comments`);
      if (res.ok) {
        const data = await res.json();
        const list = data.comments || [];
        setComments(list);
        onCountChange?.(list.length);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [workId, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    const tkn = localStorage.getItem('token');
    if (!tkn || !text.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/works/${workId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tkn}`,
        },
        body: JSON.stringify({ content: text.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        const c = data.comment;
        if (c) {
          setComments((prev) => {
            const next = [...prev, c];
            onCountChange?.(next.length);
            return next;
          });
        }
        setText('');
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="mt-8 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-bold text-gray-900">{t('workDetail.commentsTitle')}</h3>

      {token ? (
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('workDetail.commentsPlaceholder')}
            rows={3}
            className="min-h-[5rem] flex-1 resize-y rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-lobster/40 focus:outline-none focus:ring-2 focus:ring-lobster/15"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending || !text.trim()}
            className="shrink-0 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? t('workDetail.commentsSending') : t('workDetail.commentsSubmit')}
          </button>
        </div>
      ) : (
        <p className="mb-6 text-sm text-gray-500">
          <Link href={`/login?redirect=/works/${workId}`} className="font-medium text-lobster hover:underline">
            {t('login')}
          </Link>
          <span className="text-gray-500"> · {t('workDetail.commentsNeedLogin')}</span>
        </p>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">{t('loading')}</div>
      ) : comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">{t('workDetail.commentsEmpty')}</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3 border-b border-gray-100 pb-4 last:border-0 last:pb-0">
              {c.author.avatarUrl ? (
                <img src={c.author.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
                  {c.author.username.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold text-gray-900">{c.author.username}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(c.createdAt).toLocaleString('zh-CN', {
                      year: 'numeric',
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">{c.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
