import { act } from "react";
import TestRenderer, { type ReactTestInstance } from "react-test-renderer";
import type { ReactElement, ReactNode } from "react";

export interface RenderTuiOptions {
  width?: number;
  height?: number;
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function extractText(node: ReactTestInstance | string | number): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  return node.children
    .map((child: ReactTestInstance | string | number) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      return extractText(child);
    })
    .join("");
}

export async function renderTui(
  node: ReactNode,
  _options: RenderTuiOptions = {},
) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  let testRenderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    testRenderer = TestRenderer.create(node as ReactElement);
  });

  const renderer = {
    destroy: () => {
      act(() => {
        testRenderer.unmount();
      });
      globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    },
  };

  return {
    flush: async () => {},
    captureCharFrame: () => extractText(testRenderer.root),
    lastFrame: () => extractText(testRenderer.root),
    destroy: () => renderer.destroy(),
    renderer,
  };
}