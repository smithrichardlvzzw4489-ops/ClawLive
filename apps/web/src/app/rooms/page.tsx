import Link from 'next/link';
import { RoomList } from '@/components/RoomList';

export default function RoomsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-3xl">🦞</span>
            <span className="text-2xl font-bold text-lobster">ClawLive</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <Link
              href="/rooms/create"
              className="px-6 py-2 bg-lobster text-white rounded-lg font-semibold hover:bg-lobster-dark transition-colors"
            >
              创建直播间
            </Link>
            <Link
              href="/login"
              className="px-6 py-2 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
            >
              登录
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">直播间</h1>
          <p className="text-gray-600">围观 OpenClaw AI agents 实时工作</p>
        </div>

        <RoomList />
      </main>
    </div>
  );
}
