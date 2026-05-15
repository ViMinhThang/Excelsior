import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("package architecture boundaries", () => {
  it("does not let packages import implementation from root src", () => {
    const offenders = sourceFiles("packages")
      .map((file) => ({
        file,
        text: readFileSync(file, "utf-8"),
      }))
      .filter(({ text }) => /\.\.\/\.\.\/\.\.\/src|from\s+["'][^"']*\/src\//.test(text))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("keeps tests on package exports instead of deep package source imports", () => {
    const offenders = sourceFiles("src/__tests__")
      .map((file) => ({
        file,
        text: readFileSync(file, "utf-8"),
      }))
      .filter(({ text }) => /packages[\\/][^"']+[\\/]src[\\/]/.test(text))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("keeps @excelsior/projection independent from app and host code", () => {
    const forbiddenImportPatterns = [
      "@excelsior/agent-host",
      "@excelsior/core",
      "react",
      "ink",
      "better-sqlite3",
      "@ai-sdk/",
      "ai",
      "@octokit/rest",
      "apps/",
      "../agent-host",
      "../core",
    ];
    const importPattern = /(?:import|export)\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g;

    const offenders = sourceFiles("packages/projection")
      .map((file) => ({
        file,
        text: readFileSync(file, "utf-8"),
      }))
      .filter(({ text }) => {
        const imports = [...text.matchAll(importPattern)].map((match) => match[1]);
        return imports.some((source) =>
          forbiddenImportPatterns.some((pattern) => source.includes(pattern)),
        );
      })
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("keeps @excelsior/run-runtime independent from app and host code", () => {
    const forbiddenImportPatterns = [
      "@excelsior/agent-host",
      "@excelsior/core",
      "react",
      "ink",
      "better-sqlite3",
      "@ai-sdk/",
      "ai",
      "@octokit/rest",
      "apps/",
      "../agent-host",
      "../core",
    ];
    const importPattern = /(?:import|export)\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g;

    const offenders = sourceFiles("packages/run-runtime")
      .map((file) => ({
        file,
        text: readFileSync(file, "utf-8"),
      }))
      .filter(({ text }) => {
        const imports = [...text.matchAll(importPattern)].map((match) => match[1]);
        return imports.some((source) =>
          forbiddenImportPatterns.some((pattern) => source.includes(pattern)),
        );
      })
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });
});
