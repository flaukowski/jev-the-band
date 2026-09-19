# Jev research — 2026-09-19

Primary documentation and source repositories were reviewed for this prototype. These are examples of feasible decision-loop architecture, not proof of musical quality or performance guarantees for this application.

| Source | What it demonstrates | Application here |
|---|---|---|
| [TypeSafe launch: Doom and Wikiracing](https://typesafe.ai/blog/introducing-system-one-models-and-jev) | The vendor describes a Doom agent acting on structured state at about 10 queries/second; Wikiracing selects among links. The article explicitly distinguishes structured state from images. Its latency/cost claims are vendor-reported. | Describe the music as structured state and supply bounded choices; keep the renderer independent of inference. |
| [lukaske/jev-doom-agent](https://github.com/lukaske/jev-doom-agent) | Browser-native Doom experiment with structured spatial state, composable controls, live telemetry, and a WASM game runtime. | A visible decision feed alongside an autonomous live visual experience. |
| [fhshaik/typesafe-mario](https://github.com/fhshaik/typesafe-mario) | Jev-driven Mario from structured emulator state. | Expose an instrument's meaningful controls instead of asking the model to drive a low-level audio device. |
| [RomanSlack/jev-drone](https://github.com/RomanSlack/jev-drone) | A simulation with Jev in a slower 2.5 Hz judgment loop and code handling the control system. Repository descriptions are author claims; we did not run the simulator. | Split slow musical intent from precise sound scheduling. |
| [TypeSafe System One concepts](https://docs.typesafe.ai/concepts/system-one) | Text/JSON state in; typed choices, scores, and probabilities out. No audio/image/video input or free-form reasoning output. | Peer score state stands in for hearing. Do not claim Jev generates sound or an inner monologue. |
| [Choice primitive](https://docs.typesafe.ai/primitives/choice) | Named choices, full distributions, distribution-derived confidence, independent batched questions. | One batch per persona includes role, rhythm, eight motif degrees, and other controls. Distinguish selected probability from confidence. |
| [Official quick start](https://docs.typesafe.ai/introduction/quickstart) | Direct TypeSafe client/API patterns. | A future direct-provider adapter can preserve the score and persona contracts. |
| [OpenRouter Jev Lab](https://openrouter.ai/labs/jev/compile) | A provider recipe uses `alpha.decisions.create` with `typesafe/jev-1.13` and typed questions. | Use the dedicated Decisions route, not chat completions. |

The [community index](https://github.com/kraayenjon/awesome-jev) helped locate source projects. It is a discovery aid, not an authority for provider guarantees. No project source code was copied into this repository.

## Local evidence

The existing Frix integration was inspected read-only to confirm the OpenRouter transport already in use. Only the explicitly authorized OpenRouter credential was imported into the ignored local `.env`; Frix code and settings were not modified.

The initial live smoke made exactly five calls. All validated successfully: guitar 19 answers / 393 ms; bass 19 / 398 ms; keys 17 / 420 ms; drums 7 / 492 ms; lights 5 / 390 ms. Total reported cost: **$0.000568426**. These are a small point-in-time sample, not an SLA or a forecast for full-band state. Ongoing snapshots are larger. Local request/response evidence is in ignored `artifacts/live-smoke.json`.

## Implications

Jev fits the decision layer. The central design challenge is the musical grammar and the feedback loop. Richer candidate choices can improve expression, but a bigger vocabulary alone does not ensure taste. Prefer measuring motif continuity, response to peers, excessive density, stalled repetition, and transition quality in recorded listening sessions. Keep the model pin and question-schema version in future durable recordings so experiments remain attributable.

## 2026-09-19 — Recorded instruments and expressive rigs

The user's listening feedback triggered a primary-source search for recorded guitar, bass and keyboards with licenses permitting redistribution in the future open-source repository.

| Source | Finding and decision |
|---|---|
| [Karoryfer free libraries](https://shop.karoryfer.com/pages/free-samples) | The publisher now identifies its free libraries as CC0 (except its unrelated voice-bank product). Chosen for direct guitar/bass sourcing. |
| [Black And Green Guitars](https://shop.karoryfer.com/pages/free-black-and-green-guitars) / [source](https://github.com/sfzinstruments/karoryfer.black-and-green-guitars) | Recorded hollowbody guitars with plucks, staccato and other articulations. Selected green plucks at two dynamics/two takes, plus staccato and hammer-on notes. Read SFZ pitch centers rather than guessing filenames. |
| [Black And Blue Basses](https://shop.karoryfer.com/pages/free-black-and-blue-basses) / [source](https://github.com/sfzinstruments/karoryfer.black-and-blue-basses) | Fingered hollowbody and picked solidbody bass recordings. Selected the darkblack fingered set for a warm pocket, with two dynamics/two takes. |
| [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) / [source credits](https://github.com/nbrosowsky/tonejs-instruments/blob/master/sample-source-info.txt) | Convenient edited recordings under CC BY 3.0. Used a small piano subset, credited to Versilian Studios and Nicholaus P. Brosowsky. Direct Karoryfer sources offer richer guitar articulations than this collection. |
| [Versilian Community Sample Library](https://versilian-studios.com/vcsl/) / [source](https://github.com/sgossner/VCSL) | Publisher permits software redistribution under CC0. Selected acoustic snare, hi-hat, tom and cymbal accents. [VCSL Keys](https://versilian-studios.com/vcsl-keys/) is a further piano expansion candidate, not bundled in full. |
| [Web Audio source detune](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/detune) / [filters](https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode) | Individual sampled voices can carry bend, slide and delayed vibrato; filters shape the amp body, cabinet and velocity envelope. |
| [Three.js OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) | Standard orbit, pan and zoom control; integrated with presets, drag-aware picking and optional solo follow. |

The chosen compact sampler is an engineering choice, not a listening-certified equivalence to a real player or a commercial guitar library. Full libraries offer many more velocity layers, release noises, fret/string choices and articulations. The app keeps explicit voice limits and short sample loading; later comparisons should use identical phrases and blind listening. Every bundled file's source commit, original/derived SHA-256 and license appears in the [sample manifest](../public/samples/manifest.json), with [credits and conversion details](../public/samples/CREDITS.md).
