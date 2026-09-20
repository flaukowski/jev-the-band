import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import {
  defaultLighting,
  hash,
  lightRecipes,
  musicians,
  type Decision,
  type Frame,
  type Musician,
  type Part,
  type Snapshot,
  type Trace,
} from '../shared/music.js';
import { compile, endingPressure, nextRoot, nextTempo, rehearsal } from '../shared/score.js';
import { bootstrapRequest, callJev, requestFor, toLighting } from './jev.js';
import { composePhrase, maxAttacks } from './composer.js';

export class Room extends EventEmitter {
  state: Snapshot;
  private timer?: ReturnType<typeof setTimeout>;
  private hardStop?: ReturnType<typeof setTimeout>;
  private abort = new AbortController();
  private lastKeyChange = 0;
  private root = 2;
  private scale: Frame['mode'] = 'dorian';
  private failures = 0;
  private due = new Map<Musician, number>();
  private votes = new Map<Musician, { d: Decision; frame: number }>();
  constructor(
    prompt: string,
    mode: Snapshot['mode'],
    private apiKey: string,
    private model = 'typesafe/jev-1.13',
    private maxRequests = 2000,
    private durationSeconds = 600,
  ) {
    super();
    const seed = hash(prompt + Date.now());
    this.state = {
      id: randomUUID(),
      title: prompt.split('\n')[0].slice(0, 80),
      prompt,
      mode,
      status: 'starting',
      startedAt: Date.now() + 5000,
      endsAt: 0,
      seed,
      baseBpm: 96,
      initialRoot: 2,
      initialMode: 'dorian',
      opener: 'bass',
      frame: null,
      frames: [],
      traces: [],
      requests: 0,
      cost: 0,
      billedCalls: 0,
    };
  }
  view(): Snapshot {
    return structuredClone(this.state);
  }
  private publish() {
    this.emit('state', this.view());
  }
  private trace(t: Trace) {
    this.state.traces.push(t);
    this.state.traces = this.state.traces.slice(-180);
    if (t.cost !== null) {
      this.state.cost += t.cost;
      this.state.billedCalls++;
    }
    this.emit('trace', t);
  }
  async start() {
    try {
      if (this.state.mode === 'live') {
        this.state.requests++;
        const t = await callJev(
          bootstrapRequest(this.state.prompt, this.model),
          'bass',
          -1,
          this.apiKey,
          this.abort.signal,
        );
        this.trace(t);
        if (t.source !== 'jev') throw new Error(t.error ?? 'Could not start Jev');
        this.state.opener = t.answers.opener.choice as Musician;
        this.state.baseBpm = Number(t.answers.bpm.choice);
        this.root = Number(t.answers.root.choice);
        this.scale = t.answers.mode.choice as Frame['mode'];
        this.state.initialRoot = this.root;
        this.state.initialMode = this.scale;
      }
      if (this.abort.signal.aborted) return;
      this.state.startedAt = Date.now() + (this.state.mode === 'live' ? 7000 : 2500);
      this.state.endsAt = this.state.startedAt + this.durationSeconds * 1000;
      this.hardStop = setTimeout(() => this.stop(), this.state.endsAt - Date.now());
      await this.prepare(0, this.state.startedAt);
    } catch (e) {
      this.stop(e instanceof Error ? e.message : 'Could not start jam');
    }
  }
  private async prepare(index: number, at: number): Promise<void> {
    if (this.abort.signal.aborted) return;
    const prior = this.state.frame;
    const openingOrder = [this.state.opener, ...musicians.filter((r) => r !== this.state.opener)];
    // Independent commitments, a fair oldest-due queue, and at most ONE new musical idea.
    const eligible = musicians
      .filter((r) => (this.due.get(r) ?? 0) <= index)
      .sort((a, b) => (this.due.get(a) ?? 0) - (this.due.get(b) ?? 0));
    const selected = index < 4 ? openingOrder[index] : eligible[0];
    const active = [...(selected ? [selected] : []), 'lights' as const];
    if (
      this.state.mode === 'live' &&
      this.state.requests + (selected ? maxAttacks + 3 : 1) > this.maxRequests
    ) {
      this.stop('Jev request limit reached');
      return;
    }
    const frozen = this.view();
    const decisions = new Map<
      Musician,
      { d: Decision; source: 'jev' | 'rehearsal' | 'fallback' }
    >();
    let lighting = prior?.lighting ?? defaultLighting;
    const composed = new Map<Musician, Part>();
    const traces = (
      await Promise.all(
        active.map(async (role) => {
          const request = requestFor(role, frozen, index, this.model);
          if (this.state.mode === 'live') {
            if (role !== 'lights') {
              const calls: Trace[] = [];
              try {
                const part = await composePhrase(
                  role,
                  frozen,
                  index,
                  this.model,
                  async (eventRequest) => {
                    this.state.requests++;
                    const trace = await callJev(
                      eventRequest,
                      role,
                      index,
                      this.apiKey,
                      this.abort.signal,
                    );
                    calls.push(trace);
                    return trace;
                  },
                );
                composed.set(role, part);
              } catch {
                // A phrase is atomic: never perform half of a failed or incomplete composition.
                for (const trace of calls)
                  if (trace.source === 'jev') {
                    trace.source = 'fallback';
                    trace.error = 'Incomplete phrase; response not applied';
                  }
              }
              return calls;
            }
            this.state.requests++;
            return [await callJev(request, role, index, this.apiKey, this.abort.signal)];
          }
          return [
            {
              id: randomUUID(),
              role,
              frame: index,
              at: Date.now(),
              source: 'rehearsal',
              latencyMs: 0,
              request,
              answers: {},
              requestHash: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
              cost: null,
            } satisfies Trace,
          ];
        }),
      )
    ).flat();
    if (this.abort.signal.aborted) {
      for (const trace of traces) this.trace(trace);
      this.publish();
      return;
    }
    const missedDeadline = Date.now() > at - 100;
    for (const trace of traces) {
      if (missedDeadline && trace.source === 'jev') {
        trace.source = 'fallback';
        trace.error = 'Missed phrase deadline; response not applied';
      }
      this.trace(trace);
      if (trace.role === 'lights') {
        if (trace.source === 'jev') lighting = toLighting(trace.answers);
        else if (trace.source === 'rehearsal')
          lighting = {
            wash: lightRecipes.wash[Math.floor(index / 3) % 11],
            beam: lightRecipes.beam[index % 11],
            laser: lightRecipes.laser[Math.floor(index / 4) % 8],
            intensity: 0.4 + (index % 5) * 0.1,
            motion: 0.3,
          };
        continue;
      }
    }
    if (selected) {
      const source =
        this.state.mode === 'rehearsal'
          ? 'rehearsal'
          : composed.has(selected) && !missedDeadline
            ? 'jev'
            : 'fallback';
      const previous = prior?.parts.find((p) => p.role === selected);
      const d =
        source === 'jev'
          ? composed.get(selected)!.decision
          : source === 'rehearsal'
            ? rehearsal(selected, index, this.state.seed, prior)
            : {
                ...(previous?.decision ?? rehearsal(selected, 0, this.state.seed, prior)),
                action: previous ? ('hold' as const) : ('rest' as const),
                tempo: 'stay' as const,
                harmony: 'stay' as const,
                ending: false,
              };
      decisions.set(selected, { d, source });
      this.due.set(
        selected,
        this.state.mode === 'live'
          ? index + 1
          : index +
              { brief: 3, settle: 4, patient: 6 }[d.commitment] +
              ((this.state.seed + index + musicians.indexOf(selected)) % 2),
      );
      if (source !== 'fallback') this.votes.set(selected, { d, frame: index });
    }
    this.failures =
      this.state.mode === 'live' && selected && (!composed.has(selected) || missedDeadline)
        ? this.failures + 1
        : 0;
    if (this.failures >= 3) {
      this.stop('Decision service unavailable for three phrases');
      return;
    }
    const ds = [...decisions.values()].map((v) => v.d);
    const recentVotes = [...this.votes.values()]
      .filter((v) => index - v.frame <= 6)
      .map((v) => v.d);
    const bpm = nextTempo(prior?.bpm ?? this.state.baseBpm, this.state.baseBpm, ds);
    const root = nextRoot(this.root, recentVotes, index, this.lastKeyChange);
    if (root !== this.root) {
      this.lastKeyChange = index;
      this.votes.clear();
    }
    this.root = root;
    const durationMs = (8 * 60000) / bpm;
    const pressure = endingPressure((at - this.state.startedAt) / 1000);
    const ending =
      at + durationMs * 2 >= this.state.endsAt ||
      (pressure > 0 && recentVotes.filter((d) => d.ending).length >= 2);
    for (const old of prior?.parts ?? []) {
      if (!decisions.has(old.role))
        decisions.set(old.role, { d: { ...old.decision, action: 'hold' }, source: old.source });
    }
    const parts = [...decisions].map(([role, { d, source }]) => {
      const previous = prior?.parts.find((p) => p.role === role);
      if (this.state.mode === 'live') {
        if (role === selected && source === 'jev')
          return {
            ...composed.get(role)!,
            updatedAtFrame: index,
            continued: false,
          };
        if (previous)
          return {
            ...previous,
            source: role === selected ? ('fallback' as const) : previous.source,
            continued: true,
            repeated: previous.repeated + 1,
            // Preserve played notes exactly; a new shared tonic is context for future compositions.
            notes: structuredClone(previous.notes),
          };
        return {
          role,
          decision: d,
          notes: [],
          solo: false,
          repeated: 0,
          source: 'fallback' as const,
          continued: false,
        };
      }
      if (previous && role !== selected && !ending) {
        const shift = root - (prior?.root ?? root);
        return {
          ...previous,
          continued: true,
          repeated: previous.repeated + 1,
          notes: previous.notes.map((n) => ({
            ...n,
            midi: role === 'drums' ? n.midi : n.midi + shift,
          })),
        };
      }
      const part = compile(
        role,
        ending ? { ...d, action: 'resolve', dynamic: 'soft', rhythm: 'sustain' } : d,
        root,
        this.scale,
        this.state.seed + index,
        prior?.parts.find((p) => p.role === role),
      );
      part.source = source;
      part.updatedAtFrame = index;
      part.continued = false;
      return part;
    });
    const frame: Frame = {
      id: index,
      at,
      durationMs,
      bpm,
      root,
      mode: this.scale,
      parts,
      lighting,
      ending,
      decisionRole: selected,
      chapter: ending
        ? 'The landing'
        : index < 4
          ? 'Finding each other'
          : parts.filter((p) => p.solo).length > 1
            ? 'Trading sparks'
            : parts.some((p) => p.decision.action === 'space')
              ? 'Into the open'
              : parts.some((p) => p.solo)
                ? 'Following a thread'
                : 'In the pocket',
    };
    this.state.frame = frame;
    this.state.frames.push(frame);
    this.state.frames = this.state.frames.slice(-8);
    this.state.status = 'playing';
    this.publish();
    if (ending)
      this.timer = setTimeout(() => this.stop(), Math.max(0, at + durationMs - Date.now()));
    else
      this.timer = setTimeout(
        () => {
          void this.prepare(index + 1, at + durationMs).catch(() =>
            this.stop('Unable to prepare the next phrase'),
          );
        },
        Math.max(
          0,
          at +
            durationMs -
            (this.state.mode === 'live' ? Math.min(6000, durationMs - 700) : 2300) -
            Date.now(),
        ),
      );
  }
  stop(error?: string) {
    if (this.state.status === 'ended') return;
    this.abort.abort();
    clearTimeout(this.timer);
    clearTimeout(this.hardStop);
    this.state.status = 'ended';
    this.state.endedAt = Date.now();
    this.state.error = error;
    this.publish();
  }
}
