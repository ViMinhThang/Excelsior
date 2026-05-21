import { defineConfig } from "vite";
import path from "path";
import { builtinModules } from "module";

const internalWorkspacePackages = [
  "@excelsior/agent-host",
  "@excelsior/core",
  "@excelsior/projection",
  "@excelsior/run-runtime",
];

export default defineConfig({
  ssr: {
    noExternal: internalWorkspacePackages,
  },
  build: {
    ssr: true,
    emptyOutDir: false,
    outDir: path.resolve(__dirname, "dist"),
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "src/main/main.ts"),
        preload: path.resolve(__dirname, "src/main/preload.ts"),
      },
      output: {
        format: "esm",
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]"
      },
      external: [
        "electron",
        "better-sqlite3",
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
    },
  },
  resolve: {
    alias: {
      "@excelsior/agent-host": path.resolve(__dirname, "../../packages/agent-host/src"),
      "@excelsior/core": path.resolve(__dirname, "../../packages/core/src"),
      "@excelsior/projection": path.resolve(__dirname, "../../packages/projection/src"),
      "@excelsior/run-runtime": path.resolve(__dirname, "../../packages/run-runtime/src"),
    },
  },
});
