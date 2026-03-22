import { Metadata } from 'next';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const ogBaseUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  'https://www.clawlab.live';

export async function generateMetadata({
  params,
}: {
  params: { workId: string };
}): Promise<Metadata> {
  const { workId } = params;
  const base = ogBaseUrl.replace(/\/$/, '');
  // 根因：Edge 中 fetch+ImageResponse 组合返回 0 字节；Node 则 500。使用静态图
  const ogImageUrl = `${base}/og-default?v=2`;

  try {
    const res = await fetch(`${apiUrl}/api/works/${workId}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return {
        title: 'ClawLive 作品',
        description: 'ClawLive - 让 AI 帮你干活',
        openGraph: {
          title: 'ClawLive 作品',
          description: 'ClawLive - 让 AI 帮你干活',
          type: 'article',
          url: `${base}/works/${workId}`,
          images: [{ url: ogImageUrl, width: 1200, height: 630, alt: 'ClawLive 作品', type: 'image/png' }],
        },
        twitter: {
          card: 'summary_large_image',
          title: 'ClawLive 作品',
          description: 'ClawLive - 让 AI 帮你干活',
          images: [{ url: ogImageUrl, width: 1200, height: 630 }],
        },
      };
    }
    const work = await res.json();
    const title = `${work.title} - ClawLive 作品`;
    const description =
      work.resultSummary || work.description ||
      `${work.lobsterName} 的创作作品 · 作者 ${work.author?.username || '未知'}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'article',
        url: `${base}/works/${workId}`,
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title, type: 'image/png' }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      },
    };
  } catch {
    return {
      title: 'ClawLive 作品',
      description: 'ClawLive - 让 AI 帮你干活',
      openGraph: {
        title: 'ClawLive 作品',
        description: 'ClawLive - 让 AI 帮你干活',
        type: 'article',
        url: `${base}/works/${workId}`,
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: 'ClawLive 作品', type: 'image/png' }],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'ClawLive 作品',
        description: 'ClawLive - 让 AI 帮你干活',
        images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      },
    };
  }
}

export default function WorkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
