export class DisposableScope {
  private _cleanups: Array<() => void> = [];
  private _abortController: AbortController | null = null;
  private _disposed = false;

  add(
    disposable:
      | (() => void)
      | { dispose(): void }
      | AbortController
      | DisposableScope,
  ): void {
    if (this._disposed) {
      disposeOne(disposable);
      return;
    }
    if (disposable instanceof AbortController) {
      if (!this._abortController) {
        this._abortController = disposable;
      }
      this._cleanups.push(() => disposable.abort());
    } else if (typeof disposable === "function") {
      this._cleanups.push(disposable);
    } else {
      this._cleanups.push(() => disposeOne(disposable));
    }
  }

  get abortSignal(): AbortSignal {
    if (!this._abortController) {
      const ac = new AbortController();
      this._abortController = ac;
      this._cleanups.push(() => ac.abort());
    }
    return this._abortController.signal;
  }

  abort(reason?: unknown): void {
    if (!this._abortController) {
      this._abortController = new AbortController();
    }
    this._abortController.abort(reason);
    this.dispose();
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    const cleanups = this._cleanups.reverse();
    this._cleanups = [];
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (err) {
        process.stderr.write(`disposable: cleanup error: ${err}\n`);
      }
    }
  }

  get disposed(): boolean {
    return this._disposed;
  }
}

function disposeOne(
  disposable:
    | (() => void)
    | { dispose(): void }
    | AbortController
    | DisposableScope,
): void {
  if (typeof disposable === "function") {
    disposable();
  } else if (disposable instanceof AbortController) {
    disposable.abort();
  } else {
    disposable.dispose();
  }
}
