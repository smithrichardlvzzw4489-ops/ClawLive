import type { ReactElement } from 'react';
import type { CodernetPortraitSharePayload } from './codernet-portrait-share';
import { BRAND_ZH } from './brand';
import { truncateForOg } from './codernet-portrait-share';
import { OG_CJK_FONT_FAMILY } from './og-noto-sans-sc';

const LONG_SHARE_ONE_LINER_MAX = 420;
const LONG_SHARE_BIO_MAX = 600;
const LONG_SHARE_SHARP_MAX = 4800;
const LONG_SHARE_AI_SUMMARY_MAX = 1200;

function InflRow({ label, score, color }: { label: string; score: number; color: string }) {
  const w = Math.min(100, Math.max(0, Math.round(score)));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', width: 112, fontSize: 15, color: '#64748b' }}>{label}</div>
      <div
        style={{
          display: 'flex',
          flex: 1,
          height: 10,
          borderRadius: 5,
          background: 'rgba(255,255,255,0.08)',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: `${w}%`,
            height: '100%',
            borderRadius: 5,
            background: color,
          }}
        />
      </div>
      <div style={{ display: 'flex', width: 36, fontSize: 15, color, fontWeight: 700 }}>{w}</div>
    </div>
  );
}

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
        fontFamily: OG_CJK_FONT_FAMILY,
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
          <div
            style={{ display: 'flex', fontSize: 22, color: '#a78bfa', fontWeight: 700, letterSpacing: 2 }}
          >
            {BRAND_ZH}
          </div>
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, lineHeight: 1.15, color: '#f8fafc' }}>
            {name}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#94a3b8',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {`@${ghUsername}`}
          </div>
          {one ? (
            <div style={{ display: 'flex', fontSize: 22, color: '#c4b5fd', lineHeight: 1.4, marginTop: 4 }}>
              {one}
            </div>
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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '10px 18px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div style={{ display: 'flex', fontSize: 26, fontWeight: 800, color: '#fff' }}>
                    {Number(v).toLocaleString()}
                  </div>
                  <div style={{ display: 'flex', fontSize: 14, color: '#64748b', textTransform: 'uppercase' }}>
                    {k}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {sharp ? (
        <div
          style={{
            display: 'flex',
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
          {`\u201c${sharp}\u201d`}
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
      <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 16, fontSize: 16, color: '#64748b' }}>
        {url}
      </div>
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
  const one = truncateForOg(data?.oneLiner, LONG_SHARE_ONE_LINER_MAX);
  const bio = truncateForOg(data?.bio, LONG_SHARE_BIO_MAX);
  const sharp = truncateForOg(data?.sharpCommentary, LONG_SHARE_SHARP_MAX);
  const tags = data?.techTags || [];
  const langs = data?.langs || [];
  const q = data?.quadrant;
  const ins = data?.insights;
  const ae = data?.aiEngagement;
  const mpLines = data?.multiPlatformLines || [];
  const topRepos = data?.topRepos || [];
  const recentLines = data?.recentActivityLines || [];
  const metaBits = data
    ? [data.location, data.company, data.blog]
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((x) => truncateForOg(x, 96))
    : [];
  const hasInsights =
    ins &&
    (ins.communityInfluenceScore != null ||
      ins.aiMlImpactScore != null ||
      ins.algorithmScore != null ||
      ins.knowledgeSharingScore != null ||
      ins.packageImpactScore != null);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #06080f 0%, #0f1020 40%, #151028 100%)',
        padding: 48,
        fontFamily: OG_CJK_FONT_FAMILY,
        color: '#e2e8f0',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: 20,
          color: '#a78bfa',
          fontWeight: 700,
          letterSpacing: 3,
          marginBottom: 8,
        }}
      >
        {`${BRAND_ZH} · 开发者画像`}
      </div>
      <div style={{ display: 'flex', fontSize: 15, color: '#475569', marginBottom: 32 }}>{url}</div>

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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, color: '#f8fafc', lineHeight: 1.1 }}>
            {name}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              color: '#64748b',
              fontFamily: 'ui-monospace, monospace',
              marginTop: 8,
            }}
          >
            {`@${ghUsername}`}
          </div>
          {data?.platforms?.length ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px 14px',
                fontSize: 17,
                color: '#818cf8',
                marginTop: 10,
              }}
            >
              {data.platforms.map((p) => (
                <span key={p} style={{ display: 'flex' }}>
                  {p}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {one ? (
        <div style={{ display: 'flex', fontSize: 26, color: '#c4b5fd', lineHeight: 1.45, marginBottom: 16 }}>
          {one}
        </div>
      ) : null}
      {bio ? (
        <div style={{ display: 'flex', fontSize: 20, color: '#94a3b8', lineHeight: 1.5, marginBottom: 24 }}>
          {bio}
        </div>
      ) : null}

      {metaBits.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 17,
            color: '#64748b',
            lineHeight: 1.45,
            marginBottom: 22,
          }}
        >
          {metaBits.map((line, i) => (
            <div key={`m-${i}`} style={{ display: 'flex' }}>
              {line}
            </div>
          ))}
        </div>
      ) : null}

      {data ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
          {(
            [
              ['Repos', data.repos],
              ['Stars', data.stars],
              ['Followers', data.followers],
              ['Following', data.following],
            ] as const
          ).map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: '1 1 22%',
                minWidth: 120,
                padding: '14px 10px',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                textAlign: 'center',
              }}
            >
              <div style={{ display: 'flex', fontSize: 32, fontWeight: 800, color: '#fff' }}>
                {Number(v).toLocaleString()}
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 13,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  marginTop: 4,
                }}
              >
                {k}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {sharp ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '20px 22px',
            borderRadius: 16,
            background: 'rgba(139,92,246,0.1)',
            border: '1px solid rgba(139,92,246,0.28)',
            marginBottom: 28,
          }}
        >
          <div style={{ display: 'flex', fontSize: 14, color: '#7c3aed', fontWeight: 700, marginBottom: 10 }}>
            AI 锐评
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#e2e8f0',
              lineHeight: 1.55,
              fontStyle: 'italic',
            }}
          >
            {`\u201c${sharp}\u201d`}
          </div>
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 24 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#64748b',
              marginBottom: 12,
              textTransform: 'uppercase',
            }}
          >
            技术标签
          </div>
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
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 28 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#64748b',
              marginBottom: 12,
              textTransform: 'uppercase',
            }}
          >
            语言分布
          </div>
          {langs.map((l) => (
            <div key={l.language} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', width: 120, fontSize: 18, color: '#94a3b8' }}>{l.language}</div>
              <div
                style={{
                  display: 'flex',
                  flex: 1,
                  height: 12,
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.08)',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.round(l.percent))}%`,
                    height: '100%',
                    borderRadius: 6,
                    background: 'linear-gradient(90deg,#7c3aed,#a78bfa)',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  width: 48,
                  fontSize: 16,
                  color: '#cbd5e1',
                  textAlign: 'right',
                }}
              >
                {`${Math.round(l.percent)}%`}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {ae ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '18px 20px',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', fontSize: 14, color: '#64748b', marginBottom: 10, textTransform: 'uppercase' }}>
            AI 参与度
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
            <span style={{ display: 'flex', fontSize: 36, fontWeight: 800, color: '#fbbf24' }}>{Math.round(ae.overall)}</span>
            {ae.levelLabel ? (
              <span style={{ display: 'flex', fontSize: 18, color: '#94a3b8' }}>{ae.levelLabel}</span>
            ) : null}
          </div>
          {ae.summary ? (
            <div style={{ display: 'flex', fontSize: 17, color: '#cbd5e1', lineHeight: 1.5, marginBottom: 12 }}>
              {truncateForOg(ae.summary, LONG_SHARE_AI_SUMMARY_MAX)}
            </div>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', fontSize: 15, color: '#64748b' }}>
            <span style={{ display: 'flex' }}>{`项目 ${ae.breakdown.aiProjects}`}</span>
            <span style={{ display: 'flex' }}>{`工具 ${ae.breakdown.aiToolUsage}`}</span>
            <span style={{ display: 'flex' }}>{`模型 ${ae.breakdown.aiModelPublishing}`}</span>
            <span style={{ display: 'flex' }}>{`分享 ${ae.breakdown.aiKnowledgeSharing}`}</span>
            <span style={{ display: 'flex' }}>{`包 ${ae.breakdown.aiPackageContrib}`}</span>
          </div>
        </div>
      ) : null}

      {hasInsights && ins ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '18px 20px',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', fontSize: 14, color: '#64748b', marginBottom: 12, textTransform: 'uppercase' }}>
            跨平台影响力
          </div>
          {ins.communityInfluenceScore != null ? (
            <InflRow label="社区" score={ins.communityInfluenceScore} color="#8b5cf6" />
          ) : null}
          {ins.aiMlImpactScore != null ? (
            <InflRow label="AI/ML" score={ins.aiMlImpactScore} color="#facc15" />
          ) : null}
          {ins.algorithmScore != null ? (
            <InflRow label="算法" score={ins.algorithmScore} color="#fb923c" />
          ) : null}
          {ins.knowledgeSharingScore != null ? (
            <InflRow label="知识" score={ins.knowledgeSharingScore} color="#f97316" />
          ) : null}
          {ins.packageImpactScore != null ? (
            <InflRow label="包生态" score={ins.packageImpactScore} color="#ef4444" />
          ) : null}
        </div>
      ) : null}

      {q ? (
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 32 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#64748b',
              marginBottom: 12,
              textTransform: 'uppercase',
            }}
          >
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
                  display: 'flex',
                  flexDirection: 'column',
                  width: '47%',
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ display: 'flex', fontSize: 16, color: '#64748b', marginBottom: 4 }}>{label}</div>
                <div style={{ display: 'flex', fontSize: 28, fontWeight: 800, color: '#a78bfa' }}>
                  {Math.round(v)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {mpLines.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 28 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#64748b',
              marginBottom: 12,
              textTransform: 'uppercase',
            }}
          >
            多平台数据摘要
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '16px 18px',
              borderRadius: 14,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {mpLines.map((line, i) => (
              <div
                key={`mp-${i}`}
                style={{ display: 'flex', fontSize: 16, color: '#94a3b8', lineHeight: 1.45 }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {topRepos.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 28 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#64748b',
              marginBottom: 12,
              textTransform: 'uppercase',
            }}
          >
            仓库亮点（按 Star）
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topRepos.map((r, ri) => (
              <div
                key={`${r.name}-${ri}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ display: 'flex', fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>{r.name}</span>
                  <span style={{ display: 'flex', fontSize: 15, color: '#a78bfa', fontFamily: 'ui-monospace, monospace' }}>
                    {`★${r.stars.toLocaleString()}`}
                  </span>
                  {r.language ? (
                    <span style={{ display: 'flex', fontSize: 14, color: '#64748b' }}>{r.language}</span>
                  ) : null}
                </div>
                {r.description ? (
                  <div style={{ display: 'flex', fontSize: 15, color: '#94a3b8', lineHeight: 1.4, marginTop: 6 }}>
                    {r.description}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {recentLines.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 28 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#64748b',
              marginBottom: 12,
              textTransform: 'uppercase',
            }}
          >
            近期提交摘要
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentLines.map((line, i) => (
              <div
                key={`rc-${i}`}
                style={{ display: 'flex', fontSize: 15, color: '#94a3b8', lineHeight: 1.45 }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: 'auto',
          paddingTop: 24,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          fontSize: 18,
          color: '#64748b',
          textAlign: 'center',
        }}
      >
        {`打开链接查看交互式 drill-down 与实时数据 · ${BRAND_ZH}`}
      </div>
    </div>
  );
}
