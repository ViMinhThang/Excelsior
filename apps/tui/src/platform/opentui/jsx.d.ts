import type { ReactNode } from "react";

declare module "react" {
  interface FunctionComponent<P = Record<string, never>> {
    (props: P): ReactNode;
  }
}

declare module "@opentui/react" {
  namespace JSX {
    type Element = ReactNode;
    interface ElementClass {
      render(): ReactNode;
    }
  }
}