import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";

import { TRPCReactProvider } from "@/trpc/react";

export const metadata: Metadata = {
  title: "std-addr 管理控制台",
  description: "用户、角色、菜单与标准地址的统一管理后台",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${geist.variable}`}>
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
