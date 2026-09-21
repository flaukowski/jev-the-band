import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ChatMessage } from '../shared/chat.js';
import { clean } from './song-input.js';
const line = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((text) => clean(text).replace(/\s+/g, ' '))
    .pipe(z.string().trim().min(1).max(max));
export const chatInput = z.object({ name: line(32), text: line(280) });
/** The crowd's conversation: recent lines only, held in memory like the room itself. */
export class Chat {
  private messages: ChatMessage[] = [];
  private readonly last = new Map<string, number>();
  recent() {
    return this.messages;
  }
  /** One line a second per address; returns null when the sender should slow down. */
  post(sender: string, input: z.infer<typeof chatInput>, now = Date.now()): ChatMessage | null {
    if (now - (this.last.get(sender) ?? 0) < 1000) return null;
    if (this.last.size > 5000) this.last.clear();
    this.last.set(sender, now);
    const message = { id: randomUUID(), at: now, ...input };
    this.messages = [...this.messages, message].slice(-60);
    return message;
  }
}
