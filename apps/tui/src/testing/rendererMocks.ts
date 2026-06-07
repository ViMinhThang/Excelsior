import { vi } from "vitest";

export const rendererMocks = {
  destroy: vi.fn(),
  requestRender: vi.fn(),
  resize: vi.fn(),
  terminalWidth: 80,
  terminalHeight: 24,
};