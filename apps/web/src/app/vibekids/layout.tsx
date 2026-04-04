import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./vk-globals.css";

export const metadata: Metadata = {
  title: "VibeKids — 少儿氛围编程",
  description: "面向小学与初中：用自然语言描述想法，快速生成可预览的小作品。",
};

export default function VibeKidsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
