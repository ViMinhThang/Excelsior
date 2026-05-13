import { execFile } from "child_process";

export function execPromise(command: string): Promise<{ stdout: string }> {
  const parts = command.split(" ");
  const cmd = parts[0];
  const args = parts.slice(1);
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve({ stdout });
    });
  });
}
