import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { directJam } from '../server/director.js';
import { bootstrapRequest, callJev } from '../server/jev.js';
import { jevConfig } from '../server/provider.js';
const config = jevConfig();
if (!config.apiKey || !config.directorKey)
  throw new Error('Configure Jev and the OpenRouter director key first.');
// Explicit paid check: exactly two LLM briefs and at most two Jev opening decisions, no room or playback.
const keepAlive = setInterval(() => {}, 1000);
const results = [];
for (const prompt of [
  'the grieving pastor decides to burn it all down',
  'saturday after nursery rhymes',
]) {
  const director = await directJam(
    prompt,
    process.env.DIRECTOR_MODEL || 'openai/gpt-5.6-luna',
    config.directorKey,
    ['bass', 'bass'],
  );
  const opening = director.concept
    ? await callJev(
        bootstrapRequest(prompt, config.model, director.concept, ['bass', 'bass']),
        'host',
        -1,
        config.apiKey,
        undefined,
        config.provider,
      )
    : undefined;
  results.push({ prompt, director, opening });
  console.log(
    JSON.stringify(
      {
        prompt,
        status: director.status,
        model: director.model,
        cost: director.cost,
        error: director.error,
        concept: director.concept?.concept,
        opening:
          opening &&
          Object.fromEntries(Object.entries(opening.answers).map(([k, a]) => [k, a.choice])),
        chapters: director.concept?.chapters.map((c) => ({
          name: c.name,
          at: c.atSeconds,
          style: c.style,
          arc: c.arc,
        })),
      },
      null,
      2,
    ),
  );
}
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/director-audit.json',
  JSON.stringify({ testedAt: new Date().toISOString(), results }, null, 2),
);
if (
  results.some((r) => r.director.status !== 'ready' || r.opening?.source !== 'jev') ||
  results[0].director.concept?.concept === results[1].director.concept?.concept
)
  process.exitCode = 1;
clearInterval(keepAlive);
