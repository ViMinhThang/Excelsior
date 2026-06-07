import { useEffect } from "react";
import { useRenderer } from "@opentui/react";

export function useViewportReset(resetKey: number) {
  const renderer = useRenderer();

  useEffect(() => {
    if (resetKey <= 0) return;

    renderer.requestRender();
    renderer.resize(renderer.terminalWidth, renderer.terminalHeight);
  }, [resetKey, renderer]);
}