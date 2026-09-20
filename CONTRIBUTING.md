# Contributing

Use Node.js 22+, run `npm ci`, copy `.env.example` to `.env`, then `npm run dev`. The offline instrument demo needs no provider account. Keep real credentials in the ignored environment or hosting secret store.

Read the [architecture](docs/ARCHITECTURE.md), [musical design](docs/MUSICAL-ARCHITECTURE.md) and [feature audit](docs/FEATURE-AUDIT.md) before changing composition behavior. Keep changes small and explain the user-visible result, tests, and remaining limitations in the pull request.

## Musical and technical contracts

- Jev's typed decisions choose live note events. Do not disguise templates, fallback repeats or another model's output as Jev composition. Preserve raw and applied answers separately.
- Musicians hear only performed peer events, with reaction delay. Future peer plans must not leak into prompts. The audio clock schedules validated phrases; HTTP latency never schedules individual notes.
- Preserve polyphony limits, natural drum tails, instrument-specific effects, level protection and listener overrides. A SOLO label must correspond to dedicated newly composed lead material.
- Viewers share a performance; adding a viewer must not add model calls. Keep request caps, deadlines, cancellation, protected host routes and truthful failure labels.
- Record user requests in `docs/PROMPT-LOG.md` and implementation/taste decisions in `docs/DESIGN-DECISIONS.md`. Preserve historical entries, identifying which newer behavior supersedes them.

## Validation

Run `npm run check` for deterministic tests, TypeScript and a production build. Format touched files with Prettier. Run relevant `npm run test:browser` checks against an **isolated** dev room: some tests start and stop performances. Set `STAGE_PORT`, `STAGE_API`, server `PORT`/`STAGE_ORIGIN`, and `TEST_BASE_URL` to matching isolated ports. Chromium is physically muted. GitHub Actions is currently disabled; do not assume remote checks have run.

Paid diagnostics require deliberately configured credentials and are never part of ordinary tests:

| Command | Maximum work |
|---|---|
| `npm run smoke:live` | 5 Jev plan calls |
| `npm run smoke:performance` | 240 calls / 90 seconds |
| `npm run audit:prompts` | Two openings, 70 calls each |
| `npm run audit:groove` | 28 calls |
| `npm run audit:solos` | 120 calls |
| `npm run audit:director` | Two LLM concepts and two Jev openings |

These scripts use the selected Jev provider. The director uses OpenRouter separately. Tests report actual provider usage when available; unknown dollar cost must remain unknown. Mechanical checks do not replace listening to continuity, phrasing, space and dynamics.

## Assets and privacy

Preserve `public/samples/CREDITS.md`, licenses and pinned hashes. New recordings need clear redistribution rights. Audience generation is a dry run unless `--execute` and a credit bound are provided. It writes privately to `artifacts/audience-bank`; only reviewed clips may be promoted with `npm run promote:audience -- --public-license "..."`.

Run `npx tsx scripts/check-secrets.ts` after building. It checks tracked files and the bundle against known local secrets; it is not a full history/privacy audit. Never include keys, account details, private prompts or host tokens in screenshots, issues, traces, commits or PRs. Review Git author identity before committing; use an appropriate public/noreply address. Report suspected credentials privately to the maintainer without reproducing the value in an issue.

Source code is MIT; each recording retains its own license. See the README and asset credits.
