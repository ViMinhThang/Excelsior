import { useRef, useCallback } from "react";

export function useEvent<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef<T>(fn);
  ref.current = fn;
  return useCallback((...args: Parameters<T>): ReturnType<T> => {
    return ref.current(...args);
  }, []) as unknown as T;
}
