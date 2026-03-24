'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainLayout } from '@/components/MainLayout';
import { useLocale } from '@/lib/i18n/LocaleContext';

const MAX_IMAGES = 9;
const MAX_BYTES = 5 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

export default function CreateFeedPostPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const onPickImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + previews.length > MAX_IMAGES) {
      setError(`最多 ${MAX_IMAGES} 张图`);
      return;
    }
    const next: { file: File; url: string }[] = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      if (f.size > MAX_BYTES) {
        setError('单张图片不超过 5MB');
        return;
      }
      const url = await readFileAsDataUrl(f);
      next.push({ file: f, url });
    }
    setPreviews((p) => [...p, ...next]);
    setError('');
    e.target.value = '';
  };

  const removePreview = (index: number) => {
    setPreviews((p) => p.filter((_, i) => i !== index));
  };

  const submit = async () => {
    setError('');
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login?redirect=/posts/create');
      return;
    }
    if (!title.trim() || !content.trim()) {
      setError('请填写标题和正文');
      return;
    }

    setSubmitting(true);
    try {
      const images = previews.map((p) => p.url);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/feed-posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          images,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '发布失败');
        return;
      }
      if (data.id) router.push(`/posts/${data.id}`);
    } catch {
      setError('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-6 py-8 max-w-2xl">
        <Link href="/" className="text-gray-500 hover:text-lobster text-sm mb-6 inline-block">
          ← {t('back')}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('feedPost.createTitle')}</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('feedPost.titleLabel')}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster/30 focus:border-lobster"
              placeholder="标题"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('feedPost.contentLabel')}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-lobster/30 focus:border-lobster"
              placeholder="分享你的想法…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('feedPost.imagesLabel')}</label>
            <p className="text-xs text-gray-500 mb-2">{t('feedPost.imagesHint')}</p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              onChange={onPickImages}
              className="block w-full text-sm text-gray-600"
            />
            <div className="flex flex-wrap gap-2 mt-3">
              {previews.map((p, i) => (
                <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border">
                  <img src={p.url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePreview(i)}
                    className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full py-3 bg-lobster text-white rounded-xl font-semibold hover:bg-lobster-dark disabled:opacity-50"
          >
            {submitting ? t('feedPost.submitting') : t('feedPost.submit')}
          </button>
        </div>
      </div>
    </MainLayout>
  );
}
