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
});
