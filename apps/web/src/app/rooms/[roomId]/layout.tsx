import { Metadata } from 'next';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function generateMetadata({
  params,
}: {
  params: { roomId: string };
}): Promise<Metadata> {
  try {
    const res = await fetch(`${apiUrl}/api/rooms/${params.roomId}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return {};
    const room = await res.json();

    const title = `${room.title} - 可唠 直播`;
    const description =
      room.description ||
      `${room.lobsterName} 的直播 · 主播 ${room.host?.username || '未知'}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
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

export default function RoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
