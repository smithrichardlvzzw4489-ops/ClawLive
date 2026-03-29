/**
 * 动态 OG 图 - 从 URL 查询参数读取 title、desc，无 fetch，Edge 可正常工作
 */
import { ImageResponse } from 'next/og';
import { BRAND_ZH, DARWIN_ICON } from '@/lib/brand';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const summary = searchParams.get('summary') || `${BRAND_ZH} 作品`;
  const truncatedSummary = summary.length > 32 ? `${summary.slice(0, 32)}...` : summary;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          background: '#c62828',
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
              background: '#c62828',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 100,
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            }}
          >
            {DARWIN_ICON}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '48px 56px',
          }}
        >
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.75)', marginBottom: 14 }}>
            clawclub.live
          </div>
          <div style={{ fontSize: 42, fontWeight: 800, color: 'white', lineHeight: 1.2, marginBottom: 18 }}>
            {truncatedSummary}
          </div>
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
            让AI帮你干活
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
