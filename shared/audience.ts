import { z } from 'zod';

export const audienceMoods = ['quiet', 'listening', 'grooving', 'applause', 'cheering'] as const;
export type AudienceMood = (typeof audienceMoods)[number];
export const audienceDirectionSchema = z.object({
  mood: z.enum(audienceMoods),
  // Absolute bus attenuation after sample loudness calibration, before listener trim.
  levelDb: z.number().finite().min(-48).max(-12),
});
export type AudienceDirection = z.infer<typeof audienceDirectionSchema>;
export interface AudienceControls {
  enabled: boolean;
  levelDb: number;
  reactions: boolean;
}
export const defaultAudienceDirection = (): AudienceDirection => ({
  mood: 'listening',
  levelDb: -24,
});
export const defaultAudienceControls = (): AudienceControls => ({
  enabled: true,
  levelDb: 0,
  reactions: true,
});
const finite = (n: unknown, fallback: number, min: number, max: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
export function readAudienceControls(value: unknown): AudienceControls {
  const d = defaultAudienceControls();
  const v = value && typeof value === 'object' ? (value as Partial<AudienceControls>) : {};
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : d.enabled,
    reactions: typeof v.reactions === 'boolean' ? v.reactions : d.reactions,
    levelDb: finite(v.levelDb, d.levelDb, -48, 6),
  };
}
export function readAudienceDirection(value: unknown): AudienceDirection {
  const v = value && typeof value === 'object' ? (value as Partial<AudienceDirection>) : {};
  return {
    mood: audienceMoods.includes(v.mood as AudienceMood) ? v.mood! : 'listening',
    levelDb: finite(v.levelDb, -24, -48, -12),
  };
}
export function audienceGain(direction: AudienceDirection, controls: AudienceControls) {
  if (!controls.enabled || direction.mood === 'quiet') return 0;
  // A listener trim cannot defeat the absolute -12 dB ceiling.
  return 10 ** (Math.min(-12, Math.max(-96, direction.levelDb + controls.levelDb)) / 20);
}
export const audienceSampleSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,80}$/),
  path: z.string().regex(/^\/audience\/[a-z0-9_-]+\.(?:mp3|wav|ogg)$/),
  mood: z.enum(audienceMoods),
  kind: z.enum(['bed', 'reaction']),
  durationSeconds: z.number().finite().min(2).max(30),
  prompt: z.string().min(1).max(2400),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  approved: z.boolean(),
  billedCredits: z.number().finite().nonnegative().optional(),
});
export const audienceBankSchema = z
  .object({
    version: z.literal(1),
    source: z.literal('generated'),
    provider: z.string().min(1).max(100),
    model: z.string().min(1).max(100),
    createdAt: z.string().datetime(),
    license: z.string().min(1).max(1200),
    samples: z.array(audienceSampleSchema).max(100),
  })
  .superRefine((bank, ctx) => {
    if (new Set(bank.samples.map((s) => s.id)).size !== bank.samples.length)
      ctx.addIssue({ code: 'custom', message: 'Audience sample ids must be unique' });
  });
export type AudienceSample = z.infer<typeof audienceSampleSchema>;
export type AudienceBank = z.infer<typeof audienceBankSchema>;
export const audienceMoodDescriptions: Record<AudienceMood, string> = {
  quiet: 'Audience audio is silent; leave the musical space alone.',
  listening: 'A restrained venue room bed; the crowd is listening attentively.',
  grooving: 'A lightly animated room bed under the music, no applause interruption.',
  applause: 'Brief warm applause after an audible release or completed solo; sparingly.',
  cheering: 'A gentle celebratory reaction to an audible payoff, never screaming or abrupt.',
};
