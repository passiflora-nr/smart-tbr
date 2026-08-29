import path from "node:path";
import { defineConfig } from "vitest/config";

const srcRoot = path.resolve(import.meta.dirname, "src");

export default defineConfig({
  resolve: {
    alias: {
      "@": srcRoot,
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          testTimeout: 120_000,
          hookTimeout: 360_000,
          fileParallelism: false,
          maxWorkers: 1,
        },
      },
    ],
  },
});
