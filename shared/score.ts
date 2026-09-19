import {
  clamp,
  decisionSchema,
  defaultDecision,
  musicians,
  noteSchema,
  random,
  scales,
  type Decision,
  type Frame,
  type Musician,
  type Note,
  type Part,
  type Rhythm,
} from './music.js';

const onsets: Record<Rhythm, number[]> = {
  pocket: [0, 1.5, 2, 3.5, 4, 5.5, 6, 7.5],
  offbeat: [0.5, 1.5, 2.75, 3.5, 4.5, 5.5, 6.75, 7.5],
  flow: Array.from({ length: 16 }, (_, i) => i / 2),
  sparse: [0, 2.5, 4, 6.5],
  sustain: [0, 4],
  clave: [0, 1.5, 3, 4, 5, 6.5],
};
export function validateNotes(notes: Note[], role: Musician): void {
  if (notes.length > 128) throw new Error('Phrase exceeds note ceiling');
  for (const n of notes) {
    noteSchema.parse(n);
    if (n.beat + n.duration > 8.001) throw new Error('Note crosses phrase boundary');
    if (role === 'keys' && !n.hand) throw new Error('Keyboard note needs a hand');
  }
  if (role === 'keys')
    for (const hand of ['left', 'right']) {
      const events = notes
        .filter((n) => n.hand === hand)
        .flatMap((n) => [
          { t: n.beat, d: 1 },
          { t: n.beat + n.duration, d: -1 },
        ])
        .sort((a, b) => a.t - b.t || a.d - b.d);
      let voices = 0;
      for (const event of events) {
        voices += event.d;
        if (voices > 5) throw new Error('More than five simultaneous notes per hand');
      }
    }
}
export function compile(
  role: Musician,
  input: Decision,
  root: number,
  mode: keyof typeof scales,
  seed: number,
  previous?: Part,
): Part {
  const d = decisionSchema.parse(input);
  const solo = d.action === 'solo' || (d.action === 'hold' && !!previous?.solo);
  const repeated = d.action === 'hold' ? (previous?.repeated ?? 0) + 1 : 0;
  const part: Part = { role, decision: d, solo, repeated, notes: [], source: 'rehearsal' };
  if (d.action === 'rest' || (d.action === 'hold' && previous?.notes.length === 0)) return part;
  // Hold repeats the declarative idea, then recompiles in the ensemble's current harmony.
  if (d.action === 'hold' && previous) {
    d.degrees = [...previous.decision.degrees];
    d.rhythm = previous.decision.rhythm;
    d.density = previous.decision.density;
  }
  const rng = random(seed);
  const vel = { soft: 0.4, warm: 0.6, bold: 0.78 }[d.dynamic] * (solo ? 1.1 : 1);
  const emit = (
    beat: number,
    midi: number,
    duration: number,
    velocity = vel,
    hand?: 'left' | 'right',
  ) =>
    part.notes.push({
      beat,
      midi,
      duration: Math.min(duration, 8 - beat),
      velocity: clamp(velocity, 0.1, 0.95),
      ...(hand ? { hand, patch: d[hand] } : {}),
    });
  const scale = scales[mode];
  const pitch = (degree: number, octave: number) =>
    octave + root + scale[degree % 7] + 12 * Math.floor(degree / 7);
  if (role === 'drums') {
    const ambient = d.action === 'space' || d.rhythm === 'sustain';
    if (ambient) {
      emit(0, 51, 1.5, vel * 0.55);
      emit(4, 49, 2, vel * 0.35);
    } else {
      for (let beat = 0; beat < 8; beat += d.density === 'high' ? 0.5 : 1)
        emit(beat, d.rhythm === 'flow' ? 51 : 42, 0.18, vel * (beat % 1 ? 0.48 : 0.72));
      for (const beat of [0, 2, 4, 6]) emit(beat, 36, 0.35, vel);
      for (const beat of [1, 3, 5, 7]) emit(beat, 38, 0.22, vel * 0.9);
      if (d.rhythm === 'offbeat' || d.rhythm === 'clave')
        for (const beat of [1.75, 4.75, 6.5]) emit(beat, 36, 0.22, vel * 0.65);
      if (d.action === 'develop' || solo)
        for (const [i, beat] of [6, 6.5, 7, 7.5].entries())
          emit(beat, [45, 47, 50, 38][i], 0.3, vel);
    }
  } else {
    const rhythm = d.action === 'space' || d.action === 'resolve' ? 'sustain' : d.rhythm;
    let beats = onsets[rhythm];
    if (d.density === 'low' && rhythm !== 'sustain') beats = beats.filter((_, i) => i % 2 === 0);
    if (solo && beats.length < 8) beats = onsets.flow;
    const octave = role === 'bass' ? 36 : role === 'guitar' ? 60 : 60;
    beats.forEach((beat, i) => {
      const degree = d.action === 'resolve' ? 0 : d.degrees[i % 8];
      const requestedDuration =
        rhythm === 'sustain' ? 3.7 : rhythm === 'sparse' ? 1.25 : role === 'bass' ? 0.4 : 0.34;
      const duration =
        role === 'keys'
          ? Math.min(requestedDuration, (beats[i + 1] ?? 8) - beat - 0.08)
          : requestedDuration;
      emit(
        beat,
        pitch(degree, octave),
        duration,
        vel * (0.9 + rng() * 0.1),
        role === 'keys' ? 'right' : undefined,
      );
      if (role === 'keys' && !solo && (rhythm === 'sustain' || i % 2 === 0)) {
        for (const extra of [2, 4])
          emit(beat, pitch((degree + extra) % 7, 60), duration, vel * 0.6, 'right');
      }
    });
    if (role === 'keys')
      for (const beat of [0, 4])
        for (const degree of [0, 4])
          emit(beat, pitch(degree, 48), rhythm === 'sustain' ? 3.8 : 1.6, vel * 0.48, 'left');
  }
  if (previous) {
    const motif = (value: Decision) =>
      JSON.stringify([
        value.degrees,
        value.rhythm,
        value.density,
        value.dynamic,
        value.left,
        value.right,
      ]);
    part.repeated = motif(d) === motif(previous.decision) ? previous.repeated + 1 : 0;
  }
  validateNotes(part.notes, role);
  return part;
}
export function nextTempo(current: number, base: number, decisions: Decision[]): number {
  const impulse =
    decisions.reduce((sum, d) => sum + { ease: -1, stay: 0, push: 1 }[d.tempo], 0) /
    Math.max(decisions.length, 1);
  return Math.round(clamp(current * (1 + impulse * 0.012), base * 0.9, base * 1.1) * 10) / 10;
}
export function nextRoot(
  root: number,
  decisions: Decision[],
  phrase: number,
  lastChange: number,
): number {
  if (phrase - lastChange < 4) return root;
  const votes = decisions.map((d) => d.harmony);
  if (votes.filter((v) => v === 'up_fourth').length >= 2) return (root + 5) % 12;
  if (votes.filter((v) => v === 'up_fifth').length >= 2) return (root + 7) % 12;
  return root;
}
export function endingPressure(elapsedSeconds: number): number {
  return clamp((elapsedSeconds - 300) / 270, 0, 1);
}
export function rehearsal(
  role: Musician,
  frame: number,
  seed: number,
  previous: Frame | null,
): Decision {
  const rng = random(seed + frame * 31 + musicians.indexOf(role) * 197);
  const d = defaultDecision();
  const arc = Math.floor(frame / 6) % 5;
  d.action = ['vary', 'develop', 'solo', 'space', 'support'][arc] as Decision['action'];
  if (d.action === 'solo' && role !== (frame % 2 ? 'keys' : 'guitar')) d.action = 'support';
  if (frame % 4 === 1) d.action = 'hold';
  d.rhythm = (['pocket', 'offbeat', 'flow', 'sustain', 'clave'] as const)[arc];
  d.density = arc === 3 ? 'low' : arc === 2 ? 'high' : 'medium';
  d.dynamic = arc === 3 ? 'soft' : arc === 2 ? 'bold' : 'warm';
  d.degrees = Array.from({ length: 8 }, (_, i) => (i === 0 ? 0 : Math.floor(rng() * 7)));
  d.tempo = arc === 2 ? 'push' : arc === 3 ? 'ease' : 'stay';
  d.harmony = frame % 12 === 0 && frame > 0 ? 'up_fourth' : 'stay';
  d.left = 'rhodes';
  d.right = arc === 3 ? 'pad' : arc === 2 ? 'organ' : 'rhodes';
  d.effects = { drive: arc === 2, wah: arc === 1, delay: arc === 3, reverb: true };
  if (previous?.parts.some((p) => p.decision.action === 'space') && rng() > 0.6) d.action = 'space';
  return d;
}
