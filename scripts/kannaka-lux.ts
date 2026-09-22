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
import { createHash, timingSafeEqual } from 'node:crypto';
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

/**
 * Who may ask this shim for a decision.
 *
 * On a laptop behind a firewall this is unnecessary. The moment the shim is
 * reachable from the internet — which it must be for a hosted band to use it —
 * it becomes two things worth guarding: a way to spend somebody's local GPU
 * time for free, and an open relay to whatever upstream provider it forwards
 * to. Neither leaks a credential, because this process holds none, and both are
 * still somebody else's problem to be handed.
 *
 * The band already authenticates to its decisions endpoint: `callJev` sends the
 * provider key as `Authorization: Bearer`. So the check costs nothing new to
 * either side — set this to the same value the band sends, and the shim answers
 * only the band. Unset, it answers anyone, which is right for localhost.
 */
const EXPECT_BEARER = process.env.KANNAKA_EXPECT_BEARER?.trim() || null;

/**
 * How long to work before admitting we will not make it.
 *
 * `callJev` aborts at 1800 ms and records the miss as a fallback, so an answer
 * that arrives at 1801 ms is worth exactly nothing. Default 1500 ms leaves the
 * network the difference. Blowing it FAST is the whole point: a refusal lets
 * Jev fall back immediately and keeps the queue empty, where a slow success
 * pushes the next request behind it and the latency climbs forever.
 */
const DEADLINE_MS = Number(process.env.KANNAKA_DEADLINE_MS || 1500);

/** Fixed-width digests, so comparing them cannot leak a length. */
const digest = (v: string) => createHash('sha256').update(v, 'utf8').digest();

function callerAllowed(header: unknown): boolean {
  if (!EXPECT_BEARER) return true;
  const raw = typeof header === 'string' ? header : '';
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!match) return false;
  return timingSafeEqual(digest(match[1]!.trim()), digest(EXPECT_BEARER));
}

/** One question, one token, top-k over the option letters. */
const complete: Complete = async (system, user, maxTokens, signal) => {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
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
    tokens: (choice?.logprobs?.content ?? []).map(
      (t: { token: string; top_logprobs?: unknown }) => ({
        token: String(t.token ?? ''),
        top_logprobs: (t.top_logprobs ?? []) as { token: string; logprob: number }[],
      }),
    ),
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

  if (!callerAllowed(req.headers.authorization)) {
    console.warn(`${who.padEnd(6)} → REFUSED  caller is not the band`);
    res.status(401).json({ error: 'this decision shim answers one caller' });
    return;
  }

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
      console.log(
        `${who.padEnd(6)} → upstream  ${upstream.status}  ${Math.round(performance.now() - started)} ms`,
      );
      res.status(upstream.status).json(payload);
    } catch (error) {
      console.error(`${who.padEnd(6)} → upstream FAILED: ${(error as Error).message}`);
      res.status(502).json({ error: 'upstream unreachable' });
    }
    return;
  }

  // Ours. Answer it, then hold the answer to Jev's own standard before sending.
  // Two ways the caller stops caring: the deadline passes, or it hangs up.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error('deadline')), DEADLINE_MS);
  req.on('close', () => abort.abort(new Error('caller hung up')));
  try {
    const { answers, repaired } = await answerLocally(request, {
      complete,
      signal: abort.signal,
    });
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
    if (abort.signal.aborted) {
      // Not a fault worth an error channel: the band moved on, and saying so
      // quickly is the correct behaviour. Jev holds the previous look.
      const ms = Math.round(performance.now() - started);
      console.warn(
        `${who.padEnd(6)} → local     GAVE UP after ${ms} ms (budget ${DEADLINE_MS} ms)`,
      );
      if (!res.headersSent) res.status(503).json({ error: 'local decision missed its deadline' });
      return;
    }
    // A refusal is better than a wrong answer: Jev treats a failed decision as a
    // fallback, holds the previous look, and discloses it. Answering badly would
    // be invisible instead.
    console.error(`${who.padEnd(6)} → local     REFUSED: ${(error as Error).message}`);
    if (!res.headersSent)
      res.status(502).json({ error: `local decision failed: ${(error as Error).message}` });
  } finally {
    clearTimeout(timer);
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
    console.warn(
      `            the first live decision will pay the load cost and may miss the 1.8 s abort`,
    );
  }
}

app.listen(PORT, async () => {
  console.log(`kannaka decision shim on :${PORT}`);
  console.log(`  local     ${[...ROLES].join(', ')}  via ${MODEL} at ${ENDPOINT}`);
  console.log(`  other     → ${UPSTREAM}`);
  console.log(`  keepalive ${KEEP_ALIVE}`);
  console.log(
    `  callers   ${EXPECT_BEARER ? 'one, by bearer' : 'ANY — set KANNAKA_EXPECT_BEARER before exposing this'}`,
  );
  console.log(`  deadline  ${DEADLINE_MS} ms, then it gives up so the band can`);
  console.log(`  point Jev at  JEV_DECISIONS_ENDPOINT=http://127.0.0.1:${PORT}/v1/systemone`);
  await warm();
});
