import { vi } from "vitest";
import { rendererMocks } from "./src/testing/rendererMocks.js";

vi.mock("@opentui/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@opentui/core")>();
  return {
    ...actual,
    TextAttributes: {
      NONE: 0,
      BOLD: 1,
      DIM: 2,
      ITALIC: 4,
      UNDERLINE: 8,
      BLINK: 16,
      INVERSE: 32,
      HIDDEN: 64,
      STRIKETHROUGH: 128,
    },
  };
});

vi.mock("@opentui/react", () => ({
  createRoot: vi.fn(() => ({ render: vi.fn(), unmount: vi.fn() })),
  useKeyboard: vi.fn(() => {}),
  useRenderer: () => ({
    destroy: rendererMocks.destroy,
    width: rendererMocks.terminalWidth,
    height: rendererMocks.terminalHeight,
    terminalWidth: rendererMocks.terminalWidth,
    terminalHeight: rendererMocks.terminalHeight,
    requestRender: rendererMocks.requestRender,
    resize: rendererMocks.resize,
  }),
  useTerminalDimensions: () => ({
    width: rendererMocks.terminalWidth,
    height: rendererMocks.terminalHeight,
  }),
}));
