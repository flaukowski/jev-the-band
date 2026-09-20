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

On PowerShell, use `Copy-Item .env.example .env`. Open **http://127.0.0.1:5178**. Enter a title or description, choose **Offline rehearsal** or **Live Jev**, and press **Let's jam**. Press **Enable sound** to listen; playback never starts automatically.

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
- Musicians choose motif anchors, development, articulation, swing, commitment, twelve rhythmic shapes (including 32nds and tuplets), dynamics, tempo/harmony proposals, effects and hand patches.
- Notes compile into a declarative two-bar score. Validation enforces timing bounds and a five-note simultaneous limit for each keyboard hand.
- Tempo changes gradually within ±10% of its starting value. Key changes require matching proposals from two musicians and four phrases between changes.
- Solos are independent; two or more musicians can step forward together. Choosing support ends a solo.
- Every player has a separate distortion, auto-wah, envelope filter, chorus, tremolo, delay and reverb rig. Jev controls it unless a listener overrides a pedal.
- The soundboard provides level, mute, isolation solo, pan, tone, drive amount and actual signal meters. Musical soloists are labeled LEAD in the desk; listening SOLO does not change their decisions.
- A psychedelic festival stage where every light, ripple and gesture is driven by performed notes, Jev's typed choices or your own mix meters: real fret positions, real key layouts, sticks that land on the beat, twelve beam cues and eight laser geometries.
- Ten cameras, orbit, zoom, solo following, an automatic director, and a Full trip / Mellow / Clean lens control.
- Lux combines 12 washes, 12 beam arrangements, and 8 laser choices. These are stylized virtual presets, with smooth transitions and no strobe.
- After five minutes, increasing ending pressure asks the musicians to resolve. Two ending votes can land the jam. The server imposes a ten-minute ceiling and schedules a final tonic phrase before it.
- One shared room broadcasts score events to all viewers. Audience count does not multiply Jev calls.

## See the decisions

Open **Under the hood**, click a musician, or click a performer on stage. Inspect the actual outbound question schema, validated answers, full option probabilities, request hash, provider ID when supplied, latency, and provider-reported cost. Jev does not supply an inner monologue, and we do not invent one.

Every decision is labeled `jev`, `rehearsal`, or `fallback`. On a failed/late response, a musician repeats their last accepted idea; a performer without a previous phrase stays silent. Three wholly failed rounds end the jam. The trace is inspectable provenance, **not cryptographic proof**. Exports contain only the recent bounded server buffer (180 calls / 8 phrases). Prompts and musical state are visible to audience clients.

## Project map

```text
shared/music.ts     Types, schemas, personas, lighting vocabulary
shared/score.ts     Declarative score compiler and musical constraints
shared/mixer.ts     Listening mix and isolated effect override rules
server/listening.ts Causal symbolic hearing; no peer future notes
server/jev.ts       Typed Jev requests, strict response validation, provenance
server/room.ts      Shared performance, deadlines, entrances, ending
server/index.ts     Local/server hosting, SSE, protected controller actions
src/audio.ts       Web Audio instruments, effect buses, clock scheduling
src/samples.ts     Recorded voices, dynamics and alternate takes
src/Mixer.tsx      Soundboard and independent player pedalboards
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
# Explicit paid check: exactly five calls, one per persona:
npm run smoke:live
```

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
