"use client";

import { PreviewFrame } from "@/components/vibekids/PreviewFrame";

type Props = {
  html: string;
};

export function WorkViewer({ html }: Props) {
  return (
    <div className="relative flex h-[min(52dvh,620px)] min-h-[min(52dvh,620px)] w-full flex-col">
      <PreviewFrame html={html} title="作品预览" />
    </div>
  );
}
