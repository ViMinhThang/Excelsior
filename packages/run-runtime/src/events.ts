import { randomUUID } from "crypto";

export type RunEventDataMap = Record<string, unknown>;

export interface RunEvent<TType extends string, TData> {
  id: string;
  runId: string;
  sequence: number;
  type: TType;
  version: number;
  causationId: string;
  correlationId: string;
  timestamp: string;
  data: TData;
  parentEventId?: string;
  relatedToolCallId?: string;
}

export type AnyRunEvent<TEvents extends { [K in keyof TEvents]: unknown }> = {
  [T in keyof TEvents & string]: RunEvent<T, TEvents[T]>;
}[keyof TEvents & string];

export interface RunEventOverrides {
  parentEventId?: string;
  relatedToolCallId?: string;
  causationId?: string;
  correlationId?: string;
}

export interface MakeRunEventOptions extends RunEventOverrides {
  eventVersion: number;
  createEventId?: () => string;
}

export function makeRunEvent<
  TEvents extends { [K in keyof TEvents]: unknown },
  TType extends keyof TEvents & string,
>(
  runId: string,
  type: TType,
  data: TEvents[TType],
  sequence: number,
  options: MakeRunEventOptions,
): RunEvent<TType, TEvents[TType]> {
  return {
    id: options.createEventId?.() ?? `evt_${randomUUID()}`,
    runId,
    sequence,
    type,
    version: options.eventVersion,
    causationId: options.causationId ?? "",
    correlationId: options.correlationId ?? runId,
    timestamp: new Date().toISOString(),
    data,
    ...(options.parentEventId ? { parentEventId: options.parentEventId } : {}),
    ...(options.relatedToolCallId ? { relatedToolCallId: options.relatedToolCallId } : {}),
  };
}
