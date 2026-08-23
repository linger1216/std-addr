import { redirect } from "next/navigation";

import { auth, signIn } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

async function handleSignIn(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      username: formData.get("username"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch {
    redirect("/login?error=credentials");
  }
}

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Left: Hero — Apple 风格浅灰面板 */}
      <aside className="hidden flex-col justify-between bg-secondary/60 p-12 lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-xl bg-foreground text-[14px] font-semibold text-background">
            SA
          </div>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">std-addr</span>
        </div>

        <div>
          <h2 className="text-[48px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground">
            高效、可控、清晰
            <br />
            让每一次管理都更从容。
          </h2>
          <p className="mt-5 max-w-[400px] text-[15px] leading-relaxed text-muted-foreground">
            为运维、审计与业务团队打造的统一工作台，覆盖用户、角色、菜单与日志的完整闭环。
          </p>
        </div>

        <p className="text-[12px] text-muted-foreground">© 2026 std-addr · v1.0</p>
      </aside>

      {/* Right: Login form — 纯白 */}
      <main className="flex items-center justify-center bg-background px-8 py-12">
        <form action={handleSignIn} className="w-full max-w-[360px] space-y-5">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex size-7 items-center justify-center rounded-lg bg-foreground text-[12px] font-semibold text-background">
              SA
            </div>
            <span className="text-[14px] font-semibold">std-addr</span>
          </div>

          <div className="space-y-1">
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] leading-tight">
              欢迎回来
            </h1>
            <p className="text-[13px] text-muted-foreground">
              请输入账号信息以登录管理控制台
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                required
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-10"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                name="remember"
                defaultChecked
                className="size-4 rounded border-border bg-secondary accent-foreground"
              />
              7 天内自动登录
            </label>
            <a href="#" className="text-[#0066cc] hover:underline">
              忘记密码？
            </a>
          </div>

          <Button type="submit" className="h-10 w-full text-[14px]">
            登 录
          </Button>
        </form>
      </main>
    </div>
  );
}
