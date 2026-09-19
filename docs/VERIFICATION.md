# Verification — 2026-09-19

## Revision 0.2 — independent listening, recorded instruments and sound desk

- **21 deterministic tests pass**, including exact peer-note retention across independently scheduled changes; exclusion of future notes, private peer plans and future note durations; 32nd/tuplet spacing; solo motif continuity; mixer mute/solo precedence; independent effect overrides; all 162 sample hashes/licenses; and the simulated ten-minute ending.
- TypeScript and production build pass. Vite still reports its Three.js chunk-size advisory and upstream Zod annotation warnings.
- **162 recorded samples**, **11,293,066 compressed bytes**, all with upstream commit pins and original/derived SHA-256. An isolated muted-browser audio probe decoded the whole bank in approximately **2.67 seconds** on this machine; this is not a network/device performance guarantee.
- Full rendered-browser scenario passed in **35.9 seconds**: samples ready, one-to-four entrances, two spectators sharing a rehearsal, post-fader solo/mute measurements, independent guitar/bass effect settings, camera preset/zoom/reset, trace inspection, shared stop and mobile width. **0 page errors**, **0 rehearsal API calls**, master peak **0.34294** (below clipping). No audible playback through speakers.
- A short integrated real-Jev run produced **5 frames / 11 calls**, all four players, **0 fallbacks**, a final landing, and **$0.002092062** reported cost. This is a small live sample; it does not validate a full ten-minute model performance or musical taste.
- Desktop and 390 px mobile screenshots inspected. The camera/caption overlap discovered in the mobile review was corrected.
- Chromium's default Windows SwiftShader path caused severe CPU contention and test stalls. Verification now explicitly uses Windows D3D11; the app also caps software rendering at 10 fps, normal rendering at 30 fps, and reduces scene rendering during sample loading. This does not establish smooth playback on every software-rendered machine.
- Final idle-stage review found Vite had cached an empty Stage module during a formatter's transient file write. The development watcher now waits 200 ms for writes to settle. Reopened preview renders the stage; caption spacing, mobile overflow and front camera were rechecked after recovery. This is a development-server fix; the production build was unaffected.

The original pass below is preserved as historical evidence. Guitar/bass/piano/drum realism now comes from recordings; some voices remain synthesized. No human listening certification or public deployment is claimed.

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
