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
  type JevProvider,
} from '../shared/music.js';
import { compile, endingPressure, nextRoot, nextTempo, rehearsal } from '../shared/score.js';
import { baseMode } from '../shared/performance.js';
import { bootstrapRequest, callJev, requestFor, toLighting } from './jev.js';
import { composePhrase, maxAttacks } from './composer.js';
import { directJam } from './director.js';
import { defaultEngineerMix, type ChannelLevels } from '../shared/engineer.js';
import { engineerRequest, readEngineer } from './engineer.js';
import { continuingSolo, continuingPhrase } from './solo.js';
import { nextThemeFrame, minimumSongFrames, windDownFrames } from '../shared/setlist.js';
import { sketchSolo } from './sketch.js';

/** Eight two-bar frames: the shortest time one sky may stay up before Lux can change it. */
const SKY_DWELL_FRAMES = 8;

export class Room extends EventEmitter {
  state: Snapshot;
  private timer?: ReturnType<typeof setTimeout>;
  private hardStop?: ReturnType<typeof setTimeout>;
  private abort = new AbortController();
  private lastKeyChange = 0;
  private root = 2;
  private scale: Frame['mode'] = 'dorian';
  private modeName: string = 'dorian';
  private failures = 0;
  private due = new Map<Musician, number>();
  private votes = new Map<Musician, { d: Decision; frame: number }>();
  private engineerMix = defaultEngineerMix();
  private skyChangedAt = -SKY_DWELL_FRAMES;
  private measurement?: { levels: ChannelLevels; at: number };
  private sketchesRequested = 0;
  private themeFrame0 = 0;
  /**
   * Begin a queued song exactly like a first song: a fresh opening decision, one opener,
   * staggered entrances, and no musical memory of the song before it. The ten-minute lifetime,
   * request budget, mix and lighting continue.
   */
  private async beginTheme(
    cue: import('../shared/setlist.js').ThemeCue,
    index: number,
    at: number,
  ) {
    cue.appliedAt = at;
    cue.atFrame = index;
    this.windDown = undefined;
    this.state.windDown = undefined;
    this.themeFrame0 = index;
    this.state.themeFrame0 = index;
    this.state.themeId = cue.id;
    this.state.themeStartedAt = at;
    this.state.prompt = cue.prompt;
    this.state.title = cue.prompt.split('\n')[0].slice(0, 80);
    this.state.director = cue.director?.status === 'ready' ? cue.director : undefined;
    this.state.soloInvitation = undefined;
    this.state.soloSketches = undefined;
    this.state.keyChange = undefined;
    this.state.lastSoloAt = at;
    this.state.lastSoloRole = undefined;
    this.due.clear();
    this.votes.clear();
    this.lastKeyChange = index;
    const concept = this.state.director?.concept;
    this.state.requests++;
    const t = await callJev(
      bootstrapRequest(cue.prompt, this.model, concept, this.options.recentOpeners),
      'host',
      index,
      this.apiKey,
      this.abort.signal,
      this.provider,
    );
    this.trace(t);
    if (t.source === 'jev') {
      this.state.opener = t.answers.opener.choice as Musician;
      this.state.baseBpm = Number(t.answers.bpm.choice);
      this.root = Number(t.answers.root.choice);
      this.scale = t.answers.mode.choice as Frame['mode'];
    } else {
      // No opening decision: use the director's suggestion, else rotate the opener. Never the old song's.
      this.state.opener =
        concept?.openingInstrument ??
        musicians[(musicians.indexOf(this.state.opener) + 1) % musicians.length];
      if (concept) {
        this.state.baseBpm = concept.bpm;
        this.root = concept.root;
        this.scale = concept.mode;
      }
    }
    this.modeName = this.scale;
    this.state.initialRoot = this.root;
    this.state.initialMode = this.scale;
  }
  private windDown?: { cueId: string; startFrame: number };
  private get provider(): JevProvider {
    return this.state.provider ?? this.options.provider ?? 'openrouter';
  }
  /**
   * Move the whole room to the configured fallback provider, once. Requests already in flight
   * fail and are disclosed as fallbacks; every later trace names the provider that answered it.
   */
  private failover(reason: string, atFrame: number): boolean {
    const next = this.options.fallback;
    if (!next || this.state.providerSwitch) return false;
    this.state.providerSwitch = { from: this.provider, to: next.provider, reason, atFrame };
    this.state.provider = next.provider;
    this.apiKey = next.apiKey;
    this.model = next.model;
    this.failures = 0;
    return true;
  }
  /** Off-clock: ask the arranger for a solo arc ahead of time. Late or failed sketches are simply unused. */
  private requestSketch(role: Musician) {
    const key = this.options.directorApiKey ?? (this.provider === 'typesafe' ? '' : this.apiKey);
    if (!this.options.directorModel || !key || this.sketchesRequested >= 6) return;
    if (this.state.soloSketches?.[role]) return;
    this.sketchesRequested++;
    this.state.soloSketches = {
      ...this.state.soloSketches,
      [role]: { status: 'planning', model: this.options.directorModel, requestedAt: Date.now() },
    };
    void sketchSolo(role, this.view(), this.options.directorModel, key, this.abort.signal).then(
      (report) => {
        if (this.abort.signal.aborted || !this.state.soloSketches?.[role]) return;
        this.state.soloSketches[role] = report;
        this.publish();
      },
    );
  }
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
        this.options.directorApiKey ?? (this.provider === 'typesafe' ? '' : this.apiKey),
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
    private options: {
      provider?: JevProvider;
      directorModel?: string;
      directorApiKey?: string;
      recentOpeners?: Musician[];
      fallback?: { provider: JevProvider; apiKey: string; model: string };
    } = {},
  ) {
    super();
    const seed = hash(prompt + Date.now());
    this.state = {
      provider: mode === 'live' ? (options.provider ?? 'openrouter') : undefined,
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
  async start(): Promise<void> {
    try {
      if (this.state.mode === 'live') {
        if (this.options.directorModel) {
          this.state.director = { status: 'planning', model: this.options.directorModel };
          this.publish();
          this.state.director = await directJam(
            this.state.prompt,
            this.options.directorModel,
            this.options.directorApiKey ?? (this.provider === 'typesafe' ? '' : this.apiKey),
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
          this.provider,
        );
        this.trace(t);
        if (t.source !== 'jev' && this.failover(t.error ?? 'Opening request failed', -1)) {
          this.publish();
          return this.start();
        }
        if (t.source !== 'jev') throw new Error(t.error ?? 'Could not start Jev');
        this.state.opener = t.answers.opener.choice as Musician;
        this.state.baseBpm = Number(t.answers.bpm.choice);
        this.root = Number(t.answers.root.choice);
        this.scale = t.answers.mode.choice as Frame['mode'];
        this.state.initialRoot = this.root;
        this.state.initialMode = this.scale;
        this.modeName = this.scale;
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
    const lastFrame = this.state.frame;
    let prior = lastFrame;
    const cue =
      this.state.mode === 'live'
        ? this.state.setlist?.find((c) => c.appliedAt === undefined)
        : undefined;
    if (cue && this.windDown && lastFrame && !lastFrame.parts.some((p) => p.notes.length)) {
      // Everyone has stopped. The next song starts from nothing.
      await this.beginTheme(cue, index, at);
      if (this.abort.signal.aborted) return;
      prior = null;
    } else if (cue && !this.windDown && index - this.themeFrame0 >= minimumSongFrames) {
      this.windDown = { cueId: cue.id, startFrame: index };
      cue.atFrame = index + windDownFrames + 1;
    }
    // Musical time is counted from the start of the current song.
    const rel = index - this.themeFrame0;
    const winding = this.windDown ? index - this.windDown.startFrame : undefined;
    this.state.windDown = this.windDown ? { ...this.windDown, framesIn: winding! } : undefined;
    const openingOrder = [this.state.opener, ...musicians.filter((r) => r !== this.state.opener)];
    // Independent commitments, a fair oldest-due queue, and at most ONE new musical idea.
    const eligible = musicians
      .filter((r) => (this.due.get(r) ?? 0) <= index)
      .sort((a, b) => (this.due.get(a) ?? 0) - (this.due.get(b) ?? 0));
    let selected =
      winding !== undefined
        ? undefined
        : rel < 4
          ? openingOrder[rel]
          : eligible.find((r) => {
              const own = prior?.parts.find((p) => p.role === r);
              // Only a committed guitar or keyboard solo composes on its own track. A bass or drum
              // feature has no such track, so it must stay in the rotation or it would loop forever.
              return this.state.mode !== 'live' || (!continuingSolo(own) && !continuingPhrase(own));
            });
    const soloAge = at - (this.state.lastSoloAt ?? this.state.startedAt);
    const inviteRole = this.state.lastSoloRole === 'guitar' ? 'keys' : 'guitar';
    const soloDue =
      this.state.mode === 'live' &&
      rel >= 4 &&
      winding === undefined &&
      soloAge >= 175000 &&
      at + (32 * 60000) / (prior?.bpm ?? 96) < this.state.endsAt;
    if (soloDue) selected = inviteRole;
    this.state.soloInvitation = {
      role: inviteRole,
      urgency: Math.min(1, soloAge / 175000),
      required: soloDue,
    };
    if (this.state.mode === 'live' && rel >= 4 && winding === undefined && soloAge >= 175000 * 0.55)
      this.requestSketch(inviteRole);
    // Winding down is the one moment everyone may change at once: each player still sounding
    // decides how to finish, and a player who has stopped stays stopped.
    const selectedRoles: Musician[] =
      winding !== undefined
        ? musicians.filter((r) => prior?.parts.find((p) => p.role === r)?.notes.length)
        : [
            ...new Set([
              ...(selected ? [selected] : []),
              ...(this.state.mode === 'live'
                ? (prior?.parts
                    .filter((p) => continuingPhrase(p) || continuingSolo(p))
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
    // A new song has no memory of the one before it: nothing of the old song is heard or recalled.
    frozen.frames = frozen.frames.filter((f) => f.themeId === this.state.themeId);
    frozen.frame = frozen.frames.at(-1) ?? null;
    // One key change per sixteen bars at most, never while the band is still assembling.
    frozen.keyLeadOpen = rel >= 8 && index - this.lastKeyChange >= 8 && winding === undefined;
    frozen.keyAgeFrames = index - this.lastKeyChange;
    const phraseSignal = AbortSignal.any([
      this.abort.signal,
      AbortSignal.timeout(Math.max(1, Math.floor(at - Date.now() - 250))),
    ]);
    if (winding !== undefined)
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
    let lighting = lastFrame?.lighting ?? defaultLighting;
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
                this.provider,
              ),
            ];
          }
          const request = requestFor(role, frozen, rel, this.model);
          if (this.state.mode === 'live') {
            if (role !== 'lights') {
              const calls: Trace[] = [];
              try {
                const part = await composePhrase(
                  role,
                  frozen,
                  rel,
                  this.model,
                  async (eventRequest) => {
                    this.state.requests++;
                    const trace = await callJev(
                      eventRequest,
                      role,
                      index,
                      this.apiKey,
                      phraseSignal,
                      this.provider,
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
            return [await callJev(request, role, index, this.apiKey, phraseSignal, this.provider)];
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
        const held = lighting;
        if (trace.source === 'jev') lighting = toLighting(trace.answers);
        else if (trace.source === 'rehearsal') {
          // Rehearsal tours every wall picture, overlay and sky on a fixed rota. Not a Jev decision.
          const visual = lightRecipes.visual[Math.floor(index / 2) % lightRecipes.visual.length];
          const overlay =
            index % 6 < 4
              ? 'none'
              : lightRecipes.visual[(Math.floor(index / 2) + 4) % lightRecipes.visual.length];
          lighting = {
            wash: lightRecipes.wash[Math.floor(index / 3) % 11],
            beam: lightRecipes.beam[index % 11],
            laser: lightRecipes.laser[Math.floor(index / 4) % 8],
            intensity: 0.4 + (index % 5) * 0.1,
            motion: 0.3,
            visual,
            overlay,
            sky: lightRecipes.sky[Math.floor(index / SKY_DWELL_FRAMES) % lightRecipes.sky.length],
          };
        }
        // Weather has inertia. A new sky is accepted only after the last one has had time to arrive.
        if ((lighting.sky ?? held.sky) !== held.sky && index - this.skyChangedAt < SKY_DWELL_FRAMES)
          lighting = { ...lighting, sky: held.sky };
        else if (lighting.sky !== held.sky) this.skyChangedAt = index;
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
        // A spontaneous solo had no sketch; one requested now can still guide its later bars.
        if (selected === 'guitar' || selected === 'keys') this.requestSketch(selected);
      }
      // A finished solo retires its sketch so the next one gets a fresh story.
      if (
        previous?.solo &&
        !(source === 'jev' && composed.get(selected)?.solo) &&
        this.state.soloSketches?.[selected]?.status !== 'planning'
      )
        delete this.state.soloSketches?.[selected];
    }
    this.failures =
      this.state.mode === 'live' &&
      selectedRoles.length > 0 &&
      ![...decisions.values()].some((d) => d.source === 'jev')
        ? this.failures + 1
        : 0;
    // Rejected credentials or an exhausted balance will not recover by waiting; two silent
    // phrases in a row are reason enough as well.
    const refused = traces.find((t) => /HTTP (401|402|403)/.test(t.error ?? ''));
    if (this.state.mode === 'live' && (refused || this.failures >= 2))
      this.failover(refused?.error ?? 'Two phrases without a Jev response', index);
    if (this.failures >= 3) {
      this.stop('Decision service unavailable for three phrases');
      return;
    }
    const ds = [...decisions.values()].map((v) => v.d);
    const recentVotes = [...this.votes.values()]
      .filter((v) => index - v.frame <= 6)
      .map((v) => v.d);
    const drummer = decisions.get('drums');
    const bpm = nextTempo(
      prior?.bpm ?? this.state.baseBpm,
      this.state.baseBpm,
      ds,
      drummer?.source === 'jev' ? drummer.d : undefined,
    );
    let root = nextRoot(this.root, recentVotes, index, this.lastKeyChange);
    // Live: one player leads a key or mode change and the band's reference follows at once.
    // Bandmates hear the cue after it sounds and choose to follow on their own next turns.
    const leader = [...composed].find(
      ([role, part]) => decisions.get(role)?.source === 'jev' && part.performance?.keyLead,
    );
    if (leader && frozen.keyLeadOpen) {
      const lead = leader[1].performance!.keyLead!;
      root = lead.root;
      this.modeName = lead.mode;
      this.scale = baseMode(lead.mode);
      this.state.keyChange = { by: leader[0], root: lead.root, mode: lead.mode, atFrame: index };
    }
    if (this.state.keyChange && index - this.state.keyChange.atFrame > 8)
      this.state.keyChange = undefined;
    if (root !== this.root || (leader && frozen.keyLeadOpen)) {
      this.lastKeyChange = index;
      this.votes.clear();
    }
    this.root = root;
    const durationMs = (8 * 60000) / bpm;
    const pressure = endingPressure(
      (at - (this.state.themeStartedAt ?? this.state.startedAt)) / 1000,
    );
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
    // The band had its chance to finish by choice. Anything still sounding is cut, and said so.
    if (winding !== undefined && winding >= windDownFrames)
      for (const part of parts)
        if (part.notes.length) {
          part.notes = [];
          part.solo = false;
          part.cutForNextSong = true;
        }
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
      modeName: this.modeName,
      parts,
      lighting,
      ending,
      decisionRole: selected,
      chapter: ending
        ? 'The landing'
        : winding !== undefined
          ? 'Bringing it home'
          : rel < 4
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
              ? rel === 0
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
