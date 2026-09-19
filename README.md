# JEV THE BAND ✳

**Five minds. One long, strange jam.**

Four musicians improvise through independent Jev decision calls. A fifth shapes the lighting. They share musical state, react to one another, and play through a common audio clock. No prerecorded songs; no text model pretending to be Jev.

This is a working, local prototype, with an explicit **offline rehearsal** mode and a **live Jev** mode. The audio is original synthesis rather than a sampled concert band. Musical taste still needs listening sessions and iteration.

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
- Musicians choose eight motif scale degrees, one of six rhythmic shapes, density, dynamics, role, tempo/harmony proposals, and applicable effects or hand patches.
- Notes compile into a declarative two-bar score. Validation enforces timing bounds and a five-note simultaneous limit for each keyboard hand.
- Tempo changes gradually within ±10% of its starting value. Key changes require matching proposals from two musicians and four phrases between changes.
- Solos are independent; two or more musicians can step forward together. Choosing support ends a solo.
- Guitar and bass have drive, auto-wah, delay, and reverb. Effects are real Web Audio signal paths.
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
server/jev.ts       Typed Jev requests, strict response validation, provenance
server/room.ts      Shared performance, deadlines, entrances, ending
server/index.ts     Local/server hosting, SSE, protected controller actions
src/audio.ts       Web Audio instruments, effect buses, clock scheduling
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

MIT licensed. Independent project; no affiliation with TypeSafe or Phish is implied. Musical personas are original, not impersonations of real performers.
