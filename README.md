# JEV THE BAND ✳

**Six minds. One long, strange jam.**

Four musicians improvise through independent Jev decision calls. Lux shapes the lighting; Patch balances the sound. One initial LLM brief translates your prompt into a sonic concept and section map, clearly labeled separately from Jev. The musicians choose the actual notes, react to one another, and play through a common audio clock. No prerecorded songs.

This is a working local prototype with **offline rehearsal** and **live Jev** modes. Recorded guitar, fingered bass, piano and drum accents play original generated phrases through independent effects rigs. Some keyboard and drum voices remain synthesized. Musical taste still needs listening sessions and iteration.

## Run it

Node.js 22 or newer:

```sh
npm ci
cp .env.example .env
# Optional: put an OpenRouter key in .env for live Jev.
npm run dev
```

On PowerShell, use `Copy-Item .env.example .env`. Open **http://127.0.0.1:5178**. Live Jev is selected automatically when a key is available. Enter a title or description at the top and press **Let's jam**; Play loads the instruments and enables sound. The **Instrument demo · no AI** option uses procedural music and does not interpret the title. Spectators joining a running performance press **Listen to this jam**. Playback never starts without a gesture.

For a single production-style local process:

```sh
npm run build
npm start
```

Open **http://127.0.0.1:4310**. The server serves both the compiled stage and its API. The default binding is local only.

## The band

| Persona | Instrument | Musical instinct |
|---|---|---|
| Rook | Electric guitar | Patient melodic exploration; singable phrases, then risk |
| Moss | Electric bass | Deep pocket; small changes with gravitational pull |
| June | Piano, Rhodes, organ, analog synth, pad, bell | Harmonic color; independent sounds for each hand |
| Kit | Drums | Elastic but reliable time; fill as an invitation |
| Lux | Stage lighting | Listen to density, momentum, soloists, and silence |
| Patch | Front-of-house sound | Gentle level balance, room ambience and glue compression |

- An LLM director proposes a sonic concept, opening player and section map for each submitted theme. Jev chooses the actual opener, tempo, tonic and mode from a neutral host context; the opener plays alone before the others join. The director defaults to `openai/gpt-5.6-luna`; set `DIRECTOR_MODEL` or disable it with `DIRECTOR_ENABLED=0`. A failed brief is disclosed and Jev composes from the raw prompt.
- Each musician chooses its own 2–12-bar musical sentence, delivered as fresh connected two-bar chunks. One musician can begin a new idea at an ordinary boundary; already-committed phrases continue concurrently. Each sees only performed peers, with a reaction delay, plus private memory of its own part.
- Jev chooses style, groove and tension/release direction before composing actual notes. Eight stylistic branches guide composition; they are not loop presets. Sustained building is followed by settle/release/space, and score-based motif memory distinguishes an actual variation from a relabeled repeat.
- Guitar can play single lines, double stops, rhythmic chords, strums and swells, choosing exact notes on up to six strings. Keys can comp with both hands, play stabs or sustained chords, or split chords and melody. Five held notes per hand remains the limit.
- Each two-bar delivery chunk contains up to twelve sequential pitched attacks (eight for keys), with exact pitches, durations, dynamics, bends, 32nd and tuplet intervals. Drum composition uses two full bars of individually chosen hits/rests on its own elected subdivision; recorded cymbals ring naturally.
- Creative fields sample Jev's probabilities, with raw and applied answers recorded separately. Keyboard voice decoding avoids duplicate pitches within a hand using only nonzero model probabilities. Live does not use the demo's rhythm or voicing templates.
- Tempo changes gradually within ±10% of its starting value. Key changes require matching proposals from two musicians and four phrases between changes.
- Rook and June have dedicated melodic solo composition: Jev chooses a mood-dependent 8–32-bar duration, then writes fresh connected chunks throughout it. Invitations grow with time; a featured opportunity is scheduled by roughly three minutes without a new solo, while enough jam time remains. Two players can solo together. A failed solo chunk is silenced instead of repeating the old lead.
- Guitar, bass and keys each have seven independent pedals: distortion, auto-wah, envelope filter, chorus, tremolo, delay and reverb, with instrument-specific strengths. Kit has restrained saturation, echo and room reverb; sweeping filters, chorus and tremolo are excluded to preserve drum identity. Jev chooses the bar's sonic character, then its pedal combination (128 for pitched rigs, eight for Kit). The desk shows current states and overrides. RMS-matched distortion and per-channel compression control drive level.
- Patch reads actual RMS/peak measurements from the host's reference browser and adjusts each channel by at most 1 dB per update, within ±6 dB. He also chooses shared reverb and compression. **The whole room** desk lets you switch to a saved manual mix; manual mode bypasses Patch's balance trims. Local channel faders remain available in either mode.
- June's card shows the sounds assigned to each hand. Every musician shows its current bar range within the phrase or solo.
- Submit another prompt during a live jam to queue a theme. An eight-bar lead-in starts at the next two-bar boundary; up to four prompts queue in order. At the shared cue, all players compose for the new direction. This explicit user cue can interrupt their phrases; the ten-minute jam limit remains.
- A quiet audience bus crossfades ambience and occasional reactions. Patch controls its mood/level; listeners can mute it or use manual settings. The current fallback is labeled procedural room noise/soft claps. A reviewed generated sample bank and bounded generation script are supported, but no generated crowd recordings are bundled. See [Audience sound](docs/AUDIENCE.md).
- The soundboard provides level, mute, isolation solo, pan, tone, drive amount and actual signal meters. Musical soloists are labeled LEAD in the desk; listening SOLO does not change their decisions.
- A psychedelic festival stage where every light, ripple and gesture is driven by performed notes, Jev's typed choices or your own mix meters: real fret positions, real key layouts, sticks that land on the beat, twelve beam cues and eight laser geometries.
- Ten cameras, orbit, zoom, solo following, an automatic director, and a Full trip / Mellow / Clean lens control.
- Lux combines 12 washes, 12 beam arrangements, and 8 laser choices. These are stylized virtual presets, with smooth transitions and no strobe.
- After five minutes, increasing ending pressure asks the musicians to resolve. Two ending votes can land the jam. The server imposes a ten-minute ceiling; the live musicians choose their own ending notes.
- One shared room broadcasts score events to all viewers. Audience count does not multiply Jev calls.

## See the decisions

Open **Under the hood**, click a musician, or click a performer on stage. Inspect the actual outbound question schema, validated answers, full option probabilities, request hash, provider ID when supplied, latency, and provider-reported cost. Jev does not supply an inner monologue, and we do not invent one.

Every decision is labeled `jev`, `rehearsal`, or `fallback`. Notes reference their source trace and voice. Raw provider answers and probability-sampled applied choices are both inspectable. A failed/late composition repeats the last accepted part with fallback provenance, or rests when no previous part exists. Three consecutive failed musical compositions end the jam. Exports contain only the recent bounded buffer (180 calls / 8 phrases), not a complete recording or cryptographic proof. Prompts and musical state are visible to audience clients.

The sonic concept card exposes the LLM director's actual request, validated brief, model and separate reported cost. Patch's Jev requests appear under **PATCH** in the decision console, including measured levels and applied mix provenance. Automatic balance needs a reference browser with audio enabled; without fresh measurements it holds the last mix. Starting a jam selects this browser as the reference. An authorized host can also use the desk's reference button after rejoining. Measurements are taken before listening faders/mutes/solos; local pedal colors can affect them. No audio recording is uploaded.

## Project map

```text
shared/music.ts     Types, schemas, personas, lighting vocabulary
shared/score.ts     Declarative score compiler and musical constraints
server/composer.ts  Sequential live note decisions; no preset accompaniment
server/director.ts  One-time LLM sonic concept, separately disclosed
server/engineer.ts  Jev balance and master-effect choices from measured sound
server/solo.ts      Melodic solo plans and phrase-continuation rules
server/drummer.ts   Full-bar hit/rest decisions on the elected drum subdivision
server/rig.ts       Independent pedal decisions conditioned on bar timbre
server/musical-context.ts  Own motif/arc memory and heard musical feedback
shared/performance.ts  Style/texture palettes and performed rig lookup
shared/mixer.ts     Listening mix and isolated effect override rules
shared/rigs.ts      Instrument-appropriate pedal capabilities and strengths
shared/engineer.ts  Master controls, bounded mix and meter schemas
shared/setlist.ts   Queued prompts and musical-time transitions
server/listening.ts Causal symbolic hearing; no peer future notes
server/jev.ts       Typed Jev requests, strict response validation, provenance
server/room.ts      Shared performance, deadlines, entrances, ending
server/index.ts     Local/server hosting, SSE, protected controller actions
src/audio.ts       Web Audio instruments, effect buses, clock scheduling
src/drive-processor.js  Per-instrument RMS-matched saturation
src/samples.ts     Recorded voices, dynamics and alternate takes
src/Mixer.tsx      Soundboard and independent player pedalboards
src/MasterDesk.tsx Jev/manual global mix and reference-browser controls
src/ConceptCard.tsx Sonic concept, section map and director provenance
src/audience.ts    Crossfading ambience/reactions and generated sample-bank support
public/samples/   162 recordings, integrity manifest and license credits
src/Stage.tsx      Stage shell and camera desk
src/stage/         Three.js venue: signals, IK characters, instruments, light rig, wall, crowd, particles, post
src/App.tsx        Audience controls and live decision console
src/main.tsx       React entrypoint
docs/             Original prompt, design history, research, architecture
```

## Verification

```sh
npm run check
npx playwright install chromium
# With npm run dev running:
npm run test:browser
# Explicit paid check: exactly five phrase-plan calls, one per persona:
npm run smoke:live
# Actual live composition: at most 240 calls / 90 seconds, with variation checks:
npm run smoke:performance
# Two isolated prompt openings: at most 140 total calls:
npm run audit:prompts
# Three actual chord/drum compositions, at most 28 calls:
npm run audit:groove
# Two LLM concepts plus at most two Jev opening decisions:
npm run audit:director
# Two real eight-bar solo excerpts, at most 120 Jev calls:
npm run audit:solos
# Dry-run crowd-generation plan; no key or paid call needed:
npm run generate:audience -- --count 3
```

See [Musical architecture](docs/MUSICAL-ARCHITECTURE.md) for composition layers, instrument capabilities, preserved features and current limits.

Browser verification launches Chromium muted and checks the actual master signal without playing sound through speakers. CI runs deterministic tests and builds only; it never reads a key or calls Jev. See [verification evidence](docs/VERIFICATION.md).

## Documentation and publishing

- [Complete original prompt](docs/ORIGINAL-PROMPT.md)
- [Prompt history](docs/PROMPT-LOG.md)
- [Taste, style, and design decisions](docs/DESIGN-DECISIONS.md)
- [Architecture and recommended workflow](docs/ARCHITECTURE.md)
- [Jev research and working examples](docs/RESEARCH.md)
- [Self-hosting and a future ChatGPT Site](docs/DEPLOYMENT.md)
- [Next steps](docs/ROADMAP.md)

The current prototype is not publicly deployed. Use a separate production key before opening a public room. Credentials belong in the server environment, never a `VITE_` variable. No application startup code reads credentials from another project. The optional import script requires an explicit source path and refuses to overwrite an existing `.env`.

Recorded instruments load on **Let's jam** or **Listen to this jam** (about 11 MB). The soundboard reports readiness or an explicit synthesis fallback if files fail to load. Recordings are bundled locally; playback does not depend on a third-party sample CDN. See [sample attribution and licenses](public/samples/CREDITS.md). With ffmpeg installed, `node scripts/fetch-samples.mjs` rebuilds the pinned sample subset; normal installation does not need ffmpeg.

MIT licensed. Independent project; no affiliation with TypeSafe or Phish is implied. Musical personas are original, not impersonations of real performers.
