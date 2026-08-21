import { redirect } from "next/navigation";

import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { auth } from "@/server/auth";
import { api } from "@/trpc/server";

export default async function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const menus = await api.menu.getTree();

  return (
    <SidebarProvider menus={menus} username={session.user.name ?? "管理员"}>
      {children}
    </SidebarProvider>
  );
}