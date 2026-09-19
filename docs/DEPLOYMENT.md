# Deployment paths

No public deployment is performed by the founding implementation. The repository and local preview are the review surface. Use a separate production API key before publishing.

## 1. Open-source / self-hosted application

The app is an ordinary Node 22 service and a static Vite frontend. No proprietary hosting service is required. One process owns one shared room; all spectators subscribe to its SSE stream and synthesize the same timestamped score locally.

```sh
npm ci
npm run build
npm start
```

Use a reverse proxy with HTTPS and streaming enabled; disable SSE buffering. Configure:

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Dedicated server-side production key |
| `JEV_MODEL` | Version pin; initial default `typesafe/jev-1.13` |
| `HOST` | `0.0.0.0` for a container; local default is `127.0.0.1` |
| `PORT` | Service port; default 4310 |
| `CONTROLLER_TOKEN` | At least 24 characters for public binding; required on all POST actions |
| `STAGE_ORIGIN` | Exact HTTPS frontend origin, including scheme; set for public hosting |
| `MAX_JEV_REQUESTS` | Hard request ceiling per jam; maximum 1200 |

Enter the host token in the stage's host-access field. It is kept in page memory, never localStorage or an export. Spectators can join without this token; they cannot start or end performances. Read routes reveal the user-submitted prompt and recent musical decisions; do not enter confidential material in a public room.

The Dockerfile packages both server and client. It requires these runtime environment values. It does not copy `.env`, artifacts, or source credentials into an image. Do not put secrets in Docker build arguments.

## 2. Potential ChatGPT Site audience frontend

The intended split is a public Site showing the stage, backed by the same dedicated performance service. Build the static frontend with `VITE_API_BASE_URL=https://your-band-service.example` and set the service's `STAGE_ORIGIN` to the exact published Site origin. This variable contains only a public endpoint URL, never a key. SSE, WebGL, Web Audio, and user-gesture audio activation must be verified on the actual published host.

This is an integration design, **not an already-tested ChatGPT Site deployment**. At publication time, use the current Sites build/hosting workflow and test its iframe/content-security policy, external connections, autoplay policy, and visibility controls. The local repository is intentionally independent of a managed Sites starter. Do not assume a static site can own a persistent Node performance loop. If a supported platform worker/durable runtime replaces Node, it must preserve the single authoritative clock and per-jam request cap.

Publishing should first use a private review URL. A dedicated key, verified public controller protection, and spectator tests should precede a public URL. None of these hosting actions have been taken yet.

## Public-venue work still needed

- Durable session storage and full replay, plus restart/reconnect recovery. Current room state is in memory and disappears on service restart.
- A proper host login if more than one trusted operator will run the venue. A bearer token is sufficient only for this small prototype.
- An account-level spend/rate limit and host cooldown. The current request cap is per jam, not a dollar budget or a global daily quota.
- Load-test the target viewer count. The current server caps SSE viewers at 200, limits buffered writes, and provides no scale guarantee.
- A single elected room owner when running multiple replicas. Do not scale this Node process horizontally and assume its memory is shared.
- A full-session event store, object storage for recordings, and an optional server-mixed audio stream for robust background/mobile playback.
- Recheck the alpha Decisions API and pinned model before release. Do not automatically adopt a moving alias without replay comparisons.

## Credential handling

`.env`, artifacts, generated media, dependencies, and test output are ignored. The initial key import was explicitly authorized for this prototype and remains local. Application startup loads only its own environment. Public source code, frontend bundles, exported traces, and screenshots must contain no provider credentials. A dedicated production key can be scoped and revoked independently of Frix.
