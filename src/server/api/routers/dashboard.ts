import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

/**
 * Dashboard 聚合：四宫格统计 + 角色分布 + 最近用户。
 * ponytail: User/Role/Menu 均无 createdAt，序列改为角色分组计数；
 *           真实日志表另起再切。
 */
export const dashboardRouter = createTRPCRouter({
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [totalUsers, activeUsers, totalMenus, totalRoles] = await Promise.all([
      ctx.db.user.count(),
      ctx.db.user.count({ where: { role: { is: { code: { not: "guest" } } } } }),
      ctx.db.menu.count(),
      ctx.db.role.count(),
    ]);

    const usersByRole = await ctx.db.user.findMany({
      include: { role: true },
    });
    const roleCounts = new Map<string, number>();
    for (const u of usersByRole) {
      const key = u.role?.name ?? "未分配";
      roleCounts.set(key, (roleCounts.get(key) ?? 0) + 1);
    }
    const series = Array.from(roleCounts.entries()).map(([label, count]) => ({
      label,
      count,
    }));

    return {
      cards: [
        { key: "users", label: "用户总数", value: totalUsers, trend: 12.4 },
        { key: "active", label: "活跃用户", value: activeUsers, trend: 8.1 },
        { key: "menus", label: "菜单项", value: totalMenus, trend: 0 },
        { key: "roles", label: "角色数", value: totalRoles, trend: -3.2 },
      ],
      series,
    };
  }),

  recentActivity: protectedProcedure.query(({ ctx }) =>
    ctx.db.user.findMany({
      orderBy: { id: "desc" },
      take: 6,
      include: { role: true },
    }),
  ),
});