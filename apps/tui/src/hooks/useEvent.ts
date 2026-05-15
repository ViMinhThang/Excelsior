import { useRef, useCallback, useLayoutEffect } from "react";

/**
 * useEvent is a custom hook that creates a stable callback reference
 * that always executes the latest version of a function.
 *
 * It solves the classic React dilemma:
 * 1. You want a callback whose identity never changes (to avoid re-renders or effect re-runs)
 * 2. You want that callback to always see the latest state and props (avoiding stale closures)
 *
 * How it works:
 * - It stores the function in a mutable Ref, updating it on every render.
 * - It returns a persistent wrapper function (via useCallback with empty deps).
 * - When the wrapper is called, it dynamically looks up and runs ref.current.
 *
 * Result: Stable Identity + Fresh Implementation.
 */
export function useEvent<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef<T>(fn);
  // We update ref.current to the newest version of 'fn' on every render.
  ref.current = fn;
  // This wrapper identity NEVER changes ([] deps).
  // It acts as a permanent middleman that forwards calls to the latest ref.current.
  return useCallback((...args: Parameters<T>): ReturnType<T> => {
    return ref.current(...args as never[]) as ReturnType<T>;
  }, []) as unknown as T;
}
