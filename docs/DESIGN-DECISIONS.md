# Taste, style, and design decisions

This is the durable decision log. Preserve dated entries. Mark changes as superseding previous decisions instead of silently rewriting history. User requirements remain in the verbatim prompt; implementation choices below are proposals embodied in the prototype, not claims of explicit user approval.

## 2026-09-19 — Founding design

**User requirements:** an improvising jam band inspired by the interaction of a band such as Phish; four Jev musician personas plus a lighting persona; declarative notes and rhythms; response to peers; gentle tempo push/pull; modulation; overlapping solos; effects; split keyboard hands with five simultaneous notes each; organic endings after five minutes and a ten-minute cap; a high-angle virtual stage with a banner and crowd; visible real API activity; future public ChatGPT Site and open-source repo; complete prompt and subsequent decision history.

### Musical identity — implementation choices

The initial sound is modal, groove-centered, warm, and exploratory. Musical space has equal status with density. Repetition establishes identity; change should be audible as a response to another player. We use original personas rather than representations of actual band members.

| Name | Character | Product behavior |
|---|---|---|
| Rook | Patient explorer | Develop a memorable phrase; leave space; exchange calls with June |
| Moss | Grounded instigator | Align with Kit; lead through bass movement and anticipations |
| June | Harmonic cartographer | Change timbre and register before piling on more notes |
| Kit | Elastic timekeeper | Maintain orientation while shaping density and momentum |
| Lux | Visual listener | Treat darkness as a color; use contrast over constant maximal brightness |

The first vocabulary supports Dorian, Mixolydian, minor, and major; a single modal tonic per phrase; fourth/fifth modulations. These are prototype boundaries, not the intended final extent of the musical language. Meter starts at 4/4. Polymeter, chromatic approach notes, articulated guitar techniques, and independent harmonic progressions come later.

### Interaction — implementation choices

One title or a long prompt starts a performance. Moss makes the bootstrap decision about the first player, tempo, key, and mode. The chosen opener plays alone, then one more musician enters each two-bar phrase. Every ongoing musician gets the same previous committed score snapshot, plus their own persona and recent changes. The original prompt is removed from ongoing decision context after four phrases. This prevents the seed from becoming a permanent script.

Each phrase is a small contract: the model chooses, code validates, then the clock plays. A choice can preserve a motif, vary/develop it, solo, return to support, leave space, rest, or resolve. There is no exclusive solo lock. Graceful limits shape the performance: small shared tempo movement; agreement for key changes; per-hand voice bounds; a request ceiling; and a deterministic final landing near the ten-minute deadline.

### Visual identity — implementation choices

**Visual thesis:** an intimate psychedelic venue viewed like a high-angle concert recording, wrapped in a restrained gig-poster interface.

- Charcoal and forest-black stage, acid-lime identity, warm cream type. Persona accents are copper, lime, lavender, aqua, and pale gold.
- Condensed display lettering evokes a concert poster; mono labels mark timing and technical provenance; a plain sans serif carries readable controls.
- The JEV THE BAND banner lives inside the 3D scene. The crowd, instruments, monitors, truss, and keyboard stack establish a venue rather than a floating dashboard.
- Low-poly geometry is an intentional prototype aesthetic. The next art pass can add richer instrument models and character articulation without changing the musical contract.
- Player animation follows tempo and performance activity. It makes no additional model calls. The lighting artist gets its own independent decision call.
- Motion is smooth; no strobe preset. Respect reduced-motion settings and expose a manual less-movement control. The display offers no guarantee about arbitrary future lighting extensions.
- The stage is primary. Technical evidence lives in an optional panel and per-persona selection. Nobody must read JSON to enjoy a jam.

### Audio production — implementation choices

Web Audio synthesis keeps the repository portable and avoids distributing large or uncertain-license sample packs. The electric guitar uses Karplus–Strong synthesis, bass and keyboards use harmonic oscillator voices, and drums use shaped oscillators/noise. Piano, Rhodes, organ, analog, pad, and bell are synthesis approximations. This is not yet sample-library realism; that is a clearly identified next milestone.

Every sound starts from note events. Drive, auto-wah, delay, and convolution reverb are real signal processing. Headroom and a compressor protect the mix. Audio starts only after a listener enables it. Muting affects only that listener, not the band.

### Honesty and portability — implementation choices

“All Jev” means each live persona's musical choices are requested from Jev. The harness still defines possible gestures, compiles voicings and drum patterns, coordinates time/harmony, provides a safety ending, and renders sound. We do not imply Jev hears audio, outputs waveforms, writes arbitrary melodies as prose, or generates reasoning text. Rehearsal is explicitly procedural. Errors are explicitly labeled fallback; no hidden switch to another model.

The repository starts private/local for review. MIT is the initial source license. Public release and hosting are future actions. A public shared room should use a dedicated key and host-controlled start/stop actions; audience subscriptions are read-only.

## 2026-09-19 — Listening band and recorded-instrument revision

**User requirements:** independent listening without advance knowledge, one new theme at a time, melodic solos, 32nds/tuplets, a soundboard, separate player effects rigs, researched realistic guitar/bass/keys, expressive animation and camera controls. Exact requests are in the prompt log.

**Supersedes founding interaction and synthesis-only choices.** The shared clock stays, but only one musician can revise a phrase per boundary. An oldest-due queue respects independently chosen commitments (brief 3, settle 4, patient 6 phrases, plus deterministic 0–1 phrase jitter). Opening entrances still take turns. Continuing players retain the exact previous notes, not a fresh random recompilation. A negotiated key change transposes everyone; a final landing is an explicit coordinated exception.

Peer context contains only note onsets already performed, with 180 ms reaction delay. A sounding note exposes elapsed duration, not its planned endpoint. Future frames and unplayed notes are excluded. Private effect choices, motif plans and intentions are excluded from peer context. Each player may remember its own plan. This is symbolic hearing, not audio perception. The schedule is still quantized to two-bar boundaries; independent arbitrary-time phrase boundaries are a future improvement.

Solos preserve motifs across vary/develop until an explicit support/space/rest/resolve. The grammar offers answer, inversion, sequence, fragment, repeat and a deliberate new theme. Leads use mixed durations, breaths, target notes and brief stepwise runs. Guitar support uses lower double stops; accompaniment yields mix space automatically without overwriting listener faders. Two soloists remain possible. These constraints improve the vocabulary; they do not guarantee great melodies from every model choice.

Each instrument already had a separate v1 effect bus, but simultaneous decisions made changes sound global and the controls concealed that separation. Every player now has a visible independent pedalboard: distortion, auto-wah, note-triggered velocity envelope filter, chorus, tremolo, delay, and reverb. Manual overrides apply only to the listener, with JEV/ON/OFF per pedal. Tone and distortion amount are local controls. Effects and faders do not alter or falsify Jev traces.

Recorded guitar and bass replace the primary oscillator/string voices. Selected Karoryfer CC0 recordings include two dynamics and alternate takes; guitar also includes staccato and hammer-ons. SFZ pitch centers are authoritative because the guitar filenames use a different octave convention from MIDI scientific notation. Piano comes from the attributed tonejs-instruments collection; drum accents use CC0 VCSL recordings. The 162-file browser edition is about 11.3 MB compressed; decoded audio consumes more memory. Sources, changes and per-file hashes are bundled. Rhodes/organ/synth/pad/bell, kick and mid tom remain synthesized. Missing samples are disclosed and fall back to synthesis. Browser bends/slides/vibrato and cabinet/body shaping add expression; this is a compact sampler, not a full commercial guitar model.

The soundboard distinguishes **SOLO** (listener isolation) from **LEAD** (musical solo). Multiple isolated channels are allowed; mute takes precedence. Faders run -48 to +6 dB, pan is stereo, and meters read the real post-fader signal. Local storage retains only listening settings. Reset mix restores all channels and Jev effect control.

The existing gig-poster and low-poly venue remain. Orbit/zoom, front-row/balcony/overhead/member cameras, reset, and optional solo following are added. Manual orbit cancels follow. Picking ignores drags. Musical timestamps drive strums, drumstick attacks, keyboard depression and body impulses; animation never creates model calls. Reduced motion freezes performance animation but permits deliberate camera navigation. Motion remains stylized, not anatomical motion capture.

### Twelve additions delivered in this revision

1. Four-channel level, mute and listening-solo soundboard.
2. Stereo placement, real meters, saved mixes and one-click reset.
3. Separate visible seven-pedal rigs with local overrides.
4. Recorded guitar plucks with two dynamics and alternating takes.
5. Recorded staccato/hammer-ons plus pitch bends, slides and delayed vibrato.
6. Recorded fingered bass, piano and acoustic drum accents.
7. Amp body/cabinet tone controls and velocity-sensitive envelope filters.
8. Causal symbolic hearing with private player memory and independent commitments.
9. Motif answers, inversions, fragments and stepwise sequences.
10. 32nd runs, triplets, quintuplets, sextuplets, broken rhythms and swing.
11. Free camera, seven preset views, zoom/reset and optional solo following.
12. Note-synchronized stage action, piano-key feedback and accompaniment ducking around leads.

### Further possibilities, not implemented

Phrase trading with explicit call/response invitations; durable set recordings and replay; MIDI/stem/WAV export; audience setlists between jams; musical callbacks to an earlier motif; temporary odd-meter episodes; chromatic approach-note vocabulary; bass slides with sampled release noise; drum brush/mallet kit changes; multiple guitar pickup/amp identities; lighting scenes tied to musical chapters; a hosted spectator stream with one server-rendered mix.

## 2026-09-19 — Clear live/demo distinction

**User finding and clarification:** two apparently similar prompt results were heard in rehearsal. The user then switched to Live Jev and reported that it sounds better. Preserve that correction; do not treat rehearsal output as evidence that Jev ignored their prompts.

**Implementation correction:** select Live Jev by default after the server confirms an available key. Otherwise select the instrument demo. Preserve an explicit mode selection across health refreshes. Disable start until availability is known. Rehearsal is now labeled **Demo · no AI**, displays zero Jev requests and says its title is not interpreted musically. A running shared room always displays its actual mode, independent of the next-jam selector. The live request counter and expandable composition explanation make provenance inspectable. Removed the unsubstantiated “no two jams alike” claim.

The bounded [composition audit](COMPOSITION-AUDIT.md) separates live model choices from arrangement rules and records a small real-call comparison. That comparison reveals limitations, not a general verdict on live musical quality. Following the user's clarification, this revision does not rewrite the composer or interrupt their active live room. More independent event-level composition remains a possible next musical iteration.

## 2026-09-19 — Actual event composition replaces the live template compiler

**User correction supersedes the preceding scope decision:** live template selection was not the intended product. Jev must compose actual phrases; an endlessly repeating groove is unacceptable. The user also requests a more even level when distortion engages.

**Implemented contract:** `server/composer.ts` asks Jev for a phrase plan, including its own tonal center, mode, register, entry, attack count, foreground/support role and effects. It then makes sequential attack decisions. Every attack sees its own earlier accepted notes and a freshly time-filtered view of already-played peers. Jev selects pitches, rest/play, spacing, duration, strength and articulation; guitar also gets bend amount. Keyboard hands choose counts and actual pitches; drums choose actual primary/additional hits. No live call to the rehearsal rhythm/voicing/drum compiler remains. Shared harmony changes are future context, not automatic transposition of already chosen live notes.

**Creative sampling is an explicit implementation choice:** creative event fields use seeded sampling from Jev's probability distribution (temperature 0.7, top probability mass 0.85; choices with probability at least 0.85 remain greedy). Musical intention, silence and hand counts retain provider choices. This makes plausible alternatives available without uniform random notes or premade licks. Raw provider answers are never overwritten. `appliedAnswers` and `selectionMethod` disclose the applied choices, and every accepted note records its trace ID and voice field. The UI and exports display this distinction. Jev supplies the preferences; the application performs the probability draw.

One musician updates at each two-bar boundary, in a fair rotation after staggered entrances. Others retain their existing phrases while listening; they are not told any peer's future notes or plans. This remains a shared phrase clock, not arbitrary independent phrase boundaries. Holding is explicit and becomes unavailable after two unchanged frames. Phrase plans offer 4/6/8/10/12 attacks (keys at most 8, with up to ten individually selected notes per attack). 32nd, triplet, quintuplet and sextuplet intervals are available; a long uninterrupted 64-note run is outside this bounded prototype. Jev selects the timing, not a rhythm family. Range, phrase length, duplicate attack and five-finger constraints validate events; invalid events are omitted and disclosed, never replaced with invented notes. A failed composition is atomic: repeat the prior accepted part with fallback provenance, or remain silent if none exists.

The opener now receives the actual bootstrap tonic/mode. Startup allows seven seconds for composition; subsequent work begins after 700 ms of the preceding phrase has sounded, with up to six seconds of lookahead. Calls remain outside the audio clock. The default request cap is 2,000; configured lower caps still apply. The server retains a ten-minute limit and increasing ending pressure but no longer fabricates a final tonic phrase for live players.

**Gain behavior:** replace the old boosted parallel waveshaper with an independent RMS-matched AudioWorklet per player. Distortion tracks that player's clean signal, targets slightly below its RMS level, handles initial transients conservatively and never adds automatic makeup gain. A soft-knee 3:1 compressor follows each player's effects bus; master protection remains. Enabling a pedal therefore changes tone without the former several-fold input-gain boost spilling into the mix. The drive amount still changes saturation. Listening solo and faders remain independent of the band's composition.

Technical verification is recorded separately. Fresh notes and bounded levels do not establish musical taste; continued listening should guide phrasing, contour and density rather than reinstalling preset accompaniment.

## 2026-09-19 — Groove, polyphony, release and expressive rigs (v0.4)

**User requirements:** add chordal guitar/keyboard modes, fix cut-off drums, develop stylistic branches and satisfying groove/release, preserve earlier features and rethink the architecture. Make heavy musical use of independent effect combinations. Move prompt/Play above the stage and remove the redundant sound-enabling step.

**Diagnosis:** guitar was monophonic per attack. Keys already accepted polyphony, but parallel voice decisions could collapse onto the same pitch. The melodic attack budget also applied to drums, and the audio renderer gated cymbal recordings by short note lengths. Effects were still wired correctly; their role and current choices needed clearer direction and visibility.

**Implementation choices:** separate musical direction, instrument composition, and clock/rendering; see [Musical architecture](MUSICAL-ARCHITECTURE.md). Add eight descriptive styles and persistent own-player arc/motif memory. After two build/peak updates, require settle/release/space. Chord modes use model-selected chord-tone palettes; release endings target chord tones. Keep useful rhythmic anchors and permit three deliberate holds. These restrictions supersede the preceding global-frame hold rule and novelty-heavy prompt. They guide taste but cannot guarantee it.

Guitar chooses single-line/double-stop/chordal textures, exact string pitches and strum timing. Keys explicitly choose comping, stabs, sustained chords or split comp/lead, with five held notes per hand. Probability decoding without replacement prevents several voices from selecting the same key; raw and applied answers remain distinct. A re-struck string/key releases its earlier held voice. Drums now choose actual hits/rests across two full bars on their elected subdivision, with no automatic backbeat. Recorded percussion rings naturally, and closed hats choke open hats.

**Effects architecture:** first choose each bar's sonic intention, then let a separate Jev call choose every pedal after seeing that intention. The first audit of a single-stage, strongly pro-effects prompt selected all seven pedals across every instrument. Separating intention from switch decisions produced instrument-specific combinations and bar-to-bar changes. No canned rig mapping or forced pedal count was introduced. Every combination remains possible; listener overrides still win. Each rig cue has provenance and a beat timestamp, and peers hear only already-performed cue states.

**Interface:** keep the existing venue/gig-poster style. Prompt and Play are above the stage; Play loads instruments and enables audio. Joining an existing performance has a Listen control, and enabled audio has Mute. The desk shows current Jev switch states and override markers. Preserve the stage, cameras, crowd, lighting persona, mixer and trace console.

**Boundaries:** this remains a two-bar phrase clock with one updating musician at a time. Continued parts repeat their accepted notes and pedal timeline until their next turn. Simultaneous keyboard voices share attack timing; independent left/right polyrhythms and long-term motif callbacks are future work. No public deployment or repository visibility change is part of this revision.
