import { communityRouter } from "@/server/api/routers/community";
import { dashboardRouter } from "@/server/api/routers/dashboard";
import { labelRouter } from "@/server/api/routers/label";
import { poiRouter } from "@/server/api/routers/poi";
import { roadRouter } from "@/server/api/routers/road";
import { villageRouter } from "@/server/api/routers/village";
import { menuRouter } from "@/server/api/routers/menu";
import { postRouter } from "@/server/api/routers/post";
import { roleRouter } from "@/server/api/routers/role";
import { userRouter } from "@/server/api/routers/user";
import { regionRouter } from "@/server/api/routers/region";
import { addrSimRouter } from "@/server/api/routers/addr-sim";
import { settingsRouter } from "@/server/api/routers/settings";
import { addrModelRouter } from "@/server/api/routers/addr-model";
import { subareaRouter } from "@/server/api/routers/subarea";
import { stdAddressRouter } from "@/server/api/routers/std-address";
import { complainsRouter } from "@/server/api/routers/complains";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  user: userRouter,
  role: roleRouter,
  menu: menuRouter,
  dashboard: dashboardRouter,
  community: communityRouter,
  village: villageRouter,
  road: roadRouter,
  poi: poiRouter,
  region: regionRouter,
  label: labelRouter,
  addrSim: addrSimRouter,
  settings: settingsRouter,
  addrModel: addrModelRouter,
  subarea: subareaRouter,
  stdAddress: stdAddressRouter,
  complains: complainsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
