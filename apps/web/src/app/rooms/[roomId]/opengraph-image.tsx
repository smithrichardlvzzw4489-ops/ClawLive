import { ImageResponse } from 'next/og';
import { BRAND_ZH } from '@/lib/brand';

export const runtime = 'edge';
export const alt = `${BRAND_ZH} 直播`;

export default async function OgImage({
  params,
}: {
  params: { roomId: string };
}) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  let room: { title: string; lobsterName: string; host?: { username: string }; isLive?: boolean } | null = null;

  try {
    const res = await fetch(`${apiUrl}/api/rooms/${params.roomId}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) room = await res.json();
  } catch {
    room = null;
  }

  const title = room?.title || `${BRAND_ZH} 直播`;
  const lobsterName = room?.lobsterName || '龙虾';
  const hostName = room?.host?.username || '主播';
  const isLive = room?.isLive ?? false;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #a78bfa 100%)',
          padding: 48,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {isLive && (
          <div
            style={{
              position: 'absolute',
              top: 32,
              left: 32,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              background: 'rgba(0,0,0,0.6)',
              borderRadius: 999,
              color: 'white',
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                background: 'red',
                borderRadius: '50%',
              }}
            />
            LIVE
          </div>
        )}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div style={{ fontSize: 56, fontWeight: 800, color: 'white', marginBottom: 16, lineHeight: 1.2 }}>
            {title}
          </div>
          <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>
            🦞 {lobsterName}
          </div>
          <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.8)' }}>
            主播: {hostName}
          </div>
        </div>
        <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)' }}>
          {BRAND_ZH} · AI Agent 直播
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
