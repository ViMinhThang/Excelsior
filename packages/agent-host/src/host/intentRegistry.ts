import type {
  AgentHostIntent,
  AgentHostDispatchResult,
  IntentHandler,
  IntentMiddleware,
} from "@excelsior/client";

interface RegisteredHandler {
  handle(intent: AgentHostIntent): Promise<AgentHostDispatchResult> | AgentHostDispatchResult;
}

export class IntentRegistry {
  private handlers = new Map<string, RegisteredHandler>();
  private middleware: IntentMiddleware[] = [];

  register<T extends AgentHostIntent["type"]>(handler: IntentHandler<T>): this {
    this.handlers.set(handler.type, {
      handle: (intent: AgentHostIntent) => {
        return handler.handle(intent as Extract<AgentHostIntent, { type: T }>);
      },
    });
    return this;
  }

  on<T extends AgentHostIntent["type"]>(
    type: T,
    handle: (intent: Extract<AgentHostIntent, { type: T }>) => Promise<AgentHostDispatchResult> | AgentHostDispatchResult,
  ): this {
    this.handlers.set(type, {
      handle: (intent: AgentHostIntent) => {
        return handle(intent as Extract<AgentHostIntent, { type: T }>);
      },
    });
    return this;
  }

  use(mw: IntentMiddleware): this {
    this.middleware.push(mw);
    return this;
  }

  async dispatch(intent: AgentHostIntent): Promise<AgentHostDispatchResult> {
    const handler = this.handlers.get(intent.type);
    if (!handler) {
      throw new Error(`No handler registered for intent: ${intent.type}`);
    }

    const execute = () => Promise.resolve(handler.handle(intent));

    // Build the middleware chain from right to left
    const chain = this.middleware.reduceRight<() => Promise<AgentHostDispatchResult>>(
      (next, mw) => () => mw(intent, next),
      execute,
    );

    return chain();
  }

  has(type: AgentHostIntent["type"]): boolean {
    return this.handlers.has(type);
  }
}
