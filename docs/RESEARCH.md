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
