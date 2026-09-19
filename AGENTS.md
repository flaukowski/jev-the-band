# JEV the band: working agreements

- Read `docs/ORIGINAL-PROMPT.md`, `docs/DESIGN-DECISIONS.md`, and `docs/ARCHITECTURE.md` before changing product behavior.
- Preserve the original prompt verbatim. Append dated user requests to `docs/PROMPT-LOG.md`; record taste, style, and architecture decisions in the decision log, distinguishing user requirements from implementation assumptions.
- Jev uses a decisions endpoint, not chat completions. Never label deterministic rehearsal decisions or fallback repeats as Jev decisions. Never invent model reasoning.
- Keep credentials server-side and out of fixtures, screenshots, logs, bundles, commits, and exported traces. Never import another project's environment automatically.
- The audio clock owns timing. No HTTP call may schedule individual notes in real time. Validate phrases before accepting them. Enforce keyboard hand limits across sustained-note overlap.
- Audience clients subscribe to a shared performance; they do not each create model calls. Public hosting requires protected controller actions, a dedicated API key, bounded sessions, and request caps.
- Run `npm run check` and relevant browser verification before handoff. Live paid smoke tests are explicit, bounded commands, never part of CI.
- Do not deploy or make a repository public unless requested. The current brief expresses future intent to publish.

## Computer safety
Never reboot, restart, shut down, sign out, power-cycle, or launch an operation that might automatically reboot without a fresh user message containing `I confirm restart`.
