export function createBus<TEvents extends Record<string, any>>() {
  const listeners = new Map<keyof TEvents, Set<(data: any) => void>>();

  return {
    on<K extends keyof TEvents>(event: K, handler: (data: TEvents[K]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
      return () => { listeners.get(event)!.delete(handler); }; // explicitly return void
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
