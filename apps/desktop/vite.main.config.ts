import { defineConfig } from "vite";
import path from "path";
import { builtinModules } from "module";

export default defineConfig({
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
        format: "cjs",
        entryFileNames: "[name].cjs",
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
      "@excelsior/client": path.resolve(__dirname, "../../packages/client/src"),
      "@excelsior/core": path.resolve(__dirname, "../../packages/core/src"),
      "@excelsior/agent-host": path.resolve(__dirname, "../../packages/agent-host/src"),
    },
  },
});
