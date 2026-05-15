import { z } from 'zod';

export const runCommandSchema = z.object({
  command: z.string().describe('The executable to run (e.g., "npm", "git", "node", "ls", "cat")'),
  args: z.array(z.string()).describe('The arguments for the command'),
});

export type RunCommandInput = z.infer<typeof runCommandSchema>;
