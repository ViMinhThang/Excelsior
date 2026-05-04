export function parseNumber(value: string | undefined, opts?: { integer?: boolean }): number | undefined {
  if (value === undefined || value === "" || value.trim() === "") return undefined;
  const n = Number(value);
  if (Number.isNaN(n)) return undefined;
  if (opts?.integer && !Number.isInteger(n)) return undefined;
  return n;
}
