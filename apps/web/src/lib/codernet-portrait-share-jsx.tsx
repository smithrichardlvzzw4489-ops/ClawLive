import type { ReactElement } from 'react';
import type { CodernetPortraitSharePayload } from './codernet-portrait-share';
import { BRAND_ZH } from './brand';
import { truncateForOg } from './codernet-portrait-share';

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'https://www.clawlab.live'
  ).replace(/\/$/, '');
}

export function codernetPortraitPageUrl(ghUsername: string): string {
  return `${appOrigin()}/codernet/github/${encodeURIComponent(ghUsername)}`;
}

export type PortraitOgProps = {
  data: CodernetPortraitSharePayload | null;
  ghUsername: string;
  /** 服务端内联头像；勿让 Satori 直接请求 GitHub */
  avatarDataUrl?: string | null;
};

/** 1200×630 — 链接预览（Open Graph / Twitter） */
export function CodernetPortraitOgElement({
  data,
  ghUsername,
  avatarDataUrl,
}: PortraitOgProps): ReactElement {
  const url = codernetPortraitPageUrl(ghUsername);
  const name = data?.displayName || ghUsername;
  const one = truncateForOg(data?.oneLiner, 120);
  const sharp = truncateForOg(data?.sharpCommentary, 160);
  const tags = (data?.techTags || []).slice(0, 6);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(145deg, #0c0f1a 0%, #12182c 45%, #1a1035 100%)',
        padding: 40,
        fontFamily:
          'ui-sans-serif, system-ui, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif',
        color: '#e2e8f0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 28, flex: 1 }}>
        {data && avatarDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- next/og supports img
          <img
            src={avatarDataUrl}
            width={140}
            height={140}
            alt=""
            style={{ borderRadius: 20, border: '2px solid rgba(167,139,250,0.35)' }}
          />
        ) : (
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: 20,
              background: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 56,
              fontWeight: 800,
              color: 'white',
            }}
          >
            {ghUsername[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ fontSize: 22, color: '#a78bfa', fontWeight: 700, letterSpacing: 2 }}>
            {BRAND_ZH}
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.15, color: '#f8fafc' }}>{name}</div>
          <div style={{ fontSize: 22, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
            @{ghUsername}
          </div>
          {one ? (
            <div style={{ fontSize: 22, color: '#c4b5fd', lineHeight: 1.4, marginTop: 4 }}>{one}</div>
          ) : null}
          {data ? (
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              {[
                ['Repos', data.repos],
                ['Stars', data.stars],
                ['Followers', data.followers],
              ].map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#fff' }}>{Number(v).toLocaleString()}</div>
                  <div style={{ fontSize: 14, color: '#64748b', textTransform: 'uppercase' }}>{k}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {sharp ? (
        <div
          style={{
            marginTop: 16,
            padding: '14px 18px',
            borderRadius: 14,
            background: 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.25)',
            fontSize: 18,
            color: '#cbd5e1',
            fontStyle: 'italic',
            lineHeight: 1.45,
          }}
        >
          &ldquo;{sharp}&rdquo;
        </div>
      ) : null}
      {tags.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {tags.map((t) => (
            <span
              key={t}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.08)',
                fontSize: 15,
                color: '#cbd5e1',
              }}
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ marginTop: 'auto', paddingTop: 16, fontSize: 16, color: '#64748b' }}>{url}</div>
    </div>
  );
}

/** 长图 — 下载 / 系统分享用 */
export function CodernetPortraitLongElement({
  data,
  ghUsername,
  avatarDataUrl,
}: PortraitOgProps): ReactElement {
  const url = codernetPortraitPageUrl(ghUsername);
  const name = data?.displayName || ghUsername;
  const one = truncateForOg(data?.oneLiner, 200);
  const bio = truncateForOg(data?.bio, 220);
  const sharp = truncateForOg(data?.sharpCommentary, 520);
  const tags = data?.techTags || [];
  const langs = data?.langs || [];
  const q = data?.quadrant;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #06080f 0%, #0f1020 40%, #151028 100%)',
        padding: 48,
        fontFamily:
          'ui-sans-serif, system-ui, "Segoe UI", "PingFang SC", "Noto Sans SC", sans-serif',
        color: '#e2e8f0',
      }}
    >
      <div style={{ fontSize: 20, color: '#a78bfa', fontWeight: 700, letterSpacing: 3, marginBottom: 8 }}>
        {BRAND_ZH} · 开发者画像
      </div>
      <div style={{ fontSize: 15, color: '#475569', marginBottom: 32 }}>{url}</div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32, marginBottom: 28 }}>
        {data && avatarDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarDataUrl}
            width={160}
            height={160}
            alt=""
            style={{ borderRadius: 22, border: '2px solid rgba(167,139,250,0.4)' }}
          />
        ) : (
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: 22,
              background: 'linear-gradient(135deg,#7c3aed,#6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 64,
              fontWeight: 800,
              color: 'white',
            }}
          >
            {ghUsername[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 52, fontWeight: 800, color: '#f8fafc', lineHeight: 1.1 }}>{name}</div>
          <div style={{ fontSize: 24, color: '#64748b', fontFamily: 'ui-monospace, monospace', marginTop: 8 }}>
            @{ghUsername}
          </div>
          {data?.platforms?.length ? (
            <div style={{ fontSize: 18, color: '#818cf8', marginTop: 10 }}>
              {data.platforms.slice(0, 8).join(' · ')}
            </div>
          ) : null}
        </div>
      </div>

      {one ? (
        <div style={{ fontSize: 26, color: '#c4b5fd', lineHeight: 1.45, marginBottom: 16 }}>{one}</div>
      ) : null}
      {bio ? (
        <div style={{ fontSize: 20, color: '#94a3b8', lineHeight: 1.5, marginBottom: 24 }}>{bio}</div>
      ) : null}

      {data ? (
        <div style={{ display: 'flex', gap: 20, marginBottom: 28 }}>
          {[
            ['Repos', data.repos],
            ['Stars', data.stars],
            ['Followers', data.followers],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                flex: 1,
                padding: '16px 12px',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 36, fontWeight: 800, color: '#fff' }}>{Number(v).toLocaleString()}</div>
              <div style={{ fontSize: 14, color: '#64748b', textTransform: 'uppercase', marginTop: 4 }}>{k}</div>
            </div>
          ))}
        </div>
      ) : null}

      {sharp ? (
        <div
          style={{
            padding: '20px 22px',
            borderRadius: 16,
            background: 'rgba(139,92,246,0.1)',
            border: '1px solid rgba(139,92,246,0.28)',
            marginBottom: 28,
          }}
        >
          <div style={{ fontSize: 14, color: '#7c3aed', fontWeight: 700, marginBottom: 10 }}>AI 锐评</div>
          <div style={{ fontSize: 22, color: '#e2e8f0', lineHeight: 1.55, fontStyle: 'italic' }}>
            &ldquo;{sharp}&rdquo;
          </div>
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 12, textTransform: 'uppercase' }}>技术标签</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  fontSize: 18,
                  color: '#cbd5e1',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {langs.length > 0 ? (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 12, textTransform: 'uppercase' }}>语言分布</div>
          {langs.map((l) => (
            <div key={l.language} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 120, fontSize: 18, color: '#94a3b8' }}>{l.language}</div>
              <div style={{ flex: 1, height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.08)' }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.round(l.percent))}%`,
                    height: '100%',
                    borderRadius: 6,
                    background: 'linear-gradient(90deg,#7c3aed,#a78bfa)',
                  }}
                />
              </div>
              <div style={{ width: 48, fontSize: 16, color: '#cbd5e1', textAlign: 'right' }}>
                {Math.round(l.percent)}%
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {q ? (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 12, textTransform: 'uppercase' }}>
            能力象限
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {(
              [
                ['前端', q.frontend],
                ['后端', q.backend],
                ['基建', q.infra],
                ['AI/ML', q.ai_ml],
              ] as const
            ).map(([label, v]) => (
              <div
                key={label}
                style={{
                  width: '47%',
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ fontSize: 16, color: '#64748b', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#a78bfa' }}>{Math.round(v)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 'auto',
          paddingTop: 24,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          fontSize: 18,
          color: '#64748b',
          textAlign: 'center',
        }}
      >
        打开链接查看完整画像与多平台数据 · {BRAND_ZH}
      </div>
    </div>
  );
}
