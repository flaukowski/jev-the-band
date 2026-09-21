import { z } from 'zod';
export const songInput = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[^\r\n]+$/),
  description: z.string().trim().max(3900).default(''),
});
export const songPrompt = (song: z.infer<typeof songInput>) =>
  [song.title, song.description].filter(Boolean).join('\n');
