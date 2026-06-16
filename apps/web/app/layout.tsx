import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
import "@xyflow/react/dist/style.css";

export const metadata: Metadata = {
  title: "神笔马良短篇小说 Agent",
  description: "个人自用的本地 AI 短篇小说创作工作台",
  icons: {
    icon: "/favicon.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
