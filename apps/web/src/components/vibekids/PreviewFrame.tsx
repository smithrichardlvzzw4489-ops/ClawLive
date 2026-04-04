"use client";

type Props = {
  html: string;
  title?: string;
};

export function PreviewFrame({ html, title = "预览" }: Props) {
  const trimmed = html.trim();

  if (!trimmed) {
    return (
      <div className="flex min-h-[min(400px,50vh)] w-full flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
        暂无预览内容（生成成功但 HTML 为空时可刷新重试）
      </div>
    );
  }

  return (
    <iframe
      title={title}
      className="h-full min-h-[min(400px,50vh)] w-full flex-1 rounded-2xl border border-slate-200 bg-white shadow-inner"
      sandbox="allow-scripts allow-forms"
      srcDoc={trimmed}
    />
  );
}
