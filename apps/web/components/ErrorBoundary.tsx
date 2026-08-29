"use client";

import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; message?: string };

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-6 bg-[var(--bg-canvas)] text-[var(--text-main)]">
          <div className="max-w-md text-center space-y-3">
            <h2 className="text-sm font-semibold">Something went wrong</h2>
            <p className="text-xs text-[var(--text-muted)] break-words">{this.state.message ?? "An unexpected error occurred."}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: undefined })}
              className="px-3 py-1.5 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-xs"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
