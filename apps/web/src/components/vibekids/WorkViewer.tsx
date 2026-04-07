"use client";

import { PreviewFrame } from "@/components/vibekids/PreviewFrame";

type Props = {
  html: string;
  /** 作品详情页：iframe 内滚动，避免微信等环境缩放白屏 */
  nativeScroll?: boolean;
};

export function WorkViewer({ html, nativeScroll }: Props) {
  return (
    <div className="relative flex h-[min(52dvh,620px)] min-h-[max(280px,min(52dvh,620px))] w-full flex-col">
      <PreviewFrame
        html={html}
        title="作品预览"
        nativeScroll={nativeScroll}
        viewportToolbar={false}
      />
    </div>
  );
}
