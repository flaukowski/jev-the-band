import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { authorized, hostOnly, hostToken } from '../server/host-gate.js';

/**
 * The room gate.
 *
 * Upstream removed `CONTROLLER_TOKEN` on purpose so anyone could start a jam,
 * and for a demo somebody is watching that is right. It stops being right when
 * another property carries the room: a jam title is free text, a carrying
 * channel puts that text on screen under its own name, and on 2026-09-21 the
 * public archive held a jam titled with a repeated racial slur.
 *
 * So these tests pin two things in equal measure — that the gate actually shuts,
 * and that it is invisible when nobody asked for it.
 */

const TOKEN = 'a-long-host-credential-9f2c';

test('with no token configured the room is open, exactly as upstream leaves it', () => {
  assert.equal(hostToken({}), null);
  assert.equal(hostToken({ JEV_HOST_TOKEN: '   ' }), null, 'blank is unset, not an empty password');
  assert.equal(authorized(undefined, null), true);
  assert.equal(authorized('Bearer anything', null), true);
});

test('with a token configured only the exact credential gets in', () => {
  assert.equal(authorized(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(authorized(`bearer ${TOKEN}`, TOKEN), true, 'the scheme is case-insensitive');
  assert.equal(authorized(`Bearer   ${TOKEN}  `, TOKEN), true, 'surrounding space is not a secret');

  for (const bad of [
    undefined,
    null,
    '',
    'Bearer',
    'Bearer ',
    TOKEN, // the raw token with no scheme
    `Basic ${TOKEN}`,
    `Bearer ${TOKEN}x`, // longer
    `Bearer ${TOKEN.slice(0, -1)}`, // shorter — must not throw on the length mismatch
    'Bearer ' + 'a'.repeat(4096),
    123,
    {},
  ])
    assert.equal(authorized(bad as unknown, TOKEN), false, String(bad).slice(0, 40));
});

test('a wrong token of the right length is still refused', () => {
  const sameLength = 'b'.repeat(TOKEN.length);
  assert.equal(sameLength.length, TOKEN.length);
  assert.equal(authorized(`Bearer ${sameLength}`, TOKEN), false);
});

/** A tiny app with the gate in front of one write and nothing in front of one read. */
function app(env: Record<string, string | undefined>) {
  const a = express();
  a.use(express.json());
  a.get('/read', (_req, res) => res.json({ ok: true }));
  a.post('/write', hostOnly(env), (_req, res) => res.status(201).json({ ok: true }));
  return a;
}

async function call(
  a: express.Express,
  path: string,
  method: string,
  headers: Record<string, string> = {},
) {
  const server = a.listen(0);
  try {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } finally {
    server.close();
  }
}

test('the gate shuts the write and leaves the read alone', async () => {
  const a = app({ JEV_HOST_TOKEN: TOKEN });

  const read = await call(a, '/read', 'GET');
  assert.equal(read.status, 200, 'listening was never the problem');

  const anonymous = await call(a, '/write', 'POST');
  assert.equal(anonymous.status, 401);
  assert.match(String(anonymous.body.error), /hosted/i);
  assert.ok(
    !String(anonymous.body.error).includes(TOKEN),
    'the refusal must never quote the credential back',
  );
  assert.match(
    String(anonymous.body.error),
    /JEV_HOST_TOKEN/,
    'an operator meeting this cold should be told which variable to look at',
  );

  const host = await call(a, '/write', 'POST', { authorization: `Bearer ${TOKEN}` });
  assert.equal(host.status, 201);
});

test('without the variable the same write is open to anyone', async () => {
  const anonymous = await call(app({}), '/write', 'POST');
  assert.equal(anonymous.status, 201, 'the gate is opt-in; an unset variable changes nothing');
});
