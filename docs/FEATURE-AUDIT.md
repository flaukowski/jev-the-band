# Product request audit

2026-09-20, v0.6 after v0.5 and Claude's visual PR #1. Scope: the founding prompt and all follow-ups visible in this development conversation, plus the recorded visual and CI requests. This is not a search of every external conversation. Product wording is in `ORIGINAL-PROMPT.md` and `PROMPT-LOG.md`; ambient browser and system/tool metadata are excluded. Historical decisions remain dated even when superseded.

**Most requested mechanisms are implemented.** Direct TypeSafe and the Railway deployment have now passed real verification. Generated audience recordings and privacy-safe source publication remain outstanding; the optional Luna director still needs a dedicated OpenRouter key in production. Tests cannot certify musical taste or realism.

| Request | Current implementation / evidence | Limits |
|---|---|---|
| Four individual musicians plus Lux | Independent persona contexts and memory in room/decision/composer code | Independent contexts, not separately trained models |
| Prompt-shaped music; varied opener | Luna concept/chapters, Jev opener choice and previous-opener memory | TypeSafe alone uses raw prompt unless OpenRouter also enables Luna |
| Actual notes instead of canned live licks | Sequential note, onset, duration, velocity, bend and chord decisions; trace provenance | Bounded vocabulary and attack counts; offline demo intentionally uses templates |
| Hear others rather than future plans | `server/listening.ts`, 180 ms performed-event delay, one new ordinary idea per boundary | Symbolic hearing, not audio perception; two-bar delivery boundaries |
| Groove, style branches, tension/release and variation | Style/texture palettes, score-based memory, bounded holds, release constraints | Taste still needs listening evaluation |
| 32nds, triplets, quintuplets, varied rhythm | Typed timing/durations and elected full-bar drum subdivisions | Bounded event counts |
| Independent 2–8 and at least 12-bar phrases | Per-player 2–12-bar commitments with fresh connected two-bar chunks | Not a single twelve-bar HTTP response |
| Real melodic guitar/keyboard solos, ~180-second opportunities | Dedicated solo planner, statement/development/resolution memory, fresh notes and invitation scheduler | Subject to time, budget and successful calls; no quality guarantee |
| Mood-dependent random 8–32-bar solos, overlapping leads | Jev probability sampling and independent solo commitments | Failed lead chunks rest instead of replaying old leads |
| Tempo push/pull, key/mode development | Bounded tempo, shared-tonic agreement/dwell, individual palettes/modes | No sudden clock jumps |
| Ending likelihood after five minutes; ten-minute maximum | Ending votes/pressure, room deadline and request cap | Budget/provider failures can end earlier |
| Guitar/key chords, split keyboard hands | Six-string guitar, individual key pitches/patches, sustained polyphony validation | Five held notes per hand; piano/Rhodes/organ/synth/pad/bell choices |
| June waiting forever and visible instruments | Audible entry/recovery tests plus LH/RH patch labels | Provider failures are disclosed rather than replaced with invented notes |
| Level, pan, mute, solo soundboard | Mixer, measured meters, local saved mix/reset; browser checks | Listening isolation differs from a musical lead |
| Independent effects; every bar's combinations | Timed Jev cues, separate buses, overrides, rig/audio tests | Seven switches for pitched players; three restrained Kit switches |
| Distortion level and drum identity/tails | RMS-matched drive, channel/master protection, Kit limits, natural cymbal release | Audio bounds verified; taste remains subjective |
| Better guitar/bass/keys/drums and bends | 162 pinned/hash-verified single-note samples, dynamics/articulations, pitch expression | Compact sample rig; remaining voices use synthesis |
| Global Jev engineer or manual control | Patch reads reference-browser levels, bounded trims/room/compression; master desk | One trusted reference browser, no distributed reference lease |
| Prompt/play at top; audio activation | Top controls; Play enables audio, spectator Listen gesture | Browser gesture requirement remains |
| Follow-up prompts transition in eight bars | Four-item queue, next boundary plus eight-bar lead-in, optional new concept | Existing room clock and budget continue |
| Banner, crowd, music-driven animations, camera controls | `src/stage/` festival, jointed players, note/rig animation, projection/particles, camera/lens controls | Claude PR #1 integrated; stylized, not motion capture |
| Dozens of lighting options to combine | 12 washes + 12 beam recipes + 8 laser recipes, intensity/motion controls | 32 recipe choices across three combinable layers, not 32 individual physical fixtures |
| Toggleable live request inspection | Under the hood, requests/results, hashes, raw/applied answers, provider/model exports | Application provenance, not independent provider attestation |
| Twelve playful enhancements | Twelve delivered additions enumerated in design log, followed by musical/visual revisions | Separately labeled brainstorm is not claimed as delivered |
| ~100 generated crowd clips, crossfade, mood and mix level | Bounded generator, reviewed bank loader, crossfades, Patch and manual controls | **No generated bank yet**; audio key/audition/rights review pending; explicit procedural fallback works |
| Full prompt/taste history | Founding prompt, visible follow-ups and dated decision log | Public edition requires privacy curation |
| GitHub checkpoint and visual merge worker | v0.5 pushed; PR #1 merged into main and incorporated locally | Actions disabled at user request; local validation remains available |
| Direct TypeSafe + OpenRouter; README and CONTRIBUTING | Provider adapter, mocked wire/room tests, real TypeSafe smoke/hosted audition, root guides | Verified; production Luna needs a separate OpenRouter key |
| Separate public-source investigation | Independent private mirror/history/assets/bundle/GitHub-surface audit | No credentials found; **existing history not privacy-safe to publish** |
| Host selection and deployment with new key | Railway Docker service deployed; HTTPS revision/assets, protected controls, shared audience and real TypeSafe music verified | Live; room state remains in memory |
| Backdrop visualizers with overlays, thousands-strong festival crowd, procedural weather, fretting-hand fix | Nine wall pictures plus overlay and eight skies chosen in Lux's existing call; shader crowd field on a bowl terrain; `weather.ts`; corrected left-hand pose | Viewer can override locally; no lightning (no-strobe rule); far crowd is impostor figures, not individuals |
| Song title in animated lettering on the screen | `song title` wall picture/overlay in Lux's existing call, plus a ten-second title card when a song or theme begins | System fonts only; the automatic card is application behavior, not a Jev decision |

## Remaining work

1. Optionally add a dedicated OpenRouter key to enable Luna in production. Direct TypeSafe deployment and the bounded real verification are complete.
2. Generate and audition a small crowd bank, verify redistribution rights, then expand toward 100 if useful. Generation stays private until approved promotion.
3. Approve a sanitized independent source snapshot for publication. Preserve the full original history privately; do not flip the current repository public or rewrite its history incidentally.
4. Continue varied-prompt and longer-session listening. Freshness and solo constraints improve behavior without guaranteeing compelling melodies.

Durable replay, MIDI/stem export, brush kits, arbitrary phrase boundaries, large-audience scaling and server-mixed audio remain roadmap possibilities. See `VERIFICATION.md` for dated evidence and limits.
