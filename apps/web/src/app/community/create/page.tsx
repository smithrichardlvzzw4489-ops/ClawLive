'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';

type PostType = 'question' | 'discussion' | 'experience' | 'retrospective';

export default function CreatePostPage() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get('type') as PostType | null;
  const [type, setType] = useState<PostType>(typeParam || 'question');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeParam && ['question', 'discussion', 'experience', 'retrospective'].includes(typeParam)) {
      setType(typeParam);
    }
  }, [typeParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || submitting) return;

    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login?redirect=/community/create');
      return;
    }

    setSubmitting(true);
    try {
      const tags = tagsStr.split(/[,，\s]+/).filter(Boolean).slice(0, 10);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/community/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ type, title: title.trim(), content: content.trim(), tags }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.id) {
        router.push(`/community/${data.id}`);
      } else {
        alert(data.error || '发布失败');
      }
    } catch {
      alert('发布失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="container max-w-2xl mx-auto px-6 py-8">
        <div className="mb-6 flex items-center gap-2">
          <Link href="/community" className="text-gray-500 hover:text-lobster">← {t('back')}</Link>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {type === 'question' && t('community.publishQuestion')}
          {type === 'discussion' && t('community.publishDiscussion')}
          {type === 'experience' && t('community.publishExperience')}
          {type === 'retrospective' && t('community.publishRetrospective')}
        </h1>

        <div className="mb-4 flex gap-2">
          {(['question', 'discussion', 'experience', 'retrospective'] as PostType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-lg text-sm ${type === t ? 'bg-lobster text-white' : 'bg-gray-100'}`}
            >
              {t === 'question' && t('community.tabQuestion')}
              {t === 'discussion' && t('community.tabDiscussion')}
              {t === 'experience' && t('community.tabExperience')}
              {t === 'retrospective' && t('community.tabRetrospective')}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('community.postTitle')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === 'question' ? '简要描述你的问题' : '输入标题'}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('community.postContent')}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="详细描述..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('community.postTags')} (逗号分隔)</label>
            <input
              type="text"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="OpenClaw, Skill, Agent"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !title.trim() || !content.trim()}
            className="w-full px-6 py-3 bg-lobster text-white rounded-lg font-medium hover:bg-lobster-dark disabled:opacity-50"
          >
            {submitting ? '发布中...' : t('community.createPost')}
          </button>
        </form>
      </div>
    </MainLayout>
  );
}
