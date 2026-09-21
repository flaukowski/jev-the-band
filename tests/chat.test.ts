import test from 'node:test';
import assert from 'node:assert/strict';
import { Chat, chatInput } from '../server/chat.js';
import { funkyName } from '../shared/chat.js';

test('chat lines are flattened, stripped of invisible characters and bounded', () => {
  const line = chatInput.parse({
    name: ' Spun\u202E Wook2Vec ',
    text: 'pass\r\nthe\u0000 <b>tokens</b>',
  });
  assert.deepEqual(line, { name: 'Spun Wook2Vec', text: 'pass the <b>tokens</b>' });
  assert.equal(chatInput.safeParse({ name: 'a', text: '\u200B' }).success, false);
  assert.equal(chatInput.safeParse({ name: 'a', text: 'x'.repeat(281) }).success, false);
});
test('chat paces each sender and keeps only recent lines', () => {
  const chat = new Chat();
  const line = { name: 'a', text: 'hi' };
  assert.ok(chat.post('1.1.1.1', line, 1000));
  assert.equal(chat.post('1.1.1.1', line, 1500), null);
  assert.ok(chat.post('2.2.2.2', line, 1500));
  for (let i = 0; i < 80; i++) chat.post(`ip${i}`, line, 5000);
  assert.equal(chat.recent().length, 60);
});
test('funky names always fit the name limit', () => {
  for (let i = 0; i < 500; i++)
    assert.ok(chatInput.safeParse({ name: funkyName(), text: 'x' }).success);
});
