export function buildUnifiedDiff(
  filePath: string,
  oldContent: string,
  newContent: string,
): string | undefined {
  if (oldContent === newContent) return undefined;

  const oldLines = oldContent ? oldContent.split(/\r?\n/) : [];
  const newLines = newContent ? newContent.split(/\r?\n/) : [];

  if (oldLines.length === 0) {
    return [
      `--- ${filePath}`,
      `+++ ${filePath}`,
      `@@ -1,0 +1,${newLines.length} @@`,
      ...newLines.map((line) => `+${line}`),
    ].join("\n");
  }

  return [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join("\n");
}
