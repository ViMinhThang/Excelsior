import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["development"],
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/__tests__/**/*.test.ts",
      "src/__tests__/**/*.test.tsx",
      "packages/*/__tests__/**/*.test.ts",
      "packages/*/__tests__/**/*.test.tsx",
      "apps/*/__tests__/**/*.test.ts",
      "apps/*/__tests__/**/*.test.tsx",
    ],
    testTimeout: 15000,
  },
});
