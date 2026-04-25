export interface Stage<TContext, TResult> {
  id: string;
  name: string;
  execute(context: TContext): Promise<TResult>;
}

export interface Workflow<TInput, TOutput, TContext> {
  name: string;
  prepare(input: TInput): Promise<TContext>;
  stages: Stage<TContext, any>[];
  synthesize(results: any[], context: TContext): Promise<TOutput>;
}

export class Orchestrator {
  async run<TInput, TOutput, TContext>(
    workflow: Workflow<TInput, TOutput, TContext>,
    input: TInput,
  ): Promise<TOutput> {
    const context = await workflow.prepare(input);

    const stageResults = await Promise.all(
      workflow.stages.map(async (stage) => {
        try {
          return await stage.execute(context);
        } catch (error) {
          throw new Error(
            `Stage '${stage.name}' failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }),
    );

    return workflow.synthesize(stageResults, context);
  }
}
