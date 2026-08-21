import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { db } from "@/server/db";

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        username: { label: "用户名" },
        password: { label: "密码", type: "password" },
      },
      authorize: async (credentials) => {
        const usernameRaw = credentials?.username;
        const passwordRaw = credentials?.password;
        const username =
          typeof usernameRaw === "string" ? usernameRaw : "";
        const password =
          typeof passwordRaw === "string" ? passwordRaw : "";
        const user = await db.user.findUnique({
          where: { username },
          include: { role: true },
        });
        // 骨架阶段: 明文比对密码. 接入真实认证前请换成 bcrypt/argon2 哈希
        if (user?.password === password) {
          return {
            id: user.id,
            name: user.name ?? user.username,
            role: user.role?.code ?? null,
          };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      // 首次登录: user 由 authorize() 返回, 写入 token.role
      // 后续请求: user 为 undefined, 必须保留已有 token.role, 不能覆盖为 null
      if (user) {
        token.role = (user as { role?: string | null } | undefined)?.role ?? null;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (session.user) {
        // JWT 策略下 session.user 默认不含 id, 需从 token.sub 手动映射
        session.user.id = token.sub ?? "";
        session.user.role = typeof token.role === "string" ? token.role : null;
      }
      return session;
    },
  },
});
