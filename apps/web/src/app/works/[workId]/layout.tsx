import { Metadata } from 'next';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function generateMetadata({
  params,
}: {
  params: { workId: string };
}): Promise<Metadata> {
  try {
    const res = await fetch(`${apiUrl}/api/works/${params.workId}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return {};
    const work = await res.json();

    const title = `${work.title} - ClawLive 作品`;
    const description =
      work.description ||
      `${work.lobsterName} 的创作作品 · 作者 ${work.author?.username || '未知'}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
      },
    };
  } catch {
    return {};
  }
}

export default function WorkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
