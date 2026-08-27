import { vi } from "vitest";

export const rendererMocks = {
  destroy: vi.fn(),
  requestRender: vi.fn(),
  resize: vi.fn(),
  terminalWidth: 80,
  terminalHeight: 24,
};

export function setTerminalDimensions(width: number, height: number): void {
  rendererMocks.terminalWidth = width;
  rendererMocks.terminalHeight = height;
}
