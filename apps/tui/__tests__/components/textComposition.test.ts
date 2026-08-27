import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..", "src");

describe("TUI text element composition", () => {
  const files = globSync("**/*.tsx", { cwd: root });

  it("never nests <text> inside another <text>", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(root, file), "utf8");
      const tag = /<text[\s>][^]*?<\/text>/g;
      let match: RegExpExecArray | null;
      while ((match = tag.exec(source)) !== null) {
        const segment = match[0];
        const inner = segment.slice(segment.indexOf(">") + 1, -"</text>".length);
        if (/<text[\s>]/.test(inner)) {
          const line = (source.slice(0, match.index).match(/\n/g) ?? []).length + 1;
          offenders.push(`${file}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
