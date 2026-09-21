/**
 * host-gate.ts — close the room without closing the door.
 *
 * KAX-side context, because this reverses a deliberate upstream decision and
 * should say why. `DESIGN-DECISIONS.md`, 2026-09-20, "The room is open, and the
 * lot can talk": `CONTROLLER_TOKEN` was removed so anyone could start, queue and
 * stop a jam, with pacing rather than identity as the guard. That is the right
 * call for a demo somebody is watching.
 *
 * It stops being the right call the moment another property CARRIES the room.
 * A jam's title is free text, and a carrying channel puts that text on screen
 * and into its own public feed under its own name. On 2026-09-21 the public
 * instance's archive held a jam titled with a repeated racial slur — one of
 * nineteen, which is once every nineteen segments for anything that picks a jam
 * at random. Pacing does not help: six requests a minute is plenty to write a
 * title, and normalising the string does not change what it says.
 *
 * So the gate is back, and deliberately NOT the way it was:
 *
 *   - OPT-IN. With `JEV_HOST_TOKEN` unset the room behaves exactly as it does
 *     today, open to everyone. Upstream's default is untouched, which is what
 *     makes this safe to carry on a fork and offerable back rather than a
 *     unilateral reversal of somebody else's decision.
 *   - WRITES ONLY, and only the ones that put words on a stage: start, queue,
 *     stop. Reading, listening, the SSE stream, the archive and the mixer stay
 *     open to anyone, because a spectator was never the problem.
 *   - CONSTANT TIME comparison, so a token cannot be recovered a byte at a time
 *     from response timings.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Fixed-width digest, so comparing two of them cannot leak a length. */
const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/** The configured host token, or null when the room is deliberately open. */
export function hostToken(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env.JEV_HOST_TOKEN?.trim();
  return raw ? raw : null;
}

/**
 * Is this the host?
 *
 * Accepts `Authorization: Bearer <token>`. Returns true when no token is
 * configured, because an open room is a choice and not an accident — the caller
 * decides whether to apply the gate at all.
 */
export function authorized(header: unknown, token: string | null): boolean {
  if (!token) return true;
  const raw = typeof header === 'string' ? header : '';
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!match) return false;
  // Digest both first. `timingSafeEqual` throws on a length mismatch, and
  // branching on the length would itself leak how long the token is; two
  // SHA-256 digests are always 32 bytes, so the comparison is the same work
  // whatever was sent.
  return timingSafeEqual(digest(match[1]!.trim()), digest(token));
}

/**
 * Express guard for the routes that can put words on a stage.
 *
 * 401 rather than 403: the caller may well be entitled to do this and simply
 * has not said who they are. The message names the variable rather than hinting
 * at the value, and says plainly that the room can be reopened, because an
 * operator meeting this for the first time should not have to read the source
 * to find out whether it is a bug.
 */
export function hostOnly(env: Record<string, string | undefined> = process.env) {
  const token = hostToken(env);
  return (req: Request, res: Response, next: NextFunction) => {
    if (authorized(req.headers.authorization, token)) {
      next();
      return;
    }
    res.status(401).json({
      error:
        'This room is hosted. Starting, queueing and stopping a jam need the host credential; ' +
        'listening, the archive and the mixer do not. Send Authorization: Bearer <JEV_HOST_TOKEN>, ' +
        'or unset JEV_HOST_TOKEN to run an open room.',
    });
  };
}
