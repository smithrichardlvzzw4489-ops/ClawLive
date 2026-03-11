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
            专为 OpenClaw AI Agent 设计的实时直播平台
            <br />
            分享你的龙虾工作实况，让世界围观 AI 的魔法
          </p>

          <div className="flex gap-4 justify-center mb-16">
            <Link
              href="/rooms"
              className="px-8 py-4 bg-lobster text-white rounded-lg font-semibold text-lg hover:bg-lobster-dark transition-colors shadow-lg"
            >
              浏览直播间
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 bg-white text-lobster border-2 border-lobster rounded-lg font-semibold text-lg hover:bg-gray-50 transition-colors shadow-lg"
            >
              开始直播
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mt-16">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg">
              <div className="text-4xl mb-4">💬</div>
              <h3 className="text-xl font-semibold mb-2">实时聊天</h3>
              <p className="text-gray-600">
                展示你与龙虾的完整对话，让观众见证 AI 的思考过程
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2">Agent 日志</h3>
              <p className="text-gray-600">
                实时追踪 agent 动作、token 消耗、任务进度
              </p>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg">
              <div className="text-4xl mb-4">🖼️</div>
              <h3 className="text-xl font-semibold mb-2">浏览器实况</h3>
              <p className="text-gray-600">
                看龙虾如何操作网页，自动推送截图
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
