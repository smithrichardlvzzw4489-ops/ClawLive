import { LiveStream } from '@/components/LiveStream';

interface PageProps {
  params: {
    roomId: string;
  };
}

export default function RoomPage({ params }: PageProps) {
  return <LiveStream roomId={params.roomId} />;
}
