'use client';

import { useCallback, useState } from 'react';
import { resolveMediaUrl } from '@/lib/api';

export function FeedPostImageCarousel({ imageUrls }: { imageUrls: string[] }) {
  const [idx, setIdx] = useState(0);
  const n = imageUrls.length;
  const go = useCallback(
    (delta: number) => {
      setIdx((i) => (i + delta + n) % n);
    },
    [n]
  );

  if (n === 0) return null;

  const src = resolveMediaUrl(imageUrls[idx]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-gray-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="mx-auto max-h-[min(70vh,560px)] w-full object-contain"
      />
      {n > 1 && (
        <>
          <button
            type="button"
            aria-label="上一张"
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/45 px-2.5 py-2 text-xl leading-none text-white shadow hover:bg-black/60"
            onClick={() => go(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="下一张"
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/45 px-2.5 py-2 text-xl leading-none text-white shadow hover:bg-black/60"
            onClick={() => go(1)}
          >
            ›
          </button>
          <div className="absolute bottom-3 left-0 right-0 z-10 flex justify-center gap-2">
            {imageUrls.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`第 ${i + 1} 张`}
                aria-current={i === idx}
                className={`h-2 w-2 rounded-full transition-colors ${i === idx ? 'bg-white shadow' : 'bg-white/45 hover:bg-white/70'}`}
                onClick={() => setIdx(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
