import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string, includeTests = false): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (
      entry === "node_modules" ||
      entry === "dist" ||
      (!includeTests && entry === "__tests__")
    ) return [];
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) return sourceFiles(path, includeTests);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

function testFiles(): string[] {
  return sourceFiles("src/__tests__", true)
    .concat(sourceFiles("packages", true))
    .concat(sourceFiles("apps", true))
    .filter((file) => file.includes("__tests__"));
}

describe("package architecture boundaries", () => {
  it("does not introduce casual any in app or package source", () => {
    const offenders = sourceFiles("packages")
      .concat(sourceFiles("apps"))
      .map((file) => ({
        file,
        text: readFileSync(file, "utf-8"),
      }))
      .filter(({ text }) =>
        /\bas any\b|:\s*any\b|<any\b|Record<string,\s*any>/.test(text),
      )
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

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

  it("keeps apps on public package APIs instead of internal host paths", () => {
    const offenders = sourceFiles("apps")
      .map((file) => ({
        file,
        text: readFileSync(file, "utf-8"),
      }))
      .filter(({ text }) => /@excelsior\/agent-host\/internal\//.test(text))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("keeps tests on package exports instead of deep package source imports", () => {
    const offenders = testFiles()
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

  it("keeps @excelsior/client independent from host and app implementations", () => {
    const forbiddenImportPatterns = [
      "@excelsior/agent-host",
      "react",
      "ink",
      "electron",
      "better-sqlite3",
      "@ai-sdk/",
      "ai",
      "@octokit/rest",
      "apps/",
      "../agent-host",
    ];
    const importPattern = /(?:import|export)\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g;

    const offenders = sourceFiles("packages/client")
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
