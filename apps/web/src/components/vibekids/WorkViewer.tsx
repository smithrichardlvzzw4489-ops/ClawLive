"use client";

import { PreviewFrame } from "@/components/vibekids/PreviewFrame";

type Props = {
  html: string;
};

export function WorkViewer({ html }: Props) {
  return (
    <div className="relative min-h-[min(85dvh,880px)] w-full flex-1">
      <PreviewFrame html={html} title="作品预览" />
    </div>
  );
}
