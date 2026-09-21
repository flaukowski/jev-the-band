import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { requestFor, parseAnswers } from '../server/jev.js';
import { decisionEndpoint, decisionEndpoints } from '../server/provider.js';
import {
  answerLocally,
  distribute,
  groupQuestions,
  letterOf,
  personaName,
  rolesFromEnv,
  shouldAnswerLocally,
  type Complete,
} from '../server/kannaka-shim.js';
import type { ChoiceQuestion, JevRequest } from '../shared/music.js';

/**
 * The shim answers Jev's own contract with a local model. These tests hold it
 * to the same gate the band does — `parseAnswers` — and pin the two failures
 * that were actually observed while measuring it: a tokenizer that merges
 * letters, and a batch that comes back short.
 */

const lights = (): JevRequest =>
  requestFor('lights', new Room('Slow tide over a cold harbour', 'live', '').view(), 2, 'test');

/** A model that always names the Nth option, with a plausible spread behind it. */
function fakeModel(pick: (n: number) => number, opts: { truncateBatchTo?: number } = {}): {
  complete: Complete;
  calls: { user: string; maxTokens: number }[];
} {
  const calls: { user: string; maxTokens: number }[] = [];
  let n = 0;
  const complete: Complete = async (_system, user, maxTokens) => {
    calls.push({ user, maxTokens });
    // How many answers is this prompt asking for?
    const asked = maxTokens === 1 ? 1 : Math.max(1, Math.round(maxTokens / 3));
    const emit = opts.truncateBatchTo !== undefined && asked > 1
      ? Math.min(asked, opts.truncateBatchTo)
      : asked;
    const tokens = [];
    for (let i = 0; i < emit; i++) {
      const index = pick(n++);
      const letter = String.fromCharCode(65 + index);
      tokens.push({
        // A separator merged into the letter, exactly as Qwen emits it.
        token: i === 0 ? letter : `,${letter}`,
        top_logprobs: [
          { token: i === 0 ? letter : `,${letter}`, logprob: Math.log(0.6) },
          { token: `,${String.fromCharCode(65 + ((index + 1) % 8))}`, logprob: Math.log(0.25) },
          { token: `,${String.fromCharCode(65 + ((index + 2) % 8))}`, logprob: Math.log(0.15) },
          { token: ' the', logprob: Math.log(0.001) },
        ],
      });
    }
    return { text: tokens.map((t) => t.token).join(''), tokens };
  };
  return { complete, calls };
}

test('a full LUX request answered locally passes the band\'s own parseAnswers', async () => {
  const request = lights();
  const { complete } = fakeModel(() => 0);
  const { answers, repaired } = await answerLocally(request, { complete, concurrency: 8 });

  assert.equal(repaired.length, 0, 'nothing should have needed repair');
  assert.deepEqual(
    Object.keys(answers).sort(),
    Object.keys(request.questions).sort(),
    'every question is answered',
  );
  // The real gate, not the harness's opinion of itself.
  assert.doesNotThrow(() => parseAnswers({ answers }, request));
});

test('a short batch is repaired rather than shipped — the failure seen in measurement', async () => {
  // Force a group: eight questions offering the same options.
  const options = { a: 'first', b: 'second', c: 'third' };
  const q = (instructions: string): ChoiceQuestion => ({ type: 'choice', instructions, criteria: { ...options } });
  const request: JevRequest = {
    model: 'test',
    state: { persona: { name: 'LUX' } },
    questions: Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`pick${i}`, q(`choose ${i}`)]),
    ),
  };
  // The model emits seven letters where eight were asked — two of four roles did this.
  const { complete, calls } = fakeModel(() => 1, { truncateBatchTo: 7 });
  const { answers, repaired } = await answerLocally(request, { complete, concurrency: 8 });

  assert.equal(repaired.length, 1, 'exactly the dropped question is repaired');
  assert.equal(Object.keys(answers).length, 8);
  assert.doesNotThrow(() => parseAnswers({ answers }, request));
  // One batched call, then one single call to repair. The repair costs a round trip.
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.maxTokens, 1);
});

test('the tokenizer trap: a separator merged into a letter is one answer; merged letters are none', () => {
  assert.equal(letterOf(','), null);
  assert.equal(letterOf(',F'), 'F');
  assert.equal(letterOf(' a'), 'A');
  assert.equal(letterOf('A'), 'A');
  // The failure that silently produced an empty melody: letters run together.
  assert.equal(letterOf('ED'), null);
  assert.equal(letterOf('EDFGABCE'), null);
});

test('a distribution covers every option, sums to one, and never hands out a zero', () => {
  const options = ['off', 'on', 'auto'];
  const d = distribute(
    [
      { token: 'B', logprob: Math.log(0.7) },
      { token: ',A', logprob: Math.log(0.2) },
      // 'auto' never appears in the top-k at all.
    ],
    options,
  );
  assert.equal(d.choice, 'on');
  for (const option of options) {
    assert.ok(Number.isFinite(d.probabilities[option]!), `${option} is finite`);
    assert.ok(d.probabilities[option]! > 0, `${option} is above zero`);
    assert.ok(d.probabilities[option]! <= 1, `${option} is at most one`);
  }
  const total = options.reduce((sum, o) => sum + d.probabilities[o]!, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, 'sums to one well inside the 0.03 the band allows');
  // An option the model never considered is small, not impossible.
  assert.ok(d.probabilities.auto! < 1e-6);
});

test('a letter outside the offered options is ignored, never coerced into a choice', () => {
  const d = distribute(
    [
      { token: 'Z', logprob: Math.log(0.9) }, // no 26th option exists
      { token: ',A', logprob: Math.log(0.1) },
    ],
    ['off', 'on'],
  );
  assert.equal(d.choice, 'off');
  assert.ok(d.probabilities.on! > 0);
});

test('grouping batches only what shares an option set, and leaves the rest alone', () => {
  const request = lights();
  const { batches, singles } = groupQuestions(request.questions as Record<string, ChoiceQuestion>);
  const grouped = batches.flat();
  assert.equal(
    grouped.length + singles.length,
    Object.keys(request.questions).length,
    'every question is placed exactly once',
  );
  for (const batch of batches) {
    assert.ok(batch.length >= 3, 'a batch is only worth its cost at three or more');
    const signatures = new Set(
      batch.map((k) =>
        JSON.stringify(Object.keys((request.questions[k] as ChoiceQuestion).criteria)),
      ),
    );
    assert.equal(signatures.size, 1, 'a batch shares one option set');
  }
});

test('routing: LUX is answered here, the musicians are forwarded', () => {
  const roles = rolesFromEnv({ KANNAKA_ROLES: undefined });
  assert.deepEqual([...roles], ['LUX'], 'the default route is the lighting desk alone');

  const room = new Room('Slow tide', 'live', '').view();
  assert.equal(personaName(requestFor('lights', room, 2, 'test')), 'LUX');
  assert.ok(shouldAnswerLocally(requestFor('lights', room, 2, 'test'), roles));
  for (const role of ['guitar', 'bass', 'keys', 'drums'] as const)
    assert.equal(
      shouldAnswerLocally(requestFor(role, room, 2, 'test'), roles),
      false,
      `${role} is not answered locally until it can make the deadline`,
    );

  // An unrecognised persona forwards rather than being answered by a model
  // that was never measured against its deadline.
  assert.equal(shouldAnswerLocally({ model: 'm', state: {}, questions: {} }, roles), false);
  assert.ok(shouldAnswerLocally(requestFor('guitar', room, 2, 'test'), rolesFromEnv({ KANNAKA_ROLES: 'lux, rook' })));
});

test('the endpoint override is opt-in, and the provider table is untouched without it', () => {
  assert.equal(decisionEndpoint('typesafe', {}), decisionEndpoints.typesafe);
  assert.equal(decisionEndpoint('openrouter', {}), decisionEndpoints.openrouter);
  assert.equal(
    decisionEndpoint('typesafe', { JEV_DECISIONS_ENDPOINT: 'http://127.0.0.1:8088/v1/systemone' }),
    'http://127.0.0.1:8088/v1/systemone',
  );
  // Blank means unset, not an empty address.
  assert.equal(decisionEndpoint('typesafe', { JEV_DECISIONS_ENDPOINT: '   ' }), decisionEndpoints.typesafe);
});
