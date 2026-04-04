import type { Metadata, Viewport } from "next";
import { EngagementReminder } from "@/components/EngagementReminder";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0ea5e9",
};

export const metadata: Metadata = {
  title: "VibeKids — 少儿氛围编程",
  description: "面向小学与初中：用自然语言描述想法，快速生成可预览的小作品。",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "VibeKids" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gradient-to-b from-sky-50 via-white to-amber-50 text-slate-900">
        <EngagementReminder />
        {children}
      </body>
    </html>
  );
}
