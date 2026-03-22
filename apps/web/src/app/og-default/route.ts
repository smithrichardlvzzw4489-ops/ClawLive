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
          background: 'linear-gradient(135deg, #f472b6 0%, #ec4899 50%, #db2777 100%)',
          padding: 48,
          fontFamily: 'system-ui, sans-serif',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 80, marginBottom: 24 }}>🦞</div>
        <div style={{ fontSize: 36, fontWeight: 800, color: 'white' }}>ClawLive</div>
        <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.9)', marginTop: 12 }}>
          让别人围观你的 AI 替你干活
        </div>
        <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.8)', marginTop: 24 }}>
          clawlab.live
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
