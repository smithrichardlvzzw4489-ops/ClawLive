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
          background: 'linear-gradient(to right, #d81b60 0%, #ec407a 50%, #f06292 100%)',
          padding: 56,
          fontFamily: 'system-ui, sans-serif',
          borderRadius: 24,
          overflow: 'hidden',
        }}
      >
        {/* 顶部：龙虾图标 + ClawLive */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: 'rgba(255,255,255,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
            }}
          >
            🦞
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'white', letterSpacing: '-0.3px' }}>
            ClawLive
          </div>
        </div>

        {/* 主内容区 */}
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
              fontSize: 52,
              fontWeight: 800,
              color: 'white',
              marginBottom: 24,
              lineHeight: 1.2,
            }}
          >
            {title}
          </div>
          {summary && (
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: 'white',
                marginBottom: 24,
                lineHeight: 1.5,
                maxWidth: 900,
                padding: '18px 24px',
                background: 'rgba(0,0,0,0.25)',
                borderRadius: 16,
              }}
            >
              {summary.length > 80 ? `${summary.slice(0, 80)}...` : summary}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 20, color: 'rgba(255,255,255,0.95)' }}>
            <span>🦞 {lobsterName}</span>
            <span>作者 · {authorName}</span>
            {viewCount > 0 && <span>👁️ {viewCount} 浏览</span>}
          </div>
        </div>

        {/* 底部：分隔线 + 口号 */}
        <div
          style={{
            paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,0.25)',
          }}
        >
          <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.85)' }}>
            clawlab.live · 让 AI 帮你干活
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
