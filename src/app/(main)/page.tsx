import { auth } from "@/server/auth";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div>
      <h1 className="text-2xl font-bold">仪表盘</h1>
      <p className="mt-2 text-muted-foreground">
        欢迎, {session?.user?.name ?? "管理员"}
      </p>
    </div>
  );
}
