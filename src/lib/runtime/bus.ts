export type BusHandler = (data: any) => void;
export type Unsubscribe = () => void;

export interface Bus<TEvents extends Record<string, any>> {
  on<K extends keyof TEvents>(
    event: K,
    handler: (data: TEvents[K]) => void,
  ): Unsubscribe;
  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void;
  once<K extends keyof TEvents>(event: K): Promise<TEvents[K]>;
  getListenerCount<K extends keyof TEvents>(event: K): number;
}

export function createBus<TEvents extends Record<string, any>>(): Bus<TEvents> {
  const listeners = new Map<keyof TEvents, Set<(data: any) => void>>();

  return {
    on<K extends keyof TEvents>(event: K, handler: (data: TEvents[K]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => {
        listeners.get(event)!.delete(handler);
      };
    },

    emit<K extends keyof TEvents>(event: K, data: TEvents[K]) {
      listeners.get(event)?.forEach((handler) => handler(data));
    },

    once<K extends keyof TEvents>(event: K): Promise<TEvents[K]> {
      return new Promise((resolve) => {
        const unsub = this.on(event, (data) => {
          unsub();
          resolve(data);
        });
      });
    },

    getListenerCount<K extends keyof TEvents>(event: K): number {
      return listeners.get(event)?.size || 0;
    },
  };
}

export interface HubEvent {
  channel: string;
  event: string;
  data: unknown;
}

export type HubObserver = (hubEvent: HubEvent) => void;

export interface Hub {
  observe(observer: HubObserver): Unsubscribe;
  notify(channel: string, event: string, data: unknown): void;
  dispose(): void;
}

export function createHub(): Hub {
  const listeners = new Set<HubObserver>();

  return {
    observe(observer: HubObserver): Unsubscribe {
      listeners.add(observer);
      return () => {
        listeners.delete(observer);
      };
    },

    notify(channel: string, event: string, data: unknown): void {
      const hubEvent: HubEvent = { channel, event, data };
      for (const listener of listeners) {
        try {
          listener(hubEvent);
        } catch {}
      }
    },

    dispose(): void {
      listeners.clear();
    },
  };
}

/**
 * Creates a bus whose emits are forwarded to an optional Hub.
 *
 * @see src/lib/runtime/subAgentBus.ts for "sub-agent" channel
 * @see src/tui/lib/confirmBus.ts for "confirm" channel
 * @see src/lib/runtime/agentSession.ts:16 for "session" channel (created with no hub)
 */
export function createChannelBus<TEvents extends Record<string, any>>(
  channel: string,
  hub?: Hub,
): Bus<TEvents> {
  const inner = createBus<TEvents>();
  if (!hub) return inner;

  const origEmit = inner.emit.bind(inner);
  inner.emit = ((event: any, data: any) => {
    hub.notify(channel, String(event), data);
    origEmit(event, data);
  }) as Bus<TEvents>["emit"];

  return inner;
}
