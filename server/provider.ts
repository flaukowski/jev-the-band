import type { JevProvider } from '../shared/music.js';

export const decisionEndpoints: Record<JevProvider, string> = {
  openrouter: 'https://openrouter.ai/api/alpha/decisions',
  typesafe: 'https://api.typesafe.ai/v1/systemone',
};

/**
 * Where a decision request actually goes.
 *
 * `JEV_DECISIONS_ENDPOINT` sends every decision to one address instead of the
 * provider's own. It exists so a local shim can stand in front of the band and
 * answer the roles it can while forwarding the rest — the whole of Jev keeps
 * one provider, one model id and one trace format, and only the address moves.
 *
 * The override is disclosed, not hidden: `callJev` records the address it used
 * in `trace.endpoint`, so a room running against a shim says so in every trace
 * it publishes, exactly as it does when it switches provider.
 */
export function decisionEndpoint(
  provider: JevProvider,
  env: Record<string, string | undefined> = process.env,
): string {
  return env.JEV_DECISIONS_ENDPOINT?.trim() || decisionEndpoints[provider];
}

export interface JevConfig {
  provider: JevProvider;
  apiKey: string;
  model: string;
  directorKey: string;
  directorModel?: string;
  /** The other provider, used only after the selected one fails. Disclosed in the room and every trace. */
  fallback?: { provider: JevProvider; apiKey: string; model: string };
}

/** Server-only configuration. Never serialize this object into a room or a trace. */
export function jevConfig(env: Record<string, string | undefined> = process.env): JevConfig {
  const selected = env.JEV_PROVIDER?.trim() || 'auto';
  if (!['auto', 'openrouter', 'typesafe'].includes(selected))
    throw new Error('JEV_PROVIDER must be auto, openrouter or typesafe');
  const provider: JevProvider =
    selected === 'auto'
      ? env.TYPESAFE_API_KEY?.trim()
        ? 'typesafe'
        : 'openrouter'
      : (selected as JevProvider);
  const apiKey =
    (provider === 'typesafe' ? env.TYPESAFE_API_KEY : env.OPENROUTER_API_KEY)?.trim() || '';
  const configuredModel =
    (provider === 'typesafe' ? env.TYPESAFE_MODEL : env.OPENROUTER_JEV_MODEL)?.trim() ||
    env.JEV_MODEL?.trim();
  let model = configuredModel || (provider === 'typesafe' ? 'jev-1.13.0' : 'typesafe/jev-1.13');
  // Preserve the historical .env pin when changing transport.
  if (provider === 'typesafe' && model === 'typesafe/jev-1.13') model = 'jev-1.13.0';
  if (provider === 'openrouter' && model === 'jev-1.13.0') model = 'typesafe/jev-1.13';
  if (
    (provider === 'typesafe' && model.includes('/')) ||
    (provider === 'openrouter' && !model.includes('/'))
  )
    throw new Error('Jev model ID does not match the selected provider');
  const directorKey = env.OPENROUTER_API_KEY?.trim() || '';
  const other: JevProvider = provider === 'typesafe' ? 'openrouter' : 'typesafe';
  const otherKey =
    (other === 'typesafe' ? env.TYPESAFE_API_KEY : env.OPENROUTER_API_KEY)?.trim() || '';
  const otherModel =
    (other === 'typesafe' ? env.TYPESAFE_MODEL : env.OPENROUTER_JEV_MODEL)?.trim() ||
    (other === 'typesafe' ? 'jev-1.13.0' : 'typesafe/jev-1.13');
  return {
    fallback:
      apiKey && otherKey && env.JEV_FALLBACK !== '0'
        ? { provider: other, apiKey: otherKey, model: otherModel }
        : undefined,
    provider,
    apiKey,
    model,
    directorKey,
    directorModel:
      env.DIRECTOR_ENABLED === '0' || !directorKey
        ? undefined
        : env.DIRECTOR_MODEL?.trim() || 'openai/gpt-5.6-luna',
  };
}
