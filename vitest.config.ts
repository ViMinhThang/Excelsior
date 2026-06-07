import { defineConfig } from "vitest/config";

const sharedResolve = {
  conditions: ["development"],
  alias: {
    "react-reconciler/constants": "react-reconciler/constants.js",
  },
};

export default defineConfig({
  resolve: sharedResolve,
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
            "src/__tests__/**/*.test.ts",
            "src/__tests__/**/*.test.tsx",
            "packages/*/__tests__/**/*.test.ts",
            "packages/*/__tests__/**/*.test.tsx",
            "apps/desktop/__tests__/**/*.test.ts",
            "apps/desktop/__tests__/**/*.test.tsx",
          ],
        },
      },
      {
        extends: true,
        resolve: sharedResolve,
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