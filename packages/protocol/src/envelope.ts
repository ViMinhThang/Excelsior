export const PROTOCOL_VERSION = 2 as const;

export type EnvelopeType =
  | "command"
  | "delta"
  | "request"
  | "response"
  | "heartbeat";

export interface Envelope {
  v: typeof PROTOCOL_VERSION;
  seq: number;
  type: EnvelopeType;
  payload: unknown;
}

export function makeEnvelope(
  type: EnvelopeType,
  payload: unknown,
  seq: number,
): Envelope {
  return { v: PROTOCOL_VERSION, seq, type, payload };
}

export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.v === PROTOCOL_VERSION &&
    typeof candidate.seq === "number" &&
    typeof candidate.type === "string" &&
    "payload" in candidate
  );
}
