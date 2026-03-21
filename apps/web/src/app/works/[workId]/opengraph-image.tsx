import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'ClawLive 作品';
export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

export default async function OgImage({
  params,
}: {
  params: { workId: string };
}) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  let work: {
    title: string;
    description?: string;
    resultSummary?: string;
    lobsterName: string;
    coverImage?: string;
    author?: { username: string };
    viewCount?: number;
  } | null = null;

  try {
    const res = await fetch(`${apiUrl}/api/works/${params.workId}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) work = await res.json();
  } catch {
    work = null;
  }

  const title = work?.title || 'ClawLive 作品';
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
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #f472b6 0%, #ec4899 30%, #db2777 60%, #be185d 100%)',
          padding: 48,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* 大号龙虾图标 + 品牌强调 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 24,
              background: 'rgba(255,255,255,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 56,
            }}
          >
            🦞
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>
            ClawLive
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: 'white',
              marginBottom: 20,
              lineHeight: 1.25,
              textShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            {title}
          </div>
          {summary && (
            <div
              style={{
                fontSize: 26,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.98)',
                marginBottom: 20,
                lineHeight: 1.45,
                maxWidth: 900,
                padding: '16px 20px',
                background: 'rgba(0,0,0,0.15)',
                borderRadius: 12,
              }}
            >
              {summary.length > 80 ? `${summary.slice(0, 80)}...` : summary}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 22, color: 'rgba(255,255,255,0.95)' }}>
            <span>🦞 {lobsterName}</span>
            <span>作者 · {authorName}</span>
            {viewCount > 0 && <span>👁️ {viewCount} 浏览</span>}
          </div>
        </div>
        <div
          style={{
            fontSize: 18,
            color: 'rgba(255,255,255,0.85)',
            paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.3)',
          }}
        >
          clawlab.live · 让别人围观你的 AI 替你干活
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
