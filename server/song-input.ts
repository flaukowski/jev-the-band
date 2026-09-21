import { z } from 'zod';
// Anyone may submit a song: drop control, zero-width and bidi-override characters before the
// text reaches the archive, the prompt or another audience member's screen.
const UNSAFE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g;
export const clean = (text: string) =>
  text.normalize('NFC').replace(/\r\n?/g, '\n').replace(UNSAFE, '');
export const songInput = z.object({
  title: z
    .string()
    .max(400)
    .transform(clean)
    .pipe(
      z
        .string()
        .trim()
        .min(1)
        .max(80)
        .regex(/^[^\n]+$/),
    ),
  description: z.string().max(8000).transform(clean).pipe(z.string().trim().max(3900)).default(''),
});
export const songPrompt = (song: z.infer<typeof songInput>) =>
  [song.title, song.description].filter(Boolean).join('\n');
