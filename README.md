# JEV THE BAND ✳

**Six minds. One long, strange jam.**

Four Jev musicians choose notes, rhythms, chords and effects, listening to what the others have already played. Lux runs the lights; Patch balances the mix and audience. A psychedelic WebGL venue animates the actual performance. Everyone watching shares one server-owned band.

Live uses fresh model decisions, with independent 2–12-bar phrases and 8–32-bar guitar/keyboard solos. An optional GPT-5.6 Luna director turns each submitted theme into a sonic concept. The separate **Instrument demo · no AI** mode needs no key and does not interpret its title. Live traces show the real requests, responses and applied probability draws.

## Run locally

Use Node.js 22 or newer:

```sh
npm ci
cp .env.example .env
npm run dev
```

On PowerShell use `Copy-Item .env.example .env`. Open **http://127.0.0.1:5178**. Enter a theme and press **Let's jam** or **Play demo**. That click enables audio and loads the instruments. A spectator uses **Listen to this jam**.

For live music, configure either provider in the server's ignored `.env`:

| Provider | Key | Model default |
|---|---|---|
| Direct TypeSafe | `TYPESAFE_API_KEY` | `jev-1.13.0` |
| OpenRouter Decisions | `OPENROUTER_API_KEY` | `typesafe/jev-1.13` |

`JEV_PROVIDER=auto` prefers TypeSafe when its key exists; explicitly set `typesafe` or `openrouter` to pin the transport. There is no automatic failover. The optional Luna director needs an **OpenRouter** credential even with direct TypeSafe music; without it, Jev works from the raw theme. Set `DIRECTOR_ENABLED=0` to disable the director. No credentials belong in `VITE_` variables, browser code, traces or commits.

## Play with it

- Rook: sampled electric guitar, bends, strums and melodic leads. Moss: sampled fingered bass. June: independent piano, Rhodes, organ or synth-family voices per hand, at most five held notes per hand. Kit: drums with natural cymbal tails.
- Each player has level, pan, mute, listening solo and an appropriate effects rig. Jev chooses effects by bar; manual overrides remain local. Patch controls gentle balance, room, compression and crowd mood, or you can take over.
- Queue another prompt while playing for an eight-bar transition. Players develop their own phrases, negotiate tempo/harmony, and can overlap solos. Ending pressure grows after five minutes; ten minutes is the hard maximum.
- Explore camera views, orbit/zoom, automatic direction, solo following, lens effects and reduced movement. Open **Under the hood** for provenance.

The 162 bundled recordings are individual notes, not backing loops. Other voices use synthesis. Generated crowd recordings are **not included**: a clearly labeled procedural fallback plays until an approved bank is installed. Musical taste, guitar realism and long-run variation remain listening and tuning goals, not guarantees.

## Verify and contribute

```sh
npm run check
npx playwright install chromium
# With an isolated dev server running:
npm run test:browser
```

Browser checks mute physical output; most make no provider calls. Paid diagnostics are separate, bounded commands described in [CONTRIBUTING](CONTRIBUTING.md). GitHub Actions is currently disabled; local checks remain available.

## Docs and hosting

- [Feature-by-feature audit and remaining work](docs/FEATURE-AUDIT.md)
- [Original prompt](docs/ORIGINAL-PROMPT.md), [follow-up prompts](docs/PROMPT-LOG.md), [design decisions](docs/DESIGN-DECISIONS.md)
- [Architecture](docs/ARCHITECTURE.md) and [musical architecture](docs/MUSICAL-ARCHITECTURE.md)
- [TypeSafe and OpenRouter integration](docs/PROVIDERS.md)
- [Deployment: Railway, Vercel and ChatGPT Sites](docs/DEPLOYMENT.md)
- [Audience generation and review](docs/AUDIENCE.md), [verification evidence](docs/VERIFICATION.md)

**[Open the live demo](https://jev-the-band-production.up.railway.app).** It runs direct TypeSafe Jev on Railway; starting a performance requires host access. The optional Luna director is not configured on this deployment, so Jev composes from the submitted theme directly. Spectators can join without a host token.

Build your own single Node service with `npm run build && npm start` (port 4310). Use one replica, a server-only host token and a dedicated provider key. Room state is in memory; restarting ends the jam. See the deployment guide for exact limits.

Code is [MIT licensed](LICENSE); recordings have their own [attribution and licenses](public/samples/CREDITS.md). Normal installation needs no ffmpeg or sample CDN. The repository's current history remains private pending publication curation; a credential scan alone does not make old commits and prompt history privacy-safe. Independent project; no affiliation with TypeSafe or Phish is implied. The musicians are original personas.
