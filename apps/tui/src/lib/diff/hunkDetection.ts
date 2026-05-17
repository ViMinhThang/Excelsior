export interface HunkInfo {
  startLine: number;
  header: string;
}

export function detectHunks(diffLines: string[]): HunkInfo[] {
  const hunks: HunkInfo[] = [];
  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].startsWith("@@")) {
      hunks.push({ startLine: i, header: diffLines[i] });
    }
  }
  return hunks;
}

export function findNextHunk(
  currentLine: number,
  hunks: HunkInfo[],
): number {
  for (const hunk of hunks) {
    if (hunk.startLine > currentLine) return hunk.startLine;
  }
  return hunks[0]?.startLine ?? currentLine;
}

export function findPrevHunk(
  currentLine: number,
  hunks: HunkInfo[],
): number {
  const reversed = [...hunks].reverse();
  for (const hunk of reversed) {
    if (hunk.startLine < currentLine) return hunk.startLine;
  }
  return hunks[hunks.length - 1]?.startLine ?? currentLine;
}
