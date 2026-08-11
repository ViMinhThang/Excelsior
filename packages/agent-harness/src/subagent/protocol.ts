import type { ChildOutput } from "@excelsior/core";
import { childOutputSchema } from "@excelsior/core";

export function parseChildOutputLine(line: string): ChildOutput | null {
  if (!line.trim()) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const parsed = childOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export class ChildOutputLineReader {
  private remainder = "";

  constructor(private readonly onOutput: (output: ChildOutput) => void) {}

  push(chunk: string): void {
    this.remainder += chunk;
    const lines = this.remainder.split(/\r?\n/);
    this.remainder = lines.pop() ?? "";
    for (const line of lines) {
      this.handleLine(line);
    }
  }

  flush(): void {
    if (this.remainder.trim()) {
      this.handleLine(this.remainder);
    }
    this.remainder = "";
  }

  private handleLine(line: string): void {
    const output = parseChildOutputLine(line);
    if (output) this.onOutput(output);
  }
}
