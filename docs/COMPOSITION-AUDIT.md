# Who composes what?

Historical audit, 2026-09-19, of the superseded template composer. The user rejected that approach later in the same session. The current sequential event composer is described in [ARCHITECTURE.md](ARCHITECTURE.md) and the dated decision log. The bootstrap context defect below is now fixed. Keep these old measurements as evidence of why the design changed. The current `audit:prompts` command instead allows 70 calls per opening and writes `artifacts/prompt-audit-events.json`.

## Rehearsal versus live

The inspected nursery session was in rehearsal with **zero Jev requests**. Rehearsal selects from three eight-degree motifs using a seed, then applies procedural variations. The prompt affects the seed but its meaning is not interpreted. Only the latest room was available; this inspection cannot establish the mode of an older pastor session. The user subsequently confirmed they had been running rehearsal and reported that Live Jev sounds better.

Live Jev makes real typed decision calls. It does not retrieve complete recorded jam loops: samples are individual instrument notes. However, the model's freedom is constrained by a substantial arrangement grammar.

| Musical decision | Live Jev | Application |
| --- | --- | --- |
| Opening | Chooses opener, one of six tempos, six tonics and four shared modes | Exposes that finite vocabulary and starts a shared clock |
| Pitch | Eight scale-degree anchors per musician decision | Maps anchors to MIDI/register, adds chord voices, bass/keys support and guitar double stops |
| Rhythm | One of twelve rhythm families, density and swing | Supplies the actual onset patterns and note lengths; thins notes |
| Drums | Gesture, density, dynamics and rhythmic family | Supplies kick/snare backbeat, ghosts and fills |
| Development | Chooses hold, vary, develop, solo, support, space, rest or resolve and motif operation | Retains/transforms the prior motif; some operations override fresh degree choices |
| Expression | Dynamics, articulation, patch and per-player effects | Converts them to sample playback, DSP, envelopes and expressive modulation |
| Ensemble | Commitment and tempo/harmony proposals | One changing musician per boundary; continuing parts retain notes; bounded tempo and shared-key negotiation |
| Ending | Votes to resolve as ending pressure rises | Enforces a final landing and ten-minute limit |

All players currently share one mode. A player cannot request an independent mode or an arbitrary list of note events. The eight anchors in a call are independent questions on the same state, not a sequence in which each choice sees the preceding new answer. The opening prompt is included in the early decisions; later calls emphasize the performed musical history, as requested in the founding brief.

Primary API documentation: [Choice](https://docs.typesafe.ai/primitives/choice) and [System One](https://docs.typesafe.ai/concepts/system-one). Typed choices can represent individual musical events; they do not require a catalog of complete licks.

## Two fresh live openings

`npm run audit:prompts` runs two isolated rooms, capped at nine provider requests each, and writes full traces and score frames to ignored `artifacts/prompt-audit.json`. It does not start or replace the browser's shared room and does not play audio. This is an explicit paid diagnostic, excluded from CI.

| Prompt | Opening | Calls | Provider-reported cost |
| --- | --- | --- | --- |
| the grieving pastor decides to burn it all down | 78 BPM, C minor, bass first | 9 | $0.001229382 |
| saturday after nursery rhymes | 88 BPM, C Dorian, bass first | 9 | $0.001224468 |

There were no fallback responses in this run. Guitar, keys and drums had identical opening note events across these two fresh sessions, despite their different starting tempos/modes; bass differed slightly. Guitar chose `[0,2,4,4,4,4,0,0]` in both, keys `[0,2,4,4,4,4,7,0]` in both. Those phrases did not use the sixth scale degree that distinguishes Dorian from natural minor. Guitar notes were C4, E-flat4, G4, G4 at beats 0, 1.25, 4.25 and 5.5. The result shows how model preferences plus the arrangement grammar can converge. It is not a replay of the user's earlier performances, a long-jam comparison, or a listening-quality benchmark.

## Known limitation and possible next contract

Inspection also found that the pre-sound listening context defaults to D Dorian even when bootstrap selected another tonic/mode. The actual rendered frame uses the bootstrap harmony, but the opener's context should carry that same seed. This is recorded for the next server revision; it was not changed during the user's active live jam.

For more compositional control, let Jev choose pitch/rest, onset or gap, duration, velocity and articulation for individual event slots, plus explicit tonal intent per player. Preserve its own earlier choices during phrase planning, while revealing only already-performed peer events. Let the validator enforce timing, range and hand limits rather than inventing most of the arrangement. Drums would choose actual hits/rests. This requires careful request-budget and latency design because questions within one Jev batch do not see one another's answers. It is a proposal, not implemented behavior.
