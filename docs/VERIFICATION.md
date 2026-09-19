# Verification — 2026-09-19

## Passed

- TypeScript validation and production Vite build.
- Fifteen deterministic tests covering 2,880 compiled instrument/rhythm phrases, hand overlap, motif hold/transposition, independent solos, tempo bounds, key-change voting, ending pressure, malformed provider data, prompt retirement, staggered entrances, a simulated full ten-minute performance, silent fallback after a rest, HTTP failures, billed malformed responses, and stopping after three failed rounds.
- Full browser flow: start rehearsal, enable audio, join a second spectator, inspect and expand decisions, stop from the host, observe stop in the second viewer, and inspect a 390 px mobile layout.
- Silent audio validation through an analyser attached to the actual master output. Observed rehearsal peaks: approximately **0.202–0.211** across two runs, above silence and below digital clipping. Chromium was muted; no physical playback was requested or performed.
- Browser page errors: **0**. Both viewers shared a room with **0** model calls in rehearsal. Opening phrase counts were **1, 2, 3, 4** musicians.
- Five-persona live API smoke: **5** successful calls, **67** validated answers, **390–492 ms** latency, **$0.000568426** reported cost.
- Short integrated live performance: **20** calls, **5** phrases, all four musicians entered, **0** fallbacks, an ending phrase, **$0.003316404** reported cost. Every resulting note set passed the score validator.
- Dependencies reported no known vulnerabilities in the initial `npm install` audit.
- Source and production bundle scan found no occurrence of the actual local API key or an OpenRouter key pattern. The local `.env` is ignored by Git and excluded from Docker builds.

## Bugs found and resolved during the pass

1. A sustain-style keyboard solo could overlap more than five right-hand notes. Notes are now shortened before the next attack and overlap is validated across all generated phrases.
2. Treating an SSE write's normal backpressure signal as a disconnected viewer could force reconnects. A bounded buffer limit now handles slow viewers; state updates avoid retransmitting the entire trace history.
3. The ended-session clock kept advancing. The server now records `endedAt`, and the audience displays the final time.
4. Ending a jam could leave effect tails audible. The master fades out and scheduled voices are stopped; a later jam restores the listener's chosen level.
5. Repeat counting based only on the word “hold” missed an unchanged motif labeled “vary.” Repeat counting now compares the actual motif controls.
6. Holding a prior rest could reconstruct notes after a provider failure. A held rest now remains silent, and a regression test covers consecutive failed rounds.

## Evidence and limits

Ignored local files under `artifacts/` contain the exact live smoke traces, integrated performance frames, and browser screenshots. These are deliberately outside source control. The browser scenario is reproducible with `npm run test:browser` while the development server is running.

These checks establish technical behavior. They do not certify musical taste, acoustic realism, long-run Jev quality, large audience capacity, independent provider attestation, or a deployed ChatGPT Site. The live sample is short; the ten-minute test uses deterministic rehearsal and a simulated clock. No public deployment has been performed.
