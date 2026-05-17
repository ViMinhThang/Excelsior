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
