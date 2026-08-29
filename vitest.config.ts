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
    ],
  },
});
