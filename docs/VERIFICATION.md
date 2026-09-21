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

## 2026-09-20 — Psychedelic realism stage revision

Measured on one Windows laptop (Intel Arc 140V integrated GPU, ANGLE/D3D11, headless Chromium via Playwright, 1500 px wide stage). During these runs an unrelated dev server on the same machine kept total CPU at 100 %, so timings are pessimistic.

- `npm run check`: 21/21 unit tests pass; TypeScript and the production build pass. The lazy Stage chunk is about 694 kB minified (189 kB gzip); Vite's chunk-size advisory remains.
- Browser test `tests/browser/stage.spec.ts` passes against the new stage (1.4 min): shared rehearsal, staggered entrances 1-2-3-4, real audio peak below clipping, mixer solo/mute meters, per-player pedal overrides, camera presets, trace inspection, stop, 390 px mobile layout, zero page errors.
- That test is sensitive to machine load. Under the 100 % CPU condition above it failed intermittently on time budgets (sample loading over 30 s, total over 150 s) while every assertion it reached passed; the untouched original stage used 132 s of the same 150 s budget under the same load. Playwright trace screencasts of a constantly changing full-canvas scene were the largest avoidable cost, so trace screenshots are now off (actions, DOM snapshots and failure screenshots are kept).
- Frame cost after optimisation: about 1–2 ms of JavaScript per frame for all animation, IK, crowd and particles; 10–15 ms in renderer submission; roughly 640 draw calls including the shadow pass. 45–48 fps uncapped on this GPU. Before static-mesh merging and instancing the same scene was 1,458 meshes and 28 fps.
- When a frame costs the main thread more than about 9.5 ms the stage holds 30 fps, so audio scheduling keeps at least half of every second. It renders once per second while instruments decode, and resolution steps down if frames stay long.
- Start-up is sliced: the venue, each performer, the rig and the crowd build in separate tasks, then shaders compile asynchronously before the first frame. About 1.2–1.4 s of total build work, no single long block; the room connection opens first.
- Visually reviewed from captured frames: balcony, front row, in the crowd, overhead, stage wing, lighting desk, all four member cameras, and close-ups of fretting, picking, keys and sticks, across several washes, beam cues and laser recipes, idle and playing. Fixed during review: runaway feedback trails, beams and particles flooding a camera standing inside them, over-exposure from non-physical light falloff, blown-out drum heads and piano keys, hair hiding faces.
- Not verified: the software-WebGL tier on real software rendering, phones and Safari/Firefox, a live Jev jam (rehearsal only, no paid calls), a complete ten-minute run watched end to end, and photosensitivity beyond the design limits recorded in the decision log.

## 2026-09-20 — Visual PR #1 integrated with v0.5

Reviewed Claude's visual commit `bc8c20c0a9d65da0de29debad2b03cda5306d8b6` against remote `main` at `0e4483f3aa70ddb18969bfe437b35f6074002cdd` in a separate clone. Conflicts were resolved by retaining the v0.5 app behavior and documentation history, then adding the visual changes. Server/shared music, audio renderer, audience audio, mixer, master desk, concept card and original prompt are identical to the v0.5 baseline.

- `npm ci`: zero reported dependency vulnerabilities.
- `npm run check`: 54/54 unit tests, TypeScript and production build pass. Four additional regression checks cover performed bar-level stage effects, no invented next-chunk repeats, open-hi-hat animation, and reduced-motion signal suppression. Existing long-phrase/solo, causality, theme queue, director, Patch and audience tests pass.
- `TEST_BASE_URL=http://127.0.0.1:5192 npm run test:browser`: 9 passed, 1 explicit paid studio test skipped. Chromium was physically muted. Shared-stage test: all 162 samples ready, 1/2/3/4 staggered entrances, two viewers, zero model calls, zero page errors, measured master peak 0.4733 (below clipping), mixer isolation/overrides, traces, stop and 390-pixel layout pass. Audio tests preserve changing rigs, cymbal tails, audience fades and fallback labeling.
- Additional browser QA against the compiled site on isolated port 4322: all ten camera presets, all three lens modes, mutually exclusive Director/Follow controls, reduced-motion toggle, manual master/audience controls, stop and 390-pixel layout pass with zero page errors. Captured stage images were visually reviewed at balcony, guitar, keyboard and mobile views. The procedural audience label remains visible.
- GitHub Actions could not start its check job because the account's billing/spending limit blocked runners. The repository's same deterministic test/build command passed locally; remote CI is not claimed to have passed.

No paid API calls, public deployment, repository visibility change or computer restart were performed. The canonical checkout and its 5178/4310 servers were not touched. Vite's large-stage-chunk advisory remains. This review does not add a human listening evaluation, phone/Safari/Firefox coverage, a software-rendering hardware check or a ten-minute visual watch-through. Local logs and screenshots remain in the isolated task's ignored/scratch evidence paths.

## 2026-09-20 — v0.6 providers, documentation and publication preparation

- `npm run check`: 60 tests pass, TypeScript and Vite production build pass. Five provider checks cover both wire contracts, separate keys, explicit provider selection, no failover, and a direct-provider room with opening/notes/rigs/lights. These use mocked responses; no real TypeSafe authentication is claimed.
- Eight selected browser checks pass: three audience cases, drive-level measurements, three live/demo cases and isolated bar-level rigs/cymbal tails. Chromium was muted. This pass used fixture/read-only scenarios and did not start or stop the user's room. The merged stage's prior full shared-room check is recorded above.
- Audience publication regression passes: approved bytes only, private prompts/billing removed, stale public clips revoked, hash changes rejected before mutation, and an explicitly empty reviewed subset removes all public clips. The focused test and TypeScript check passed again after adding all-clip revocation.
- Original founding prompt is unchanged against the merged baseline. All visible follow-up requests, including provider/deployment and README/license requests, are recorded. The feature matrix separates implemented mechanisms from generated-media and deployment gaps.
- Existing MIT license retained, package/lock metadata declares MIT, and the container includes LICENSE. Sample attribution remains separate. GitHub Actions remains disabled, verified through repository settings.
- Docker asset packaging and upload/context exclusions are corrected. Local Docker engine is unavailable, so no container execution is claimed; a real remote build and HTTPS verification remain pending the dedicated key.
- Railway project/service/domain, exact origin and random server-only host token are prepared. No deployment or paid call was made in this pass. No repository visibility change or history rewrite occurred.

The independent privacy investigation's report is kept outside the repository. It found no credentials in its examined history/source/bundle and verified all 162 sample hashes, sources and licenses, but old commit and GitHub metadata still require publication curation. New commits use a noreply identity; this does not sanitize old history. Vite retains the large-stage-chunk advisory. Musical taste, phone/Safari/Firefox coverage, full ten-minute listening and capacity tests are not claimed.

## 2026-09-20 — Direct TypeSafe and first Railway release

- Dedicated key stored in the ignored dev environment and Railway secret store. Exact-value readback matched without printing the value. Dev backend health confirms TypeSafe, v0.6.0 and the existing optional local director; the completed dev jam was not interrupted.
- Five real TypeSafe smoke calls succeeded: 93 validated answers, 482–598 ms latency. All reported `source: jev`; dollar cost was absent and remains unknown.
- Initial hosted revision `736059746b7c2759d197102fd61780ec462422e7`, deployment `07739e0c-8bb7-4660-86d2-2d01c9c32499`, built successfully on Railway. HTTPS health reports v0.6.0, TypeSafe `jev-1.13.0`, protected host actions and the expected revision. The optional production Luna director is unconfigured.
- Actual served assets match local SHA-256: `index-CqujLkAD.css`, `index-SEJVvLI5.js`, and `Stage-BfqLQqXE.js`. Public manifest contains 162 recordings; representative guitar/bass/piano/drum bytes match their hashes. The browser loaded all 162.
- Anonymous POSTs to start/stop/queue/levels return 401; a foreign Origin returns 403. An authorized browser starts and stops the room. A second spectator joins the shared performance and makes zero POSTs.
- Hosted live audition: 98 attempts and 98 accepted Jev traces, zero fallbacks. Roles include the opener, all four musicians, Lux and Patch. Patch receives real browser meters. The four-player frame starts before the test ends. Real master peak 0.41466, below clipping; physical browser sound was muted. Desktop and 390px mobile views have zero page errors and no horizontal overflow. Screenshots were visually reviewed. The test jam is confirmed ended.
- Initial verification used a 480-attempt cap. Normal deployment configuration restores 6000; neither is a dollar budget. No generated crowd recordings or production OpenRouter key were added. No Git visibility change and no GitHub Actions enablement occurred.

Evidence is private under `artifacts/live-smoke.json`, `deployed-verification.json`, `deployed-room-ended.json`, and the Railway screenshots. This is a short mechanics check, not a full ten-minute listening evaluation. Subsequent documentation-only release retains identical application/asset code; final HTTPS revision and asset verification is recorded in private release evidence.

## 2026-09-20 — v0.7 wall pictures, festival field and weather

- `npm run check`: 62 unit tests pass, including Lux's three new typed choices, the overlay-equals-picture rule, backward-compatible lighting frames and the eight-frame sky dwell across a rehearsal; TypeScript and the production build succeed.
- Browser suite against an isolated second stack (ports 5188/4320): 9 passed, 1 skipped (the explicit paid audition). An intermediate build failed `performance.spec` and `stage.spec` on sample-load timeouts; the cause was a 26-second synchronous compile of a single all-pictures wall program. After splitting it into per-picture programs compiled asynchronously (about 2.5 s) the suite passes, and the first-frame main-thread stall matches the pre-change baseline (about 5–6 s on this machine; that pre-existing stall comes from the post chain and is not addressed here).
- Headless Chromium with the D3D11 GPU path: every picture alone and with overlays, all eight skies, both new cameras, and close-ups of both fretting hands were captured and inspected. Steady-state frame cost stayed at 4–11 ms on this machine, draw calls about 520–700, against about the same before. The software-GL tier (SwiftShader) was exercised through camera feed, trails, stream, rain, snow and the saucer with no shader errors.
- Not verified: a live paid Jev jam choosing these fields (rehearsal and mocked parsing only); Safari/Firefox rendering; phones; a human judgment of how Lux's choices feel over a whole performance.

## 2026-09-20 — v0.7 boredom, lead gestures and leadership

- `npm run check`: 73 unit tests pass, TypeScript and production build clean. New tests cover heat sampling and its limits, option fatigue without shared-table mutation, left-hand mass decoding, lead gesture expansion (legato run into a held bend, range turnaround, slides, June's comp), the advisory sketch, 22 modes, key leadership and follow cue, drummer tempo/feel, five dynamics, guitar gain stages, and a scheduler regression test that was confirmed to fail against the old rule ("bass composed 1 times").
- Explicit bounded paid runs through OpenRouter Decisions: two `audit:solos` runs (37 and 43 requests, $0.011 and $0.012, zero fallbacks) and two `smoke:performance` runs (212 requests/$0.155 at the 240 cap, then 502 requests/$0.495 over 170 s with `SMOKE_CALLS=650 SMOKE_SECONDS=170`, zero fallbacks in the retained traces). Median lead-gesture latency 304 ms.
- The direct TypeSafe key in the development environment returned **HTTP 402** on its first request, so these runs used OpenRouter. Production uses the same TypeSafe account and should be checked before the next public jam.
- Not verified: listening quality, browser playback of the new articulations and gain stages (rendering code is type-checked and built, not auditioned), the Luna sketch against the real provider, a full ten-minute run, and the hosted deployment. Nothing was deployed.

- Provider fallback: 75 unit tests pass. A mocked room whose TypeSafe endpoint returns 402 moves to OpenRouter after one refused request, uses the fallback's own key and model ID, keeps composing, and leaks no credential into room state. After the user renewed the TypeSafe balance, `smoke:live` returned 5 of 5 Jev answers in 505–629 ms; an earlier attempt the same minute had one 1.8 s timeout. The fallback has not been exercised against the real providers.

## 2026-09-20 — v0.7 music release on Railway

- Pull request #3 was merged into `main` as `da7ff580e3e72df1ea94cd2da4916639ef3e3a7f` after merging the visual release into it; only three append-only documents conflicted and both sides were kept. `npm run check` on the merged tree: 77 tests pass, production build clean.
- A live jam was playing in production when the release was ready. The upload waited until that room had ended, because a deployment restarts the container and ends the room.
- Railway deployment `29d17fab-1ea2-4877-956e-a54a1353fc2d` succeeded from a clean checkout of that commit. HTTPS health reports v0.7.0, that revision, TypeSafe `jev-1.13.0`, protected host actions and `directorAvailable: true`: the production OpenRouter key added the same day is present, which also gives the room its provider fallback and the solo arranger.
- The served JavaScript bundle contains the lead-gesture interface text. An anonymous POST to `/api/room` returns 401.
- Not verified on this release: a production jam, browser playback of the new articulations and gain stages, the Luna solo sketch and the provider fallback against the real providers. Health does not report whether a fallback is configured.

## 2026-09-20 — Queued songs end naturally and start fresh

- `npm run check`: 77 tests pass, build clean. The scheduler test now proves a wind-down of several frames, a silent frame in which nobody was cut by the harness, a new opening decision (different opener and tempo), one-player start with staggered entrances, and a first request for the new song that contains no frames, own memory or elapsed time from the old one.
- One explicit bounded live run, `npm run audit:transition` through direct TypeSafe (436 requests, no reported cost, no fallbacks shown in the frame log): a 70 BPM A minor blues was queued over at frame 6; wind-down began at frame 8, the keyboard resolved for three frames while the others had stopped, frame 11 was silent, and frame 12 began the new song at 118 BPM in D mixolydian with the keyboard alone, then guitar, bass and drums one per boundary. That run let three players stop on the very first closing frame; the first closing frame now requires a played landing from everyone, and that adjustment has unit coverage but no live run.
- Not verified: listening, browser playback across the tempo change, several queued songs in a row, and the hosted deployment.

- End jam: 78 tests pass. A mocked live room keeps playing after End jam, plays a landing, closes three to six frames later with every part silent by choice and no error; a second press and demo mode stop at once. No live or browser run of this control yet.
