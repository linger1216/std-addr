import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * vitest 配置:
 *  - node 环境跑单元/回归测试(不涉及 DOM 渲染)
 *  - alias "@" 对齐 tsconfig paths,测试里可直接用 "@/..." 引用项目模块
 *  - 只收集 src 下的 *.test.ts
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  // Next 的 tsconfig 是 jsx: preserve(由 Next 编译),vitest 需要自己转 JSX
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});