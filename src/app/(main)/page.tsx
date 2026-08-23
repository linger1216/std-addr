import { auth } from "@/server/auth";
import { api } from "@/trpc/server";
import { DashboardClient } from "@/components/modules/dashboard/dashboard-client";

export default async function DashboardPage() {
  const session = await auth();
  const stats = await api.dashboard.stats();
  const recent = await api.dashboard.recentActivity();

  return (
    <DashboardClient
      username={session?.user?.name ?? "管理员"}
      stats={stats}
      recent={recent}
    />
  );
}