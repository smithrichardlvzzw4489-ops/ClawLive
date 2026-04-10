import type { Metadata } from 'next';
import { BRAND_ZH } from '@/lib/brand';

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.clawlab.live').replace(/\/$/, '');

type Props = {
  children: React.ReactNode;
  params: { username: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const raw = params.username;
  const u = decodeURIComponent(raw);
  const canonical = `${appUrl}/codernet/github/${encodeURIComponent(u)}`;

  const ogImagePath = `/codernet/github/${encodeURIComponent(u)}/opengraph-image`;

  return {
    title: `@${u} · ${BRAND_ZH} 开发者画像`,
    description: `查看 @${u} 在 ${BRAND_ZH} 上的 GitHub 技术画像与多平台分析。`,
    openGraph: {
      title: `@${u} · ${BRAND_ZH}`,
      description: 'GitHub 技术画像与 AI 分析',
      type: 'website',
      url: canonical,
      siteName: BRAND_ZH,
      images: [{ url: ogImagePath, width: 1200, height: 630, alt: `@${u} · ${BRAND_ZH}` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `@${u} · ${BRAND_ZH}`,
      description: 'GitHub 技术画像与 AI 分析',
      images: [ogImagePath],
    },
    alternates: { canonical },
  };
}

export default function CodernetGithubUsernameLayout({ children }: Props) {
  return children;
}
