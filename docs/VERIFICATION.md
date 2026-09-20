# Verification

## 2026-09-20 — v0.5 phrases, solos, director, sound engineer and audience

- **50 deterministic tests pass**, covering independent 12-bar sentences, six fresh chunks of a 12-bar solo, immutable raw Jev answers, June's audible entry, director schema/failure handling, bounded Patch trims, Kit's restricted rig, queued transitions, and solo invitations within about 180 seconds. A simulated live room runs through 205 seconds. Regression tests verify concurrent rig/note work and acceptance of timely music despite late lighting.
- TypeScript and the production build pass. Existing upstream Zod annotation and Three.js chunk-size advisories remain.
- Two real Luna briefs and two Jev opening choices succeeded. The grief/burning prompt produced A minor at 78 BPM; the nursery prompt produced G major at 96 BPM. Director-reported costs were $0.0025628 and $0.0020078. This small stochastic comparison does not prove semantic or artistic fidelity.
- Final bounded solo audit: **88 real Jev calls**, **$0.034340376**, **zero fallbacks**. Guitar and keys each chose eight bars, delivered as four distinct fresh chunks. Guitar had eight melody attacks per chunk; keys had 18/26/24/24 total notes including left-hand support. Final onsets reached beats 7.5–7.75. Longer 12-bar commitments and raw-answer preservation are tested deterministically. No human listening certification is claimed.
- The final paid built-site studio test passes: **248 Jev calls**, **$0.150724812** reported Jev cost, **four accepted Patch decisions**, audible June, actual browser RMS/peak inputs, and all four fresh Jev parts on the queued theme boundary. Patch chose listening ambience at -24 dB. **Zero page errors**; desktop and 390 px screenshots inspected. The retained eight-frame window contains one failed guitar composition, disclosed as a silent fallback; the next frame and queued transition recovered. The trace window contains ten unused partial-call responses and one request timeout, not eleven separate failed compositions.
- Earlier live browser attempts exposed insufficient runway and a round-wide deadline discard; one stopped advancing before a queue target, and a subsequent run reached the target with fallback parts. A standalone timing diagnostic advanced through ten frames and applied its queue, but also showed deadline failures. These attempts are not presented as successful auditions. Earlier scheduling, parallel rig decisions, and per-musician completion checks were followed by the successful full studio test above. Provider timeouts remain possible.
- Five free built-site browser scenarios pass: live/demo honesty, top prompt/Play, actual per-bar independent rigs, natural cymbal tails, pre-fader reference measurements despite listener mute, actual master compressor automation and manual override, saved audience mute/reactions/mood/level controls, two spectators, cameras, trace inspection, stop and mobile width. **Zero model calls, zero page errors**, rehearsal master peak **0.4352911**. Chromium was muted; no speaker listening audition occurred.
- Audience verification includes four deterministic tests and three standalone real Web Audio browser tests covering crossfades, reactions, mute/quiet fades, pending-cue cancellation, shared AudioContext ownership and rejection of unreviewed samples. The integrated desk's controls are also covered above. **No generated audience recordings or paid sound-generation calls** are claimed: playback currently uses the labeled procedural fallback. The offline adapter and 100-clip plan are implemented and documented in `AUDIENCE.md`.

Ignored evidence: `artifacts/director-audit.json`, `solo-audit.json`, `live-studio.json`, desktop/mobile screenshots, and diagnostic/Playwright outputs. Shared history remains bounded; this is not a full ten-minute paid session or a public deployment.

## Revision 0.3 — sequential live notes and gain-matched drive

- **29 deterministic tests pass**, plus TypeScript and production build. New checks preserve exact Jev event values and trace links, require each attack to see its predecessors, exclude automatic drum accompaniment, enforce sustained five-finger overlap, propagate bootstrap harmony, reject partial failed compositions and preserve raw answers during reproducible probability sampling.
- A **90-second bounded real-Jev run** produced **16 frames / 113 requests**, cost **$0.037536828**, zero fallbacks, all four musicians and a timed ending. Each musician made **four distinct phrase scores**: 21 newly composed guitar notes, 20 bass notes, 18 keyboard notes and 36 drum hits. Distinctness compares pitch, onset, duration, velocity, articulation, bend, hand and patch, excluding trace IDs. This run preceded the final model-selected register window; the subsequent two-prompt check exercised that window. The longest paid diagnostic is capped at 240 requests and is excluded from CI.
- Latest prompt openings: pastor **78 BPM / C minor**, 29 calls, **$0.005734218**, zero fallbacks; nursery **88 BPM / C Dorian**, 29 calls, **$0.005756394**, one **lighting request timeout**. All four musical parts were accepted Jev event compositions in both. Their actual notes differed, including bass `[36,34,38,40,41]` versus `[36,33,34,38,41]`, and guitar `[84,80,87,75,78]` versus `[81,86,87,83,79]`. This is one stochastic opening per prompt, not controlled proof of semantic mood or artistic quality. Full local evidence: ignored `artifacts/prompt-audit-events.json`.
- **18 OfflineAudioContext comparisons** of the actual drive processor, across a harmonic source and a recorded guitar note, three amplitudes and three drive amounts, measured **-1.30 to -0.40 dB RMS** versus clean. No positive loudness jump and no clipping in these fixtures. This does not certify every possible stacked effect combination.
- The built site passed the full muted browser flow on an isolated local server: all 162 recordings loaded, staggered entrances, two spectators, mixer solo/mute meters, independent pedal settings, camera controls, trace inspection, shared stop and mobile width. Master peak **0.55445**, **zero page errors**, zero model calls. Three additional mode/default UI scenarios passed. The separate drive browser test passed. Slow browser execution on this Windows host took 2.6 minutes for the four built-site scenarios.
- Original prompts and subsequent corrections are preserved verbatim. Current behavior and sampling details are in the architecture and decision logs. Historical failed composer experiments were used to identify flat parallel choices, silent keyboard count defaults and deadline pressure; they are not presented as successful musical auditions.

No listening-quality certification or public deployment is claimed. Note decisions now drive the live score; musical identity, phrasing and long-form interaction still benefit from listening feedback. Shared eight-beat boundaries and bounded attack counts remain explicit prototype limits.

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

## 2026-09-19 — v0.4 groove/polyphony/rig checkpoint

- `npm run check`: 34 tests pass, TypeScript and production build pass. New coverage includes six-string strums, retriggered held notes, full two-bar triplet drums, release constraints, pedal cue independence, and duplicate-key probability decoding.
- Four browser scenarios pass for live/demo honesty, prompt-before-stage placement, Play enabling audio, shared spectators, mixer isolation/overrides, camera controls, traces, stop, and mobile width. Zero page errors; actual rehearsal master peak 0.368, with Chromium physically muted.
- A fifth browser audio test passes: independent drive states change from guitar-only to keys-only at the second bar. The actual six-second crash buffer is scheduled for 6.12 seconds despite its 0.125-beat score gate. The initial assertion confused guitar and cymbal recordings of identical length; the corrected test identifies the normalized PCM fingerprint.
- Final bounded `audit:groove`: 18 real calls, zero fallbacks, reported cost $0.0047376. Guitar selected strummed chords and reached six simultaneous notes; keys selected two-hand chords and reached seven notes across the hands; drums selected 35 hits through beat 7.56. Distinct pedal combinations changed between bars for all three instruments. These are observations of one short score, not a general taste claim.
- An earlier integrated 90-second run made 117 calls with no fallbacks, but its freshness gate failed because bass returned an identical score four times while calling it vary. This exposed missing score-based repetition memory; the correction compares accepted note data and offers a new model-selected second-note answer after sustained identical composition.
- The subsequent integrated 90-second run passes: 114 calls, 16 frames, all four musicians, zero fallbacks, a closing phrase, and $0.058609152 reported cost. Distinct accepted phrases: guitar 2, bass 2, keys 3, drums 3 across four composition turns each. These are still short two-bar units; richer long-form development remains a listening target.

Ignored local evidence remains in `artifacts/groove-audit.json`, `artifacts/live-performance.json`, browser screenshots and Playwright outputs. None contain the server credential.
