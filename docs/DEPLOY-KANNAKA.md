# Deploying our own Jev, for Kannaka TV

Why a second instance exists at all, then the seven commands.

## Why not the public one

`https://jev-the-band-production.up.railway.app` is upstream's, it works, and its
`/api/archive` is readable without a key. Carrying it would have cost nothing.

**Do not carry it.** Read on 2026-09-21, its archive held nineteen ended jams and one of
them was titled with a repeated racial slur. Kannaka TV's Jev format uses a jam's title as
the on-air segment title and republishes it in `/api/now`, and picks a jam at random — so
roughly one segment in nineteen would put that on the channel, under Kannaka's name, in her
own public feed.

That is not a bug in their code. It follows from a documented decision: the room is open, so
anyone can start a jam and type anything into the title. The fix is not to ask them to close
it. The fix is that **a channel carries a room it controls**, which is this instance.

## What has to be true before it is worth deploying

| Need | Why |
|---|---|
| `RAILWAY_TOKEN` | non-interactive CLI; `railway login` wants a browser |
| A Jev provider key | without one the room is rehearsal-only: no live band, no jams, nothing to carry |
| `JEV_HOST_TOKEN` | generate a fresh one; without it the room is open and we are back where we started |

A rehearsal-only instance is not useless — the stage, the samples and the archive all work —
but it produces no new recordings, so the TV format would stay dark. The provider key is what
makes this worth paying for.

## Deploy

```sh
export RAILWAY_TOKEN=...                       # account or project token
cd jev-the-band
npx @railway/cli@latest init --name jev-kannaka
npx @railway/cli@latest link                   # if init did not link the service

# The room is hosted. Generate this, do not reuse anything.
npx @railway/cli@latest variables --set "JEV_HOST_TOKEN=$(openssl rand -base64 32)"

# Pin the provider explicitly rather than letting `auto` choose in production.
npx @railway/cli@latest variables --set "JEV_PROVIDER=openrouter" --set "OPENROUTER_API_KEY=..."

# The exact public origin, scheme included, once Railway has assigned the domain.
npx @railway/cli@latest variables --set "STAGE_ORIGIN=https://<assigned>.up.railway.app"

npx @railway/cli@latest up
```

`railway.json` already carries the rest: Dockerfile build, one replica, `/api/health` with a
120-second timeout, restart on failure up to three times. The image installs Chromium and
ffmpeg because the archive renderer runs a headless browser per recording — which is also
why this does not go on O1 beside the channel, and why debain2 needs disk freed first.

## Verify, in this order

```sh
curl -s $ORIGIN/api/health | jq '{hostedRoom, liveAvailable, archive}'
```

`hostedRoom` must be `true`. If it is `false` the gate is not configured and the room is open
to the internet — stop and fix that before anything else.

```sh
# The gate actually shuts:
curl -s -o /dev/null -w '%{http_code}\n' -X POST $ORIGIN/api/room \
  -H 'content-type: application/json' -d '{"title":"anyone","mode":"rehearsal"}'      # 401

# And opens for the host:
curl -s -o /dev/null -w '%{http_code}\n' -X POST $ORIGIN/api/room \
  -H "authorization: Bearer $JEV_HOST_TOKEN" -H 'content-type: application/json' \
  -d '{"title":"First hosted jam","mode":"live"}'                                      # 201

# Reads stay open, because a spectator was never the problem:
curl -s -o /dev/null -w '%{http_code}\n' $ORIGIN/api/archive                           # 200
```

Then run a jam to the end and wait for the archive worker to render it. Only once
`/api/archive/<id>/audio` returns audio is there anything for the channel to carry.

## Point the channel at it

In kannaka-tv: `TV_JEV_BASE=https://<assigned>.up.railway.app`. The source is cached for five
minutes and a dark source simply takes the format off air, so a wrong value degrades the
channel rather than breaking it — and a right value needs no restart beyond the variable.

## What this does not solve

The gate protects the title, not the taste. Whoever holds `JEV_HOST_TOKEN` can still write
anything, and it will still go out over the channel. The gate moves that decision to someone
accountable for it, which is all a gate can do. If the channel ever wants a second layer it
should filter on its own side rather than trust ours.
