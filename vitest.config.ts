import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 15000,
    projects: [
      {
        extends: true,
        test: {
          name: "workspace",
          include: [
            "packages/*/__tests__/**/*.test.ts",
            "packages/*/__tests__/**/*.test.tsx",
          ],
        },
      },
      {
        extends: true,
        resolve: {
          conditions: ["development"],
        },
        test: {
          name: "tui",
          root: "./apps/tui",
          setupFiles: ["./vitest.setup.ts"],
          include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
        },
      },
    ],
  },
});
