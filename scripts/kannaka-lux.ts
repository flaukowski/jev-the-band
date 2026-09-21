#!/usr/bin/env node
/**
 * kannaka-lux.ts — put a local brain on the lighting desk.
 *
 * Runs the decision contract in front of Jev. Requests for a role it is
 * configured to take are answered by a locally served model; everything else
 * is forwarded upstream untouched, with the band's own credential, so moving
 * one seat in-house changes nothing else about the performance.
 *
 *   npm run lux
 *   JEV_PROVIDER=typesafe TYPESAFE_API_KEY=... \
 *   JEV_DECISIONS_ENDPOINT=http://127.0.0.1:8088/v1/systemone npm run dev
 *
 * Environment
 *   KANNAKA_ENDPOINT   OpenAI-compatible chat endpoint of the local model
 *                      (default http://127.0.0.1:11434/v1/chat/completions)
 *   KANNAKA_MODEL      default kannaka-brain-7b-v1:latest
 *   KANNAKA_ROLES      personas answered locally (default LUX)
 *   KANNAKA_UPSTREAM   where everything else goes: openrouter | typesafe | URL
 *   KANNAKA_PORT       default 8088
 *
 * THIS PROCESS HOLDS NO PROVIDER CREDENTIAL. It forwards the Authorization
 * header the band sent and never reads a key from its own environment, so
 * running it cannot widen who can spend on the upstream account.
 */
import express from 'express';
import { parseAnswers } from '../server/jev.js';
import { decisionEndpoints } from '../server/provider.js';
import {
  answerLocally,
  personaName,
  rolesFromEnv,
  shouldAnswerLocally,
  type Complete,
} from '../server/kannaka-shim.js';
import type { JevRequest } from '../shared/music.js';

const PORT = Number(process.env.KANNAKA_PORT || 8088);
const MODEL = process.env.KANNAKA_MODEL || 'kannaka-brain-7b-v1:latest';
const ENDPOINT = process.env.KANNAKA_ENDPOINT || 'http://127.0.0.1:11434/v1/chat/completions';
const ROLES = rolesFromEnv();
const UPSTREAM = (() => {
  const raw = process.env.KANNAKA_UPSTREAM?.trim() || 'openrouter';
  if (raw === 'openrouter' || raw === 'typesafe') return decisionEndpoints[raw];
  return raw;
})();

/**
 * How long the runtime should hold the model in memory between phrases.
 *
 * Measured: warm, LUX answers in about 0.93 s, comfortably inside Jev's 1.8 s
 * abort. Cold — the first request after the runtime has evicted the model — it
 * took 3.75 s and blew the budget. Ollama unloads after five idle minutes by
 * default, and a band that pauses between songs is idle, so without this the
 * lighting desk would miss its first decision every time the room goes quiet
 * and Jev would hold the previous look without anyone knowing why.
 */
const KEEP_ALIVE = process.env.KANNAKA_KEEP_ALIVE || '30m';

/** One question, one token, top-k over the option letters. */
const complete: Complete = async (system, user, maxTokens) => {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0,
      logprobs: true,
      top_logprobs: 20,
      keep_alive: KEEP_ALIVE,
    }),
  });
  if (!response.ok) throw new Error(`local model HTTP ${response.status}`);
  const payload = await response.json();
  const choice = payload.choices?.[0];
  return {
    text: String(choice?.message?.content ?? ''),
    tokens: (choice?.logprobs?.content ?? []).map((t: { token: string; top_logprobs?: unknown }) => ({
      token: String(t.token ?? ''),
      top_logprobs: (t.top_logprobs ?? []) as { token: string; logprob: number }[],
    })),
  };
};

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) =>
  res.json({ ok: true, model: MODEL, roles: [...ROLES], upstream: UPSTREAM }),
);

async function handle(req: express.Request, res: express.Response) {
  const request = req.body as JevRequest;
  const who = personaName(request) || 'unknown';
  const started = performance.now();

  if (!request?.questions || typeof request.questions !== 'object') {
    res.status(400).json({ error: 'not a decision request' });
    return;
  }

  // Not ours: forward with the band's own credential, and say so in the log.
  if (!shouldAnswerLocally(request, ROLES)) {
    try {
      const upstream = await fetch(UPSTREAM, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
          ...(req.headers['x-title'] ? { 'X-Title': String(req.headers['x-title']) } : {}),
        },
        body: JSON.stringify(request),
      });
      const payload = await upstream.json();
      console.log(`${who.padEnd(6)} → upstream  ${upstream.status}  ${Math.round(performance.now() - started)} ms`);
      res.status(upstream.status).json(payload);
    } catch (error) {
      console.error(`${who.padEnd(6)} → upstream FAILED: ${(error as Error).message}`);
      res.status(502).json({ error: 'upstream unreachable' });
    }
    return;
  }

  // Ours. Answer it, then hold the answer to Jev's own standard before sending.
  try {
    const { answers, repaired } = await answerLocally(request, { complete });
    const body = {
      id: `kannaka-${Date.now().toString(36)}`,
      model: MODEL,
      answers,
      usage: { cost: 0 },
    };
    // The band would reject a bad answer set anyway; better it never leaves here,
    // and better the log says which question broke than that the band goes quiet.
    parseAnswers(body, request);
    const ms = Math.round(performance.now() - started);
    console.log(
      `${who.padEnd(6)} → local     ok  ${ms} ms  ${Object.keys(answers).length} answers` +
        (repaired.length ? `  repaired ${repaired.join(',')}` : '') +
        (ms > 1800 ? '  OVER BUDGET' : ''),
    );
    res.json(body);
  } catch (error) {
    // A refusal is better than a wrong answer: Jev treats a failed decision as a
    // fallback, holds the previous look, and discloses it. Answering badly would
    // be invisible instead.
    console.error(`${who.padEnd(6)} → local     REFUSED: ${(error as Error).message}`);
    res.status(502).json({ error: `local decision failed: ${(error as Error).message}` });
  }
}

app.post('/v1/systemone', handle);
app.post('/api/alpha/decisions', handle);

/**
 * Pay the load cost before the band needs an answer, not during the first
 * phrase. One throwaway question is enough to bring the weights in.
 */
async function warm(): Promise<void> {
  const started = performance.now();
  try {
    await complete('You answer with letters only.', 'Pick one.\nA) yes\nB) no\n\nAnswer:', 1);
    console.log(`  warm      ready in ${Math.round(performance.now() - started)} ms`);
  } catch (error) {
    console.warn(`  warm      FAILED: ${(error as Error).message}`);
    console.warn(`            the first live decision will pay the load cost and may miss the 1.8 s abort`);
  }
}

app.listen(PORT, async () => {
  console.log(`kannaka decision shim on :${PORT}`);
  console.log(`  local     ${[...ROLES].join(', ')}  via ${MODEL} at ${ENDPOINT}`);
  console.log(`  other     → ${UPSTREAM}`);
  console.log(`  keepalive ${KEEP_ALIVE}`);
  console.log(`  point Jev at  JEV_DECISIONS_ENDPOINT=http://127.0.0.1:${PORT}/v1/systemone`);
  await warm();
});
