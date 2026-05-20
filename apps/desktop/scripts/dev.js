import { createServer } from "vite";
import { build } from "vite";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import electronPath from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startDev() {
  // 1. Start Renderer Vite Dev Server
  const rendererServer = await createServer({
    configFile: path.resolve(__dirname, "../vite.config.ts"),
    server: { port: 5173 }
  });
  await rendererServer.listen();
  console.log("🚀 Renderer Vite Server listening on http://localhost:5173");

  // 2. Build Main/Preload scripts in watch mode
  console.log("⚡ Building Main/Preload scripts...");
  const watcher = await build({
    configFile: path.resolve(__dirname, "../vite.main.config.ts"),
    build: {
      watch: {}
    }
  });

  console.log("✨ Main/Preload scripts built successfully.");

  // 3. Launch Electron
  let electronProcess = null;

  function launchElectron() {
    if (electronProcess) {
      electronProcess.removeAllListeners("close");
      electronProcess.kill();
    }

    electronProcess = spawn(electronPath, ["."], {
      cwd: path.resolve(__dirname, ".."),
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: "http://localhost:5173",
        NODE_ENV: "development"
      }
    });

    electronProcess.on("close", () => {
      // Exit the entire dev script when Electron is closed
      rendererServer.close();
      process.exit(0);
    });
  }

  // Initial launch
  launchElectron();

  // Watcher reload triggers
  if (watcher && typeof watcher.on === "function") {
    watcher.on("event", (event) => {
      if (event.code === "END") {
        console.log("🔄 Main/Preload re-compiled, restarting Electron...");
        launchElectron();
      }
    });
  }
}

startDev().catch((err) => {
  console.error("Failed to start development server:", err);
  process.exit(1);
});
