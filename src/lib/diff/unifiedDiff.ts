export type DiffAction = "create" | "overwrite" | "edit";

function normalizeLines(content: string): string[] {
  if (content.length === 0) return [];
  return content.endsWith("\n")
    ? content.slice(0, -1).split(/\r?\n/)
    : content.split(/\r?\n/);
}

function commonPrefixLength(a: string[], b: string[]): number {
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index++;
  return index;
}

function commonSuffixLength(a: string[], b: string[], prefixLength: number): number {
  let count = 0;
  while (
    count < a.length - prefixLength &&
    count < b.length - prefixLength &&
    a[a.length - 1 - count] === b[b.length - 1 - count]
  ) {
    count++;
  }
  return count;
}

export function createUnifiedDiff(filePath: string, before: string, after: string, contextLines = 3): string {
  if (before === after) return `--- ${filePath}\n+++ ${filePath}\n(no changes)`;

  const oldLines = normalizeLines(before);
  const newLines = normalizeLines(after);
  const prefix = commonPrefixLength(oldLines, newLines);
  const suffix = commonSuffixLength(oldLines, newLines, prefix);
  const oldStart = Math.max(0, prefix - contextLines);
  const newStart = Math.max(0, prefix - contextLines);
  const oldEnd = Math.min(oldLines.length, oldLines.length - suffix + contextLines);
  const newEnd = Math.min(newLines.length, newLines.length - suffix + contextLines);
  const oldCount = Math.max(0, oldEnd - oldStart);
  const newCount = Math.max(0, newEnd - newStart);
  const output = [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    `@@ -${oldStart + 1},${oldCount} +${newStart + 1},${newCount} @@`,
  ];

  for (let i = oldStart; i < prefix; i++) output.push(` ${oldLines[i]}`);
  for (let i = prefix; i < oldLines.length - suffix; i++) output.push(`-${oldLines[i]}`);
  for (let i = prefix; i < newLines.length - suffix; i++) output.push(`+${newLines[i]}`);
  for (let i = newLines.length - suffix; i < newEnd; i++) output.push(` ${newLines[i]}`);

  return output.join("\n");
}
