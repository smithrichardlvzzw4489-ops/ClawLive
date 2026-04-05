import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./vk-globals.css";

export const metadata: Metadata = {
  title: "VibeKids — 创作室",
  description: "面向小学与初中：用自然语言描述想法，在创作室快速生成可预览的小作品。",
};

export default function VibeKidsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-slate-50 pb-[calc(3.85rem+env(safe-area-inset-bottom,0px))] lg:min-h-0 lg:pb-0">
      {children}
    </div>
  );
}
