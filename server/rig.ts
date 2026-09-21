import { fxNames, type Answer, type JevRequest, type Musician } from '../shared/music.js';
import { availableEffects } from '../shared/rigs.js';
import { choice } from './jev.js';

export const timbres = {
  earthy_grit: 'Warm amp grit, focused and close, with clear rhythmic attacks',
  liquid_funk: 'Expressive attack-shaped filter motion, bouncy and articulate',
  shimmering_width: 'Lush doubled shimmer, warm and wide',
  dub_space: 'Spacious echo answers around dry rhythmic anchors',
  pulsing_glow: 'Rhythmic tremolo motion with a soft halo',
  psychedelic_surge: 'An adventurous layered swirling surge; allow multiple strong colors',
  intimate_dry: 'An intentional clear dry contrast after a colored passage',
};
export function timbresFor(role: Musician) {
  return role === 'drums'
    ? {
        natural_punch: 'Clear acoustic drum attacks and natural cymbals; keep the groove legible',
        small_room: 'A little room around a focused acoustic kit',
        warm_breakbeat: 'Gentle tape-like saturation and a close drum sound',
        dub_space: 'Restrained echo punctuation while preserving kick/snare definition',
        roomy_lift: 'A modest room lift for a build or fill; keep transients clear',
        close_dry: 'Tight dry contrast, natural drums up front',
      }
    : timbres;
}

export function rigRequest(
  role: Musician,
  model: string,
  context: unknown,
  plan: Record<string, Answer>,
): JevRequest {
  const colors = {
    drive:
      'Saturated grit/sustain. Useful for earthy grit or a surge. Can obscure clean key/drum attacks.',
    wah: 'Continuous sweeping filter. Useful for psychedelic movement; may compete with an attack-shaped envelope.',
    envelope:
      'Attack-shaped filter. Useful for liquid funk; long pads or cymbal tails may lose clarity.',
    chorus:
      'Wide doubled shimmer. Useful for lush keys or shimmering guitar; low bass and drums can lose focus.',
    tremolo:
      'Pulsing amplitude. Useful for pulsing glow; can disturb a tightly articulated pocket.',
    delay:
      'Tempo-related echoes. Useful for dub space and melodic answers; dense passages may become cluttered.',
    reverb:
      'Ringing ambience. Useful for a halo, swells or a spacious landing; intimate dry passages need less.',
  };
  return {
    model,
    state: {
      context,
      plan: Object.fromEntries(Object.entries(plan).map(([k, a]) => [k, a.choice])),
      task: 'Realize your selected timbre for each bar through independent pedal choices. Effects are a major musical dimension. Use rich combinations when they serve the selected color, and selective bypass for contrast. These are descriptive intentions, not pedal presets: every switch is your decision and any combination is allowed. Your prior rig is in ownMemory. Preserve bass/drum pulse definition. These choices affect only your instrument.',
    },
    questions: Object.fromEntries([
      ...(role === 'guitar'
        ? [1, 2].map((bar) => [
            bar === 1 ? 'driveLevel' : 'driveLevelBar2',
            choice(
              `BAR ${bar}: when your drive pedal is on, which gain stage? Rhythm playing and chords want the light overdrive; a featured solo or a peak wants the lead channel.`,
              {
                overdrive: 'Light overdrive: edge-of-breakup crunch that keeps chords clear',
                lead: 'Lead: thick saturated sustain that makes single notes sing',
              },
            ),
          ])
        : []),
      ...[1, 2].flatMap((bar) =>
        fxNames.map((effect) => [
          bar === 1 ? effect : effect + 'Bar2',
          choice(
            `BAR ${bar}, chosen timbre: ${plan['timbreBar' + bar].choice}. Should your ${effect} be engaged? ${colors[effect]} Judge its specific fit to this timbre, instrument, style and arc; the other pedals are independent.`,
            !availableEffects(role).includes(effect)
              ? { off: 'This effect is not part of this instrument rig' }
              : {
                  off: 'Bypass: this particular color does not serve this bar',
                  on: 'Engage: this particular color serves this bar',
                },
          ),
        ]),
      ),
    ]),
  };
}
