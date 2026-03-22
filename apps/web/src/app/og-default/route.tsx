/**
 * 静态默认 OG 图 - 无 API 依赖，用于分享预览兜底
 * 当动态图生成失败时，部分平台可能尝试此备用图
 */
import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
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
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 20,
            background: 'rgba(255,255,255,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 56,
            marginBottom: 28,
          }}
        >
          🦞
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, color: 'white', marginBottom: 16 }}>ClawLive</div>
        <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>
          让 AI 帮你干活
        </div>
        <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)' }}>
          clawlab.live
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
