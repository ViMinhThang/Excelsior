import { generateId } from "@excelsior/core";

export interface StorageTimeIdPolicy {
  createId(prefix: string): string;
  nowIso(): string;
}

export const systemStorageTimeIdPolicy: StorageTimeIdPolicy = {
  createId: (prefix) => generateId(prefix),
  nowIso: () => new Date().toISOString(),
};

export function formatStorageTimestamp(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}
