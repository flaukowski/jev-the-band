import test from 'node:test';
import assert from 'node:assert/strict';
import { jevConfig, decisionEndpoints } from '../server/provider.js';
import { callJev } from '../server/jev.js';
import type { JevProvider, JevRequest } from '../shared/music.js';
import { Room } from '../server/room.js';

test('provider selection separates keys, pins model IDs and never enables a director with a TypeSafe key', () => {
  const direct = jevConfig({ TYPESAFE_API_KEY: 'direct-fixture', JEV_MODEL: 'typesafe/jev-1.13' });
  assert.equal(direct.provider, 'typesafe');
  assert.equal(direct.model, 'jev-1.13.0');
  assert.equal(direct.directorModel, undefined);
  assert.equal(direct.directorKey, '');
  const both = { TYPESAFE_API_KEY: 'direct-fixture', OPENROUTER_API_KEY: 'router-fixture' };
  assert.equal(jevConfig(both).provider, 'typesafe');
  const router = jevConfig({ ...both, JEV_PROVIDER: 'openrouter' });
  assert.equal(router.apiKey, 'router-fixture');
  assert.equal(router.model, 'typesafe/jev-1.13');
  assert.equal(router.directorModel, 'openai/gpt-5.6-luna');
  assert.equal(
    jevConfig({ OPENROUTER_API_KEY: 'router-fixture', JEV_PROVIDER: 'typesafe' }).apiKey,
    '',
  );
  assert.throws(() => jevConfig({ JEV_PROVIDER: 'unknown' }), /JEV_PROVIDER/);
  assert.throws(
    () => jevConfig({ JEV_PROVIDER: 'typesafe', TYPESAFE_MODEL: 'other/model' }),
    /model ID/,
  );
});

for (const provider of ['typesafe', 'openrouter'] as JevProvider[])
  test(`${provider} preserves the typed wire contract and provenance without leaking credentials`, async (t) => {
    const key = `private-${provider}-fixture`;
    const request: JevRequest = {
      model: provider === 'typesafe' ? 'jev-1.13.0' : 'typesafe/jev-1.13',
      state: { ownNotes: [60, 64], heardPeers: [] },
      questions: {
        play: {
          type: 'choice',
          instructions: 'Play or rest?',
          criteria: { play: 'Play', rest: 'Rest' },
        },
      },
    };
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
      calls++;
      assert.equal(url, decisionEndpoints[provider]);
      const headers = new Headers(init.headers);
      assert.equal(headers.get('Authorization'), `Bearer ${key}`);
      assert.equal(headers.has('X-Title'), provider === 'openrouter');
      assert.deepEqual(JSON.parse(init.body as string), request);
      return new Response(
        JSON.stringify({
          model: 'jev-1.13.0',
          answers: {
            play: {
              type: 'choice',
              choice: 'play',
              confidence: 0.8,
              probabilities: { play: 0.9, rest: 0.1 },
            },
          },
          usage: {
            input_tokens: 120,
            output_tokens: 15,
            ...(provider === 'openrouter' ? { cost: 0.001 } : {}),
          },
        }),
      );
    });
    const trace = await callJev(request, 'guitar', 0, key, undefined, provider);
    assert.equal(calls, 1);
    assert.equal(trace.source, 'jev');
    assert.equal(trace.provider, provider);
    assert.equal(trace.responseModel, 'jev-1.13.0');
    assert.deepEqual(trace.usage, { inputTokens: 120, outputTokens: 15 });
    assert.equal(
      trace.cost,
      provider === 'openrouter' ? 0.001 : null,
      'missing cost is unknown, not zero',
    );
    assert.ok(!JSON.stringify(trace).includes(key));
    assert.equal(trace.answers.play.probabilities.play, 0.9);
  });

test('direct TypeSafe failures never retry or silently switch to OpenRouter', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: unknown) => {
    assert.equal(url, decisionEndpoints.typesafe);
    calls++;
    return new Response('private upstream details', { status: 429 });
  });
  const trace = await callJev(
    { model: 'jev-1.13.0', state: {}, questions: {} },
    'keys',
    0,
    'secret-fixture',
    undefined,
    'typesafe',
  );
  assert.equal(calls, 1);
  assert.equal(trace.source, 'fallback');
  assert.equal(trace.error, 'Decision service HTTP 429');
  assert.doesNotMatch(JSON.stringify(trace), /secret-fixture|private upstream/);
});

test('a direct-provider room routes opening, notes, rigs and lights to TypeSafe', async (t) => {
  const requests: JevRequest[] = [];
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    assert.equal(url, decisionEndpoints.typesafe);
    const request = JSON.parse(init.body as string) as JevRequest;
    requests.push(request);
    const preferred: Record<string, string> = {
      opener: 'keys',
      bpm: '96',
      action: 'vary',
      sound: 'play',
      rightCount: '1',
      leftCount: '0',
    };
    return new Response(
      JSON.stringify({
        answers: Object.fromEntries(
          Object.entries(request.questions).map(([key, question]) => {
            const choices = Object.keys(question.criteria);
            const chosen = choices.includes(preferred[key]) ? preferred[key] : choices[0];
            return [
              key,
              {
                choice: chosen,
                probabilities: Object.fromEntries(choices.map((v) => [v, v === chosen ? 1 : 0])),
              },
            ];
          }),
        ),
      }),
    );
  });
  const room = new Room('A new groove', 'live', 'direct-fixture', 'jev-1.13.0', 40, 20, {
    provider: 'typesafe',
  });
  try {
    await room.start();
    assert.equal(room.state.provider, 'typesafe');
    assert.equal(room.state.frame?.parts[0].source, 'jev');
    assert.ok(room.state.frame!.parts[0].notes.length);
    assert.ok(requests.some((r) => 'wash' in r.questions));
    assert.ok(requests.some((r) => 'driveBar2' in r.questions));
    assert.ok(requests.some((r) => 'right0' in r.questions));
    assert.ok(room.state.traces.every((trace) => trace.provider === 'typesafe'));
    assert.ok(!JSON.stringify(room.view()).includes('direct-fixture'));
  } finally {
    room.stop();
  }
});
