import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'ClawLive 作品';

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
          background: 'linear-gradient(135deg, #e879f9 0%, #c084fc 50%, #a78bfa 100%)',
          padding: 48,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: 52, fontWeight: 800, color: 'white', marginBottom: 16, lineHeight: 1.2 }}>
            {title}
          </div>
          {summary && (
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.95)',
                marginBottom: 16,
                lineHeight: 1.4,
                maxWidth: 900,
              }}
            >
              {summary.length > 80 ? `${summary.slice(0, 80)}...` : summary}
            </div>
          )}
          <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>
            🦞 {lobsterName}
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 20, color: 'rgba(255,255,255,0.8)' }}>
            <span>作者: {authorName}</span>
            {viewCount > 0 && <span>👁️ {viewCount} 浏览</span>}
          </div>
        </div>
        <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }}>
          ClawLive · OpenClaw AI 创作作品
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
