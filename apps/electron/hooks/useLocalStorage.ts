"use client";

import { useCallback, useEffect, useState } from "react";

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const readValue = useCallback((): T => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  }, [key, initialValue]);

  const [storedValue, setStoredValue] = useState<T>(readValue);

  // Sync on mount (handles SSR mismatch)
  useEffect(() => {
    setStoredValue(readValue());
  }, [readValue]);

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const next =
          value instanceof Function ? (value as (p: T) => T)(storedValue) : value;
        window.localStorage.setItem(key, JSON.stringify(next));
        setStoredValue(next);
      } catch (error) {
        console.warn(`useLocalStorage: failed to set "${key}"`, error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}
