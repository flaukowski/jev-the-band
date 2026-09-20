# Deployment

## Hosting decision — 2026-09-20

**Use Railway for this demo.** The existing Node process owns one persistent ten-minute room, an authoritative clock, request budgets and an SSE spectator stream. One Docker service serves the API, WebGL frontend and recorded samples on a single HTTPS origin. This is an architectural assessment, not a hosting benchmark.

| Option | Fit for this code |
|---|---|
| Railway | Existing persistent Node service in one container. Best current fit; use one replica. |
| Vercel | Good static frontend option. Request-bound Functions do not replace the in-memory room owner without redesign; a persistent backend would still be needed. |
| ChatGPT Sites | Potential audience frontend using an external band backend. The available Sites workflow targets a Cloudflare-compatible build rather than this persistent Node process; actual audio/WebGL/SSE integration remains untested. |

References: [Railway Express guide](https://docs.railway.com/guides/express), [Vercel Function limits](https://vercel.com/docs/functions/limitations). The Sites assessment comes from the installed hosting workflow inspected during this task, not an actual Sites deployment.

A dedicated Railway project/service and domain have been prepared. **No deployment has run yet; the dedicated production key is pending.** A domain allocation is not a live release. Git history remains private; hosting the compiled demo does not require publishing it.

## Runtime configuration

| Variable | Purpose |
|---|---|
| `JEV_PROVIDER` | `typesafe`, `openrouter` or `auto`; pin explicitly in production |
| `TYPESAFE_API_KEY` | Dedicated TypeSafe server key |
| `TYPESAFE_MODEL` | Default `jev-1.13.0` |
| `OPENROUTER_API_KEY` | Dedicated key for routed Jev and/or optional Luna director |
| `OPENROUTER_JEV_MODEL` | Default `typesafe/jev-1.13` |
| `DIRECTOR_MODEL` | Default `openai/gpt-5.6-luna` |
| `DIRECTOR_ENABLED` | `0` disables Luna; absent OpenRouter key also disables it |
| `HOST` / `PORT` | Container: `0.0.0.0` / `4310` |
| `CONTROLLER_TOKEN` | Random host token, at least 24 characters; protects every POST |
| `STAGE_ORIGIN` | Exact public HTTPS origin, including scheme |
| `MAX_JEV_REQUESTS` | Per-jam attempt ceiling, default/hard maximum 6000 |
| `BUILD_REVISION` | Full committed SHA for CLI uploads; Git-linked builds expose `RAILWAY_GIT_COMMIT_SHA` |

TypeSafe-only music needs no OpenRouter key but has no Luna brief. Use dedicated production credentials. No secrets in build arguments or `VITE_` variables. Audio-generation credentials are unnecessary at runtime.

The host enters the controller token in the stage. It stays in page memory, never localStorage or exports. Spectators need no token and cannot start, queue or stop a jam. Public read routes intentionally expose themes and recent decisions: use public material in public performances.

The Docker build includes `public/`, so all instrument samples ship. The final image copies only runtime code, dependencies and compiled assets. Docker/Railway excludes `.env*`, private artifacts, local agent settings and docs from build context. Full private prompts stay out of deployment; approved public samples are intentionally downloadable.

## Release procedure

1. Verify Git state, local checks, production build and secret scan. Keep Actions disabled unless requested otherwise.
2. Configure the dedicated provider key, random host token, exact origin and one replica. Write secrets through stdin/the hosting secret store without printing values.
3. Make an explicit bounded provider smoke check. Health's `liveAvailable` reports key presence, not successful authentication.
4. Upload committed source with the Docker builder and `/api/health` check; set `BUILD_REVISION`. `railway.json` records one replica and bounded failure restarts.
5. Verify actual HTTPS health version/revision, served HTML and its JS/CSS, sample manifest and audio. Build success alone is not release proof.
6. Confirm anonymous POST rejection, foreign-origin rejection, host control, two shared spectators, muted browser rendering and a bounded live performance; stop the test afterward.

Do not horizontally scale this in-memory process. A container restart loses the room. Avoid scale-to-zero for a continuously available venue. The app does not automatically begin another paid jam after ending or restarting.

## Self-hosting and separate frontends

```sh
npm ci
npm run build
npm start
```

Local default: http://127.0.0.1:4310. Public hosting needs HTTPS, unbuffered SSE, controller token and exact origin.

A Vercel or Sites frontend can use public `VITE_API_BASE_URL` pointing to Railway, with the backend origin set to the exact frontend origin. Browsers cannot use a hosting private-network URL. Check the actual frontend's WebGL, audio gesture, SSE, cross-origin and embed policies. This split remains unverified.

## Larger-venue limits

- Room/replay state is not durable; no restart recovery.
- A bearer token suits one trusted operator; multi-host login needs more work.
- The per-jam request cap is not a dollar/day budget; use provider-side spend limits.
- SSE caps at 200 viewers with bounded buffers; that is not a load-tested capacity guarantee.
- Browser sound/crowd waveforms are not a sample-perfect broadcast; a server mix could improve mobile/background playback.
- Existing source history has privacy findings. A clean frontend bundle does not make old Git commits publication-safe; curate a separate source snapshot before open sourcing.
