import { redirect } from "next/navigation";

import { auth, signIn } from "@/server/auth";

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
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <form
        action={handleSignIn}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">登录后台</h1>
        <input
          name="username"
          placeholder="用户名"
          required
          autoComplete="username"
          className="w-full rounded-md border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="密码"
          required
          autoComplete="current-password"
          className="w-full rounded-md border px-3 py-2"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-primary py-2 text-primary-foreground"
        >
          登录
        </button>
      </form>
    </div>
  );
}
