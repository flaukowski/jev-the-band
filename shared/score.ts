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
  lyrical: [0, 0.5, 1.25, 2, 4.25, 4.75, 5.5, 6.25],
  thirty_seconds: [0, 1.5, 2, 4, 5.5, ...Array.from({ length: 8 }, (_, i) => 6 + i / 8), 7.25],
  triplets: [0, 1, 4, 5, ...[2, 6].flatMap((b) => [b, b + 1 / 3, b + 2 / 3]), 7],
  quintuplets: [
    0,
    1.5,
    4,
    5,
    ...[2, 6].flatMap((b) => Array.from({ length: 5 }, (_, i) => b + i / 5)),
    7,
  ],
  sextuplets: [0, 2, 4, ...Array.from({ length: 6 }, (_, i) => 6 + i / 6), 7],
  broken: [0, 0.75, 1.75, 3.25, 4.5, 5.25, 5.75, 7.25],
};
export function rhythmBeats(rhythm: Rhythm, swing: Decision['swing'] = 'straight'): number[] {
  const tuplets = ['triplets', 'quintuplets', 'sextuplets', 'thirty_seconds'].includes(rhythm);
  return [...onsets[rhythm]]
    .sort((a, b) => a - b)
    .map((b) =>
      !tuplets && b % 1 === 0.5 ? b + { straight: 0, light: 0.055, deep: 0.14 }[swing] : b,
    );
}
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
  const solo =
    d.action === 'solo' || (['hold', 'vary', 'develop'].includes(d.action) && !!previous?.solo);
  const repeated = d.action === 'hold' ? (previous?.repeated ?? 0) + 1 : 0;
  const part: Part = { role, decision: d, solo, repeated, notes: [], source: 'rehearsal' };
  if (d.action === 'rest' || (d.action === 'hold' && previous?.notes.length === 0)) return part;
  // Hold repeats the declarative idea, then recompiles in the ensemble's current harmony.
  if (d.action === 'hold' && previous) {
    d.degrees = [...previous.decision.degrees];
    d.rhythm = previous.decision.rhythm;
    d.density = previous.decision.density;
    d.articulation = previous.decision.articulation;
    d.swing = previous.decision.swing;
  } else if (previous && d.development !== 'new_theme' && d.action !== 'resolve') {
    const old = previous.decision.degrees;
    d.degrees = old.map((v, i) => {
      switch (d.development) {
        case 'repeat':
          return v;
        case 'answer':
          return i < 4 ? v : d.degrees[i];
        case 'sequence_up':
          return Math.min(7, v + 1);
        case 'sequence_down':
          return Math.max(0, v - 1);
        case 'invert':
          return clamp(old[0] * 2 - v, 0, 7);
        case 'fragment':
          return old[i % 3];
      }
      return v;
    });
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
      articulation: d.articulation,
      ...(role === 'guitar' && solo && d.articulation === 'bend' && duration > 0.4
        ? { bend: 1 }
        : {}),
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
      for (const beat of [2.75, 5.75]) emit(beat, 38, 0.09, vel * 0.24);
      if (
        d.action === 'develop' ||
        solo ||
        ['triplets', 'quintuplets', 'sextuplets', 'thirty_seconds'].includes(d.rhythm)
      )
        for (const [i, beat] of rhythmBeats(d.rhythm, d.swing)
          .filter((b) => b >= 6)
          .entries())
          emit(beat, [45, 47, 50, 38][i % 4], 0.12, vel * (i % 3 ? 0.65 : 0.95));
    }
  } else {
    const rhythm =
      d.action === 'space' || d.action === 'resolve'
        ? 'sustain'
        : solo && ['pocket', 'flow', 'offbeat'].includes(d.rhythm)
          ? 'lyrical'
          : d.rhythm;
    let beats = rhythmBeats(rhythm, d.swing);
    if (d.density === 'low' && rhythm !== 'sustain') beats = beats.filter((_, i) => i % 2 === 0);
    // A short run is punctuation. Step between anchors rather than endlessly arpeggiating.
    const octave = role === 'bass' ? (solo ? 48 : 36) : role === 'guitar' ? (solo ? 60 : 48) : 60;
    let lastDegree = d.degrees[0];
    beats.forEach((beat, i) => {
      const gap = (beats[i + 1] ?? 8) - beat;
      let degree = d.action === 'resolve' ? 0 : d.degrees[i % 8];
      if (solo && i && beat - beats[i - 1] <= 0.34)
        degree = clamp(lastDegree + (degree >= lastDegree ? 1 : -1), 0, 7);
      lastDegree = degree;
      const gate =
        d.articulation === 'staccato'
          ? 0.42
          : d.articulation === 'legato'
            ? 0.96
            : solo
              ? 0.82
              : 0.68;
      const duration = Math.max(
        0.045,
        Math.min(gap - 0.012, rhythm === 'sustain' ? 3.7 : gap * gate),
      );
      emit(
        beat,
        pitch(degree, octave),
        duration,
        vel * (i % 4 === 0 ? 1 : 0.76 + rng() * 0.18),
        role === 'keys' ? 'right' : undefined,
      );
      if (role === 'keys' && !solo && (rhythm === 'sustain' || i % 2 === 0)) {
        for (const extra of [2, 4])
          emit(beat, pitch((degree + extra) % 7, 60), duration, vel * 0.6, 'right');
      }
      if (role === 'guitar' && !solo && i % 2 === 0 && gap >= 0.45) {
        // Low, lightly staggered double stops give accompaniment body and leave the lead register open.
        emit(
          beat + 0.018,
          pitch((degree + 4) % 7, octave),
          Math.max(0.04, duration - 0.018),
          vel * 0.5,
        );
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
  const arc = Math.floor((frame + musicians.indexOf(role) * 5) / 7) % 5;
  d.action = ['vary', 'develop', 'solo', 'space', 'support'][arc] as Decision['action'];
  if (d.action === 'solo' && role === 'drums') d.action = 'develop';
  if (frame > 3 && frame % 7 === 1) d.action = 'hold';
  d.rhythm = (['pocket', 'broken', 'lyrical', 'sustain', 'clave'] as const)[arc];
  if (d.action === 'solo' && frame % 3) d.rhythm = frame % 2 ? 'triplets' : 'thirty_seconds';
  d.density = arc === 3 ? 'low' : arc === 2 ? 'high' : 'medium';
  d.dynamic = arc === 3 ? 'soft' : arc === 2 ? 'bold' : 'warm';
  const motifs = [
    [0, 2, 3, 2, 0, 2, 4, 2],
    [4, 4, 3, 2, 4, 5, 3, 0],
    [0, 1, 2, 4, 2, 1, 0, 0],
  ];
  d.degrees = [...motifs[Math.floor(rng() * motifs.length)]];
  d.development =
    frame % 11 === 0
      ? 'new_theme'
      : (['answer', 'sequence_up', 'fragment'][frame % 3] as Decision['development']);
  d.articulation = d.action === 'solo' ? 'bend' : 'natural';
  d.commitment = role === 'bass' ? 'patient' : role === 'guitar' ? 'brief' : 'settle';
  d.tempo = arc === 2 ? 'push' : arc === 3 ? 'ease' : 'stay';
  d.harmony = frame % 12 === 0 && frame > 0 ? 'up_fourth' : 'stay';
  d.left = 'rhodes';
  d.right = arc === 3 ? 'pad' : arc === 2 ? 'organ' : 'rhodes';
  d.effects = {
    drive: arc === 2,
    wah: false,
    envelope: arc === 1,
    chorus: role === 'keys',
    tremolo: false,
    delay: arc === 3,
    reverb: true,
  };
  if (previous?.parts.some((p) => p.decision.action === 'space') && rng() > 0.6) d.action = 'space';
  return d;
}
