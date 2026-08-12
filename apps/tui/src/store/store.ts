import { useCallback, useContext, useRef, useSyncExternalStore, createElement } from "react";
import { createContext } from "react";
import type { UiState } from "./types.js";

export type ActionFn = (state: UiState) => Partial<UiState> | void;

export interface Store {
  getState(): UiState;
  dispatch(action: ActionFn): void;
  subscribe(listener: () => void): () => void;
}

class StoreImpl implements Store {
  private state: UiState;
  private readonly listeners = new Set<() => void>();

  constructor(initial: UiState) {
    this.state = initial;
  }

  readonly getState = (): UiState => {
    return this.state;
  };

  readonly dispatch = (action: ActionFn): void => {
    const patch = action(this.state);
    if (!patch) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export function createStore(initial: UiState): Store {
  return new StoreImpl(initial);
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ store, children }: { store: Store; children?: React.ReactNode }) {
  return createElement(StoreContext.Provider, { value: store }, children);
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore: missing StoreProvider");
  return store;
}

export function useSlice<T>(selector: (state: UiState) => T): T {
  const store = useStore();
  const cache = useRef<{ state: UiState; value: T } | null>(null);
  const getSnapshot = useCallback(() => {
    const state = store.getState();
    if (cache.current && cache.current.state === state) return cache.current.value;
    const value = selector(state);
    cache.current = { state, value };
    return value;
  }, [store, selector]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
