import { z } from 'zod';

export const runCommandSchema = z.object({
  command: z.string().describe('The command to run'),
});

export type RunCommandInput = z.infer<typeof runCommandSchema>;
