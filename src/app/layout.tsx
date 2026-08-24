import "@/styles/globals.css";

import { type Metadata } from "next";
import { Toaster } from "sonner";

import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
  title: "std-addr 管理控制台",
  description: "用户、角色、菜单与标准地址的统一管理后台",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

// ponytail: 字体完全本地化 —— 不用 next/font/google(依赖联网下载)。
// 直接在 globals.css 里用系统字体栈(font-family 名字),
// macOS 用 PingFang SC/SF Pro, Windows 用微软雅黑, Linux 用 Noto Sans CJK。
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}