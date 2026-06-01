export interface ReadModel<TState, in TEvent, TContext = undefined> {
  initialState(): TState;
  apply(state: TState, event: TEvent, context?: TContext): TState;
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

export class ProjectionRegistry<
  TState,
  TEvent extends { type: string },
  TContext = undefined,
> {
  private reducers = new Map<string, (state: TState, event: TEvent, context?: TContext) => TState>();
  private initial?: () => TState;

  initialState(fn: () => TState): this {
    this.initial = fn;
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
        return reducer ? reducer(state, event, context) : state;
      },
    };
  }
}
