/**
 * 静态 OG 图 - 无 API 依赖，左 logo 右文布局
 * 动态 /works/[id]/og 在 Vercel Edge 下返回 0 字节，故此图作为作品页分享预览
 */
import { ImageResponse } from 'next/og';
import { BRAND_ZH, BRAND_ICON } from '@/lib/brand';

export const runtime = 'edge';

export async function GET() {
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
            {BRAND_ICON}
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
          <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.75)', marginBottom: 14 }}>
            GITLINK
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, color: 'white', lineHeight: 1.2, marginBottom: 18 }}>
            {BRAND_ZH} 作品
          </div>
          <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
            让 AI 帮你干活
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
