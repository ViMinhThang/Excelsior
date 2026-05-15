import { useState, useEffect } from "react";

export function useCommandResult(input: string) {
  const [commandResult, setCommandResult] = useState<string | null>(null);

  useEffect(() => {
    if (input) {
      setCommandResult(null);
    }
  }, [input]);

  return { commandResult, setCommandResult };
}
