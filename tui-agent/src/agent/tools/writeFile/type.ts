import { z } from 'zod';

export const writeFileSchema = z.object({
  path: z.string().describe('The path to the file to write'),
  content: z.string().describe('The content to write'),
});

export type WriteFileInput = z.infer<typeof writeFileSchema>;
