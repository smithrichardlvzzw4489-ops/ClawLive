import { MainLayout } from '@/components/MainLayout';

export const metadata = {
  title: 'VibeKids — ClawLab',
  description: '少儿氛围编程：嵌入 VibeKids 创作室',
};

export default function VibeKidsPage() {
  const src = process.env.NEXT_PUBLIC_VIBEKIDS_URL?.trim() ?? '';

  return (
    <MainLayout lockViewportHeight>
      <div className="flex h-full min-h-0 flex-col overflow-hidden px-3 pb-3 pt-2 sm:px-4 lg:px-6">
        <div className="mb-2 shrink-0">
          <h1 className="text-lg font-semibold text-white">VibeKids</h1>
          <p className="text-xs text-slate-500">
            独立子应用，通过下方区域访问；未配置地址时请先设置环境变量。
          </p>
        </div>
        {src ? (
          <div className="flex min-h-[50vh] flex-1 flex-col sm:min-h-0">
            <iframe
              title="VibeKids"
              src={src}
              className="h-full min-h-0 w-full flex-1 rounded-xl border border-white/10 bg-black/40 shadow-lg"
              allow="fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : (
          <div className="flex min-h-[50vh] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 text-center">
            <p className="max-w-md text-sm text-slate-300">
              尚未配置{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs text-lobster">
                NEXT_PUBLIC_VIBEKIDS_URL
              </code>
              。请在{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">apps/web/.env.local</code>{' '}
              中设置嵌入地址（例如线上部署的 https 域名，或本地{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">
                http://localhost:3002
              </code>{' '}
              并另开终端运行 VibeKids）。
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
