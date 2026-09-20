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
import { directJam } from './director.js';
import { defaultEngineerMix, type ChannelLevels } from '../shared/engineer.js';
import { engineerRequest, readEngineer } from './engineer.js';
import { continuingSolo, continuingPhrase } from './solo.js';
import { nextThemeFrame } from '../shared/setlist.js';

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
  private engineerMix = defaultEngineerMix();
  private measurement?: { levels: ChannelLevels; at: number };
  queueTheme(prompt: string) {
    if (this.state.status !== 'playing' || this.state.mode !== 'live')
      throw new Error('Start a live jam before queueing a theme.');
    if ((this.state.setlist?.filter((c) => c.appliedAt === undefined).length ?? 0) >= 4)
      throw new Error('Four themes are already queued.');
    const atFrame = nextThemeFrame(this.state, Date.now());
    const current = this.state.frames.filter((f) => f.at <= Date.now()).at(-1) ?? this.state.frame!;
    if (Date.now() + ((atFrame - current.id + 1) * 8 * 60000) / current.bpm >= this.state.endsAt)
      throw new Error('Not enough time remains in this jam for an eight-bar transition.');
    const cue: import('../shared/setlist.js').ThemeCue = {
      id: randomUUID(),
      prompt,
      requestedAt: Date.now(),
      atFrame,
    };
    if (this.options.directorModel)
      cue.director = { status: 'planning', model: this.options.directorModel };
    this.state.setlist = [...(this.state.setlist ?? []).slice(-8), cue];
    this.publish();
    if (this.options.directorModel)
      void directJam(
        prompt,
        this.options.directorModel,
        this.apiKey,
        this.options.recentOpeners,
        this.abort.signal,
      ).then((report) => {
        cue.director = report;
        if (this.state.themeId === cue.id) this.state.director = report;
        if (!this.abort.signal.aborted) this.publish();
      });
    return cue;
  }
  recordLevels(levels: ChannelLevels) {
    if (
      this.state.status === 'ended' ||
      (this.measurement && Date.now() - this.measurement.at < 750)
    )
      return;
    this.measurement = { levels, at: Date.now() };
  }
  constructor(
    prompt: string,
    mode: Snapshot['mode'],
    private apiKey: string,
    private model = 'typesafe/jev-1.13',
    private maxRequests = 6000,
    private durationSeconds = 600,
    private options: { directorModel?: string; recentOpeners?: Musician[] } = {},
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
      opener: musicians[seed % musicians.length],
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
        if (this.options.directorModel) {
          this.state.director = { status: 'planning', model: this.options.directorModel };
          this.publish();
          this.state.director = await directJam(
            this.state.prompt,
            this.options.directorModel,
            this.apiKey,
            this.options.recentOpeners,
            this.abort.signal,
          );
          this.publish();
        }
        if (this.abort.signal.aborted) return;
        this.state.requests++;
        const t = await callJev(
          bootstrapRequest(
            this.state.prompt,
            this.model,
            this.state.director?.concept,
            this.options.recentOpeners,
          ),
          'host',
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
      this.state.themeId = this.state.id;
      this.state.themeStartedAt = this.state.startedAt;
      this.state.setlist = [
        {
          id: this.state.id,
          prompt: this.state.prompt,
          requestedAt: Date.now(),
          atFrame: 0,
          appliedAt: this.state.startedAt,
          director: this.state.director,
        },
      ];
      this.hardStop = setTimeout(() => this.stop(), this.state.endsAt - Date.now());
      await this.prepare(0, this.state.startedAt);
    } catch (e) {
      this.stop(e instanceof Error ? e.message : 'Could not start jam');
    }
  }
  private async prepare(index: number, at: number): Promise<void> {
    if (this.abort.signal.aborted) return;
    const prior = this.state.frame;
    const transition = this.state.setlist?.find(
      (c) => c.appliedAt === undefined && c.atFrame <= index,
    );
    if (transition) {
      transition.appliedAt = at;
      this.state.themeId = transition.id;
      this.state.themeStartedAt = at;
      this.state.prompt = transition.prompt;
      this.state.title = transition.prompt.split('\n')[0].slice(0, 80);
      this.state.director =
        transition.director?.status === 'ready' ? transition.director : undefined;
      if (this.state.director?.concept) {
        this.root = this.state.director.concept.root;
        this.scale = this.state.director.concept.mode;
      }
    }
    const openingOrder = [this.state.opener, ...musicians.filter((r) => r !== this.state.opener)];
    // Independent commitments, a fair oldest-due queue, and at most ONE new musical idea.
    const eligible = musicians
      .filter((r) => (this.due.get(r) ?? 0) <= index)
      .sort((a, b) => (this.due.get(a) ?? 0) - (this.due.get(b) ?? 0));
    let selected =
      index < 4
        ? openingOrder[index]
        : eligible.find((r) => {
            const own = prior?.parts.find((p) => p.role === r);
            return this.state.mode !== 'live' || (!own?.solo && !continuingPhrase(own));
          });
    const soloAge = at - (this.state.lastSoloAt ?? this.state.startedAt);
    const inviteRole = this.state.lastSoloRole === 'guitar' ? 'keys' : 'guitar';
    const soloDue =
      this.state.mode === 'live' &&
      index >= 4 &&
      soloAge >= 175000 &&
      at + (32 * 60000) / (prior?.bpm ?? 96) < this.state.endsAt;
    if (soloDue && !transition) selected = inviteRole;
    this.state.soloInvitation = {
      role: inviteRole,
      urgency: Math.min(1, soloAge / 175000),
      required: soloDue && !transition,
    };
    const selectedRoles: Musician[] = transition
      ? [...musicians]
      : [
          ...new Set([
            ...(selected ? [selected] : []),
            ...(this.state.mode === 'live'
              ? (prior?.parts
                  .filter(
                    (p) => continuingPhrase(p) || (p.solo && ['guitar', 'keys'].includes(p.role)),
                  )
                  .map((p) => p.role) ?? [])
              : []),
          ]),
        ];
    const measured =
      this.measurement && Date.now() - this.measurement.at < 10000 ? this.measurement : undefined;
    const mixDue = !!measured && index % 2 === 0 && this.state.mode === 'live';
    const active = [...selectedRoles, 'lights' as const, ...(mixDue ? ['engineer' as const] : [])];
    if (
      this.state.mode === 'live' &&
      this.state.requests + selectedRoles.length * (maxAttacks + 3) + 1 + (mixDue ? 1 : 0) >
        this.maxRequests
    ) {
      this.stop('Jev request limit reached');
      return;
    }
    const frozen = this.view();
    frozen.themeTransition = !!transition;
    const phraseSignal = AbortSignal.any([
      this.abort.signal,
      AbortSignal.timeout(Math.max(1, Math.floor(at - Date.now() - 250))),
    ]);
    if (transition)
      for (const frame of frozen.frames)
        for (const part of frame.parts) {
          part.solo = false;
          if (part.performance) {
            part.performance.soloBars = undefined;
            part.performance.soloPhrases = 0;
            part.performance.phraseBars = undefined;
            part.performance.phraseChunks = 0;
          }
        }
    const decisions = new Map<
      Musician,
      { d: Decision; source: 'jev' | 'rehearsal' | 'fallback' }
    >();
    let lighting = prior?.lighting ?? defaultLighting;
    const composed = new Map<Musician, Part>();
    const completedAt = new Map<Musician, number>();
    const traces = (
      await Promise.all(
        active.map(async (role) => {
          if (role === 'engineer') {
            this.state.requests++;
            return [
              await callJev(
                engineerRequest(
                  frozen,
                  this.engineerMix,
                  measured!.levels,
                  measured!.at,
                  this.model,
                ),
                'engineer',
                index,
                this.apiKey,
                phraseSignal,
              ),
            ];
          }
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
                      phraseSignal,
                    );
                    calls.push(trace);
                    return trace;
                  },
                );
                composed.set(role, part);
                completedAt.set(role, Date.now());
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
            return [await callJev(request, role, index, this.apiKey, phraseSignal)];
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
      const completedInTime = (completedAt.get(trace.role as Musician) ?? Infinity) <= at - 100;
      if (missedDeadline && trace.source === 'jev' && !completedInTime) {
        trace.source = 'fallback';
        trace.error = 'Missed phrase deadline; response not applied';
      }
      this.trace(trace);
      if (trace.role === 'engineer') {
        if (trace.source === 'jev' && measured)
          this.engineerMix = readEngineer(trace, this.engineerMix, measured.levels, measured.at);
        continue;
      }
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
    for (const selected of selectedRoles) {
      const source =
        this.state.mode === 'rehearsal'
          ? 'rehearsal'
          : composed.has(selected) && (completedAt.get(selected) ?? Infinity) <= at - 100
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
      if (source === 'jev' && composed.get(selected)?.solo && !continuingSolo(previous)) {
        this.state.lastSoloAt = at;
        this.state.lastSoloRole = selected;
      }
    }
    this.failures =
      this.state.mode === 'live' &&
      selectedRoles.length > 0 &&
      ![...decisions.values()].some((d) => d.source === 'jev')
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
      (pressure > 0 &&
        !this.state.setlist?.some((c) => c.appliedAt === undefined) &&
        recentVotes.filter((d) => d.ending).length >= 2);
    for (const old of prior?.parts ?? []) {
      if (!decisions.has(old.role))
        decisions.set(old.role, { d: { ...old.decision, action: 'hold' }, source: old.source });
    }
    const parts = [...decisions].map(([role, { d, source }]) => {
      const previous = prior?.parts.find((p) => p.role === role);
      if (this.state.mode === 'live') {
        if (selectedRoles.includes(role) && source === 'jev')
          return {
            ...composed.get(role)!,
            updatedAtFrame: index,
            continued: false,
          };
        if (previous)
          return {
            ...previous,
            source: selectedRoles.includes(role) ? ('fallback' as const) : previous.source,
            solo: selectedRoles.includes(role) ? false : previous.solo,
            continued: true,
            repeated: previous.repeated + 1,
            // Preserve played notes exactly; a new shared tonic is context for future compositions.
            notes:
              selectedRoles.includes(role) && previous.solo ? [] : structuredClone(previous.notes),
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
      if (previous && !selectedRoles.includes(role) && !ending) {
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
      themeId: this.state.themeId,
      themeTitle: this.state.title,
      themeStartedAt: this.state.themeStartedAt,
      engineerMix: structuredClone(this.engineerMix),
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
            // First entrant hears the opener. Thereafter prepare about two seconds
            // ahead of the current chunk: every peer observation still passes the
            // real-time hearing cutoff, including frames already queued to play.
            (this.state.mode === 'live'
              ? index === 0
                ? durationMs - 250
                : durationMs + 2000
              : 2300) -
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
