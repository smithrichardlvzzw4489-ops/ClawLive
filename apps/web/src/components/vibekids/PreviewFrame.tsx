"use client";

type Props = {
  html: string;
  title?: string;
  /** 切换版本时强制重建 iframe，避免偶发空白不刷新 */
  frameKey?: number;
};

export function PreviewFrame({ html, title = "预览", frameKey }: Props) {
  const trimmed = html.trim();

  if (!trimmed) {
    return (
      <div className="flex min-h-[min(400px,50vh)] w-full flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500 lg:min-h-0">
        暂无预览内容（生成成功但 HTML 为空时可刷新重试）
      </div>
    );
  }

  return (
    <iframe
      key={frameKey}
      title={title}
      className="min-h-0 w-full flex-1 rounded-2xl border border-slate-200 bg-white shadow-inner [min-height:min(400px,50vh)] lg:[min-height:0]"
      sandbox="allow-scripts allow-forms"
      srcDoc={trimmed}
    />
  );
}
