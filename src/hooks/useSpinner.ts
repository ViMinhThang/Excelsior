import { useState, useEffect } from "react";
import { SPINNER_FRAMES } from "../constants.ts";

export const useSpinner = (speed: number = 80) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, speed);

    return () => clearInterval(timer);
  }, [speed]);

  return SPINNER_FRAMES[frameIndex];
};
