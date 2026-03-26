import { ImageResponse } from 'next/og';
import { BRAND_ZH } from '@/lib/brand';

export const runtime = 'edge';

export async function GET(
  _request: Request,
  { params }: { params: { workId: string } }
) {
  const workId = params.workId;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  let work: {
    title: string;
    description?: string;
    resultSummary?: string;
    lobsterName: string;
    author?: { username: string };
    viewCount?: number;
  } | null = null;

  try {
    const res = await fetch(`${apiUrl}/api/works/${workId}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) work = await res.json();
  } catch {
    work = null;
  }

  const title = work?.title || `${BRAND_ZH} 作品`;
  const summary = work?.resultSummary || work?.description || '';
  const lobsterName = work?.lobsterName || '龙虾';
  const authorName = work?.author?.username || '作者';
  const viewCount = work?.viewCount ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          background: 'linear-gradient(135deg, #d81b60 0%, #ec407a 50%, #f06292 100%)',
          fontFamily: 'system-ui, sans-serif',
          borderRadius: 20,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.2)',
        }}
      >
        <div
          style={{
            width: 420,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.95)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: 24,
              background: 'linear-gradient(to right, #d81b60, #ec407a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 100,
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            }}
          >
            🦞
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '48px 56px',
            color: 'white',
          }}
        >
          <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.9)', marginBottom: 12 }}>
            clawlab.live
          </div>
          <div style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.2, marginBottom: 20 }}>
            {title}
          </div>
          <div
            style={{
              fontSize: 22,
              color: 'rgba(255,255,255,0.95)',
              lineHeight: 1.5,
              maxWidth: 580,
            }}
          >
            {(summary ? (summary.length > 60 ? `${summary.slice(0, 60)}...` : summary) : `${lobsterName} 的作品`)}
          </div>
          <div style={{ marginTop: 24, fontSize: 18, color: 'rgba(255,255,255,0.85)' }}>
            {lobsterName} · {authorName}
            {viewCount > 0 ? ` · ${viewCount} 浏览` : ''}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    }
  );
}
