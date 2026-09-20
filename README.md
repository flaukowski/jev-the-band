# JEV THE BAND ✳

**Five minds. One long, strange jam.**

Four musicians improvise through independent Jev decision calls. A fifth shapes the lighting. They share musical state, react to one another, and play through a common audio clock. No prerecorded songs; no text model pretending to be Jev.

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

- Jev chooses an opener, tempo, tonic, and mode; the opener plays alone before the others join across subsequent phrases.
- Only one musician revises a phrase at a time. Each sees only notes already played, with a reaction delay, plus private memory of its own part.
- Jev chooses style, groove and tension/release direction before composing actual notes. Eight stylistic branches guide composition; they are not loop presets. Sustained building is followed by settle/release/space, and score-based motif memory distinguishes an actual variation from a relabeled repeat.
- Guitar can play single lines, double stops, rhythmic chords, strums and swells, choosing exact notes on up to six strings. Keys can comp with both hands, play stabs or sustained chords, or split chords and melody. Five held notes per hand remains the limit.
- Pitched phrases contain up to twelve sequential attacks (eight for keys), with exact pitches, durations, dynamics, bends, 32nd and tuplet intervals. Drum composition uses two full bars of individually chosen hits/rests on its own elected subdivision; recorded cymbals ring naturally.
- Creative fields sample Jev's probabilities, with raw and applied answers recorded separately. Keyboard voice decoding avoids duplicate pitches within a hand using only nonzero model probabilities. Live does not use the demo's rhythm or voicing templates.
- Tempo changes gradually within ±10% of its starting value. Key changes require matching proposals from two musicians and four phrases between changes.
- Solos are independent; two or more musicians can step forward together. Choosing support ends a solo.
- Every player has a separate distortion, auto-wah, envelope filter, chorus, tremolo, delay and reverb rig. Jev chooses the bar's sonic character, then every pedal independently: 128 possible combinations per bar. The desk shows Jev's current states and your overrides. RMS-matched distortion and per-channel compression keep drive from overwhelming the mix.
- The soundboard provides level, mute, isolation solo, pan, tone, drive amount and actual signal meters. Musical soloists are labeled LEAD in the desk; listening SOLO does not change their decisions.
- Camera presets, orbit, zoom, reset and solo following complement animations synchronized to performed notes.
- Lux combines 12 washes, 12 beam arrangements, and 8 laser choices. These are stylized virtual presets, with smooth transitions and no strobe.
- After five minutes, increasing ending pressure asks the musicians to resolve. Two ending votes can land the jam. The server imposes a ten-minute ceiling; the live musicians choose their own ending notes.
- One shared room broadcasts score events to all viewers. Audience count does not multiply Jev calls.

## See the decisions

Open **Under the hood**, click a musician, or click a performer on stage. Inspect the actual outbound question schema, validated answers, full option probabilities, request hash, provider ID when supplied, latency, and provider-reported cost. Jev does not supply an inner monologue, and we do not invent one.

Every decision is labeled `jev`, `rehearsal`, or `fallback`. Notes reference their source trace and voice. Raw provider answers and probability-sampled applied choices are both inspectable. A failed/late composition repeats the last accepted part with fallback provenance, or rests when no previous part exists. Three consecutive failed musical compositions end the jam. Exports contain only the recent bounded buffer (180 calls / 8 phrases), not a complete recording or cryptographic proof. Prompts and musical state are visible to audience clients.

## Project map

```text
shared/music.ts     Types, schemas, personas, lighting vocabulary
shared/score.ts     Declarative score compiler and musical constraints
server/composer.ts  Sequential live note decisions; no preset accompaniment
server/drummer.ts   Full-bar hit/rest decisions on the elected drum subdivision
server/rig.ts       Independent pedal decisions conditioned on bar timbre
server/musical-context.ts  Own motif/arc memory and heard musical feedback
shared/performance.ts  Style/texture palettes and performed rig lookup
shared/mixer.ts     Listening mix and isolated effect override rules
server/listening.ts Causal symbolic hearing; no peer future notes
server/jev.ts       Typed Jev requests, strict response validation, provenance
server/room.ts      Shared performance, deadlines, entrances, ending
server/index.ts     Local/server hosting, SSE, protected controller actions
src/audio.ts       Web Audio instruments, effect buses, clock scheduling
src/drive-processor.js  Per-instrument RMS-matched saturation
src/samples.ts     Recorded voices, dynamics and alternate takes
src/Mixer.tsx      Soundboard and independent player pedalboards
public/samples/   162 recordings, integrity manifest and license credits
src/Stage.tsx      Three.js stage, players, lights, crowd
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

Recorded instruments load on **Enable sound** (about 11 MB). The soundboard reports readiness or an explicit synthesis fallback if files fail to load. Recordings are bundled locally; playback does not depend on a third-party sample CDN. See [sample attribution and licenses](public/samples/CREDITS.md). With ffmpeg installed, `node scripts/fetch-samples.mjs` rebuilds the pinned sample subset; normal installation does not need ffmpeg.

MIT licensed. Independent project; no affiliation with TypeSafe or Phish is implied. Musical personas are original, not impersonations of real performers.
