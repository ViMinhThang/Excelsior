import { useEffect, useState } from "react";

import { SPINNER_FRAMES } from "../constants.js";

export const useSpinner = (speed = 80) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((current) => (current + 1) % SPINNER_FRAMES.length);
    }, speed);

    return () => clearInterval(timer);
  }, [speed]);

  return SPINNER_FRAMES[frameIndex];
};
