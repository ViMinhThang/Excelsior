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
  private reducers = new Map<string, (state: TState, event: any, context?: TContext) => TState>();
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
    this.reducers.set(type, reducer);
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

