export interface Stage<TContext, TResult> {
  id: string;
  name: string;
  required?: boolean;
  execute(context: TContext): Promise<TResult>;
}

export type StageOutcome<TResult> =
  | { ok: true; stageId: string; stageName: string; durationMs: number; value: TResult }
  | { ok: false; stageId: string; stageName: string; durationMs: number; error: Error };

export interface Workflow<TInput, TOutput, TContext> {
  name: string;
  prepare(input: TInput): Promise<TContext>;
  stages: Stage<TContext, unknown>[];
  synthesize(results: StageOutcome<unknown>[], context: TContext): Promise<TOutput>;
}

export class Orchestrator {
  async run<TInput, TOutput, TContext>(
    workflow: Workflow<TInput, TOutput, TContext>,
    input: TInput,
  ): Promise<TOutput> {
    const context = await workflow.prepare(input);

    const stageResults = await Promise.all(
      workflow.stages.map(async (stage) => {
        const startedAt = Date.now();
        try {
          const value = await stage.execute(context);
          return {
            ok: true,
            stageId: stage.id,
            stageName: stage.name,
            durationMs: Date.now() - startedAt,
            value,
          } satisfies StageOutcome<unknown>;
        } catch (error) {
          const stageError = error instanceof Error ? error : new Error(String(error));
          if (stage.required ?? true) {
            throw new Error(`Stage '${stage.name}' failed: ${stageError.message}`);
          }

          return {
            ok: false,
            stageId: stage.id,
            stageName: stage.name,
            durationMs: Date.now() - startedAt,
            error: stageError,
          } satisfies StageOutcome<unknown>;
        }
      }),
    );

    return workflow.synthesize(stageResults, context);
  }
}
