export interface ReadModel<TState, in TEvent, TContext = undefined> {
  initialState(): TState;
  apply(state: TState, event: TEvent, context?: TContext): TState;
}

export function defineReadModel<TState, TEvent, TContext = undefined>(
  model: ReadModel<TState, TEvent, TContext>,
): ReadModel<TState, TEvent, TContext> {
  return model;
}

export function projectEvents<TState, TEvent, TContext = undefined>(
  model: ReadModel<TState, TEvent, TContext>,
  events: readonly TEvent[],
  context?: TContext,
): TState {
  let state = model.initialState();
  for (const event of events) {
    state = model.apply(state, event, context);
  }
  return state;
}

/** Middleware logic to intercept or augment individual event applications */
export type ProjectionMiddleware<TState, TEvent, TContext = undefined> = (
  state: TState,
  event: TEvent,
  context: TContext | undefined,
  next: (state: TState) => TState,
) => TState;

export class ProjectionRegistry<
  TState,
  TEvent extends { type: string },
  TContext = undefined,
> {
  private reducers = new Map<string, (state: TState, event: TEvent, context?: TContext) => TState>();
  private middleware: ProjectionMiddleware<TState, TEvent, TContext>[] = [];
  private initial?: () => TState;

  initialState(fn: () => TState): this {
    this.initial = fn;
    return this;
  }

  use(mw: ProjectionMiddleware<TState, TEvent, TContext>): this {
    this.middleware.push(mw);
    return this;
  }

  on<K extends TEvent["type"]>(
    type: K,
    reducer: (state: TState, event: Extract<TEvent, { type: K }>, context?: TContext) => TState,
  ): this {
    this.reducers.set(type, reducer as unknown as (state: TState, event: TEvent, context?: TContext) => TState);
    return this;
  }

  build(): ReadModel<TState, TEvent, TContext> {
    if (!this.initial) {
      throw new Error("Initial state function must be defined on ProjectionRegistry");
    }

    return {
      initialState: this.initial,
      apply: (state: TState, event: TEvent, context?: TContext): TState => {
        const reducer = this.reducers.get(event.type);
        const execute = (s: TState) => (reducer ? reducer(s, event, context) : s);

        // Build middleware chain from right to left
        const chain = this.middleware.reduceRight<(s: TState) => TState>(
          (next, mw) => (s) => mw(s, event, context, next),
          execute,
        );

        return chain(state);
      },
    };
  }
}

/**
 * Composes multiple state mutator functions from left to right.
 * Each mutator function accepts state, event, and optional context, and returns modified state.
 */
export function compose<TState, TEvent, TContext = undefined>(
  ...fns: readonly ((state: TState, event: TEvent, context?: TContext) => TState)[]
): (state: TState, event: TEvent, context?: TContext) => TState {
  return (state: TState, event: TEvent, context?: TContext) => {
    return fns.reduce((s, fn) => fn(s, event, context), state);
  };
}

/**
 * Creates a mutator that accumulates value(s) into state by merging a partial state.
 * Works similarly to assign, but allows retrieving the partial update dynamically via a mapper function.
 */
export function accumulate<TState, TEvent, TContext = undefined>(
  mapper: (state: TState, event: TEvent, context?: TContext) => Partial<TState>,
): (state: TState, event: TEvent, context?: TContext) => TState {
  return (state: TState, event: TEvent, context?: TContext) => {
    return {
      ...state,
      ...mapper(state, event, context),
    };
  };
}

/**
 * Creates a mutator that shallow-copies state and updates a specific key using an updater function.
 */
export function assign<TState, TKey extends keyof TState, TEvent, TContext = undefined>(
  key: TKey,
  updater: (state: TState, event: TEvent, context?: TContext) => TState[TKey],
): (state: TState, event: TEvent, context?: TContext) => TState {
  return (state: TState, event: TEvent, context?: TContext) => {
    return {
      ...state,
      [key]: updater(state, event, context),
    };
  };
}

