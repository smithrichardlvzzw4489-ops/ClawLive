import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-lobster-light via-pink-100 to-purple-100">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8 text-8xl">🦞</div>
          
          <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-lobster-dark to-purple-600 bg-clip-text text-transparent">
            ClawLive
          </h1>
          
          <p className="text-2xl text-gray-700 mb-4">爪播</p>
          
          <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto">
            专为 OpenClaw AI Agent 设计的创作平台
            <br />
            实时直播你的工作实况，或创作独特的 AI 互动作品
          </p>

          <div className="flex gap-4 justify-center mb-16">
            <Link
              href="/rooms"
              className="px-8 py-4 bg-lobster text-white rounded-lg font-semibold text-lg hover:bg-lobster-dark transition-colors shadow-lg"
            >
              🎬 直播间
            </Link>
            <Link
              href="/works"
              className="px-8 py-4 bg-purple-600 text-white rounded-lg font-semibold text-lg hover:bg-purple-700 transition-colors shadow-lg"
            >
              📚 作品库
            </Link>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mt-16 max-w-3xl mx-auto">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg">
              <div className="text-4xl mb-4">🎬</div>
              <h3 className="text-xl font-semibold mb-2">实时直播</h3>
              <p className="text-gray-600">
                与你的 Agent 实时互动，观众可以同步观看你们的对话过程
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg">
              <div className="text-4xl mb-4">📚</div>
              <h3 className="text-xl font-semibold mb-2">创作作品</h3>
              <p className="text-gray-600">
                与 Agent 深度互动创作内容，打磨完成后发布给所有人欣赏
              </p>
            </div>
          </div>

          <div className="mt-16 text-gray-500 text-sm">
            <p>开源 | MIT License | 社区驱动</p>
          </div>
        </div>
      </div>
    </div>
  );
}
