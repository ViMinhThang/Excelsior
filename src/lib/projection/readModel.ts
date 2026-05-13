export interface ReadModel<TState, in TEvent> {
  initialState(): TState;
  apply(state: TState, event: TEvent): TState;
}

export function projectEvents<TState, TEvent>(
  model: ReadModel<TState, TEvent>,
  events: readonly TEvent[],
  applyOptions?: unknown,
): TState {
  let state = model.initialState();
  for (const event of events) {
    state = model.apply(state, event);
  }
  return state;
}
