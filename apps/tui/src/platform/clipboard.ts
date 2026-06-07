import { execFileSync } from "node:child_process";
import type { CliRenderer } from "@opentui/core";

function readClipboardWindows(): string {
  return execFileSync(
    "powershell",
    ["-NoProfile", "-Command", "[Console]::Out.Write((Get-Clipboard -Raw))"],
    { encoding: "utf8" },
  );
}

function writeClipboardWindows(text: string): void {
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", "Set-Clipboard -Value ([Console]::In.ReadToEnd())"],
    { input: text, encoding: "utf8" },
  );
}

function readClipboardDarwin(): string {
  return execFileSync("pbpaste", { encoding: "utf8" });
}

function writeClipboardDarwin(text: string): void {
  execFileSync("pbcopy", { input: text, encoding: "utf8" });
}

function readClipboardLinux(): string {
  try {
    return execFileSync("wl-paste", { encoding: "utf8" });
  } catch {
    return execFileSync("xclip", ["-selection", "clipboard", "-o"], { encoding: "utf8" });
  }
}

function writeClipboardLinux(text: string): void {
  try {
    execFileSync("wl-copy", { input: text, encoding: "utf8" });
  } catch {
    execFileSync("xclip", ["-selection", "clipboard"], { input: text, encoding: "utf8" });
  }
}

export function copyTextToClipboard(text: string, renderer?: CliRenderer): boolean {
  if (!text) return false;

  if (renderer?.copyToClipboardOSC52?.(text)) {
    return true;
  }

  try {
    if (process.platform === "win32") {
      writeClipboardWindows(text);
      return true;
    }
    if (process.platform === "darwin") {
      writeClipboardDarwin(text);
      return true;
    }
    writeClipboardLinux(text);
    return true;
  } catch {
    return false;
  }
}

export async function readTextFromClipboard(): Promise<string> {
  try {
    if (process.platform === "win32") {
      return readClipboardWindows();
    }
    if (process.platform === "darwin") {
      return readClipboardDarwin();
    }
    return readClipboardLinux();
  } catch {
    return "";
  }
}