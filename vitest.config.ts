import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sharedResolve = {
  conditions: ["development"],
  alias: {
    "react-reconciler/constants": "react-reconciler/constants.js",
    "@": path.resolve(__dirname, "./apps/desktop/src/renderer"),
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