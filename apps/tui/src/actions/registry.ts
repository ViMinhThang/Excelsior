import type { Store } from "../store/store.js";

export type ActionHandler = (store: Store, arg: string | null) => void;

export const ACTION_REGISTRY: Record<string, ActionHandler> = {};

export function register(name: string, handler: ActionHandler): void {
  ACTION_REGISTRY[name] = handler;
}

export function dispatchAction(store: Store, actionName: string, arg: string | null = null): boolean {
  const colon = actionName.indexOf(":");
  let name = actionName;
  if (colon >= 0) {
    name = actionName.slice(0, colon);
    arg = actionName.slice(colon + 1);
  }
  const handler = ACTION_REGISTRY[name];
  if (!handler) return false;
  handler(store, arg);
  return true;
}
