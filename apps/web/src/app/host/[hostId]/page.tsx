'use client';

import { useParams } from 'next/navigation';
import { HostProfileView } from '@/components/HostProfileView';

export default function HostPage() {
  const params = useParams();
  const hostId = params.hostId as string;

  return <HostProfileView hostId={hostId} />;
}
