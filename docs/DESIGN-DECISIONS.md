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

## 2026-09-19 — Sonic concept, Patch and reliable June entrances (v0.5)

**User requirements:** give Jev concrete prompt-derived material and a loosely coordinated developing composition; investigate Moss always opening. Add a Jev global sound engineer with relative channel level awareness, master ambience/compression and a manual alternative. Make each rig suitable to its instrument, especially Kit. Fix June remaining at “Waiting for a spark.” Preserve the authorized work in GitHub.

**Sonic director:** a separately labeled, one-time structured LLM call produces a specific concept, suggested opener/harmony/tempo and four to six chronological chapters with role-specific direction. Default `openai/gpt-4.1-mini` is configurable; disabling or failing it leaves Jev composing from the raw prompt. This is the requested planning layer, not a replacement for Jev's actual performance decisions. No fixed notes or complete licks come from it. Its request, result and cost are inspectable separately. Chapters invite staggered development through the existing fair scheduler, while the musicians still hear only performed peers. The last chapter persists; chapter times are guidance, not a timed score or guaranteed ending. A future long-form director revision may extend or revisit chapters.

**Opener diagnosis:** the opening request previously used Moss's bass persona. It now uses a neutral host, sees the director's suggestion and the last four openers, and offers every instrument. The demo also starts from a seed-selected instrument. Recent history is contextual guidance, not forced rotation or a guarantee against repeats.

**June diagnosis and contract:** successful choices could still form an entirely silent keyboard phrase; the UI also used a generic waiting label for empty notes. June's first turn now excludes rest/hold, requires a sounded first attack and at least one right-hand voice. After two silent own updates she receives the same entry constraint. The actual pitch, duration, rhythm and patch remain Jev decisions with provenance; remaining attacks can rest normally. Failed calls remain disclosed fallback, not fabricated notes. The UI distinguishes taking a breath, listening with no notes and retrying an entry. This fixes the identified silence pathway; network failures can still prevent a phrase.

**Patch architecture:** a sixth Jev persona reads actual pre-fader channel RMS/peaks from a reference browser, plus performed context and the prior mix. Every other phrase round with fresh measurements may adjust channel trims by -1/0/+1 dB, within ±6 dB total, and choose global reverb/threshold/ratio. Silent and hot channels cannot be inappropriately boosted. Bounded gradual moves preserve groove dynamics; this is mix guidance, not loudness normalization to identical channels. A parallel room return and gentle compressor precede master protection. All mix decisions carry trace/measurement provenance. No audio is uploaded. There is no extra model loop per audience member.

**Manual and reference behavior:** the local master desk can replace Jev's master settings and bypass all of its trims; ordinary channel faders still work. Manual changes cancel pending master automation. Starting a room selects that browser locally as the reference, with an explicit host button after a rejoin. Reference measurements exclude local mute/solo/faders/master but include local pedal colors. No fresh meters for ten seconds means no new Patch request and the prior mix remains. A server-enforced reference lease is future work; use one reference browser.

**Custom rigs supersede unrestricted Kit combinations:** guitar keeps the richest drive/modulation; bass has lower wet/feedback/modulation depth; keys have moderate drive and wide shimmer. Kit now has only restrained saturation, delay and room reverb, with instrument-specific sonic intentions. Wah, envelope filtering, chorus and tremolo are unavailable in its Jev choices and UI, and forcibly masked in the renderer even for old saved overrides. Seven-switch combinations remain available for guitar/bass/keys; Kit has eight possible combinations. This preserves expressive Jev effects while retaining recognizable drum attacks.

**Presentation and scope:** retain the venue design, add a compact concept/section card above the performance and a master desk below the channel mixer. Expose PATCH and OPENING in the trace console without inventing extra stage musicians. Record the full user requests in the prompt log. GitHub remains private and the prototype remains local.

## 2026-09-20 — Independent musical sentences, real solos and a queued setlist

**User corrections:** a SOLO badge on a repeated accompaniment is not a solo. Require new melodic/rhythmic material, mood-dependent 8–32-bar solos, an opportunity roughly every 180 seconds, ordinary phrases extending through twelve bars, visible June patch choices, and new prompts queued eight bars ahead. Prefer GPT-5.6 Luna for the director. The user explicitly authorized a separate visual-PR merge watcher and an audience-audio implementation subagent.

**Phrase architecture supersedes the one-updating-musician contract above:** keep two bars as a bounded delivery chunk for audio scheduling, but give every musician an independently chosen 2/4/6/8/12-bar musical sentence. Length is sampled from Jev's actual probability distribution and separately recorded; it is not a uniform random length or prerecorded phrase. A committed sentence receives fresh chunks every boundary until complete, remembers its opening motif, and retains its style/tonic/mode while developing actual notes. It cannot hold or invent a new theme mid-sentence. One ordinary player at a time can begin a new idea; multiple already-committed sentences can continue concurrently. Players still see only performed peers, not each other's next chunk. This delivers long-form phrases incrementally so twelve bars of advance generation do not erase real-time response.

**Dedicated guitar/keyboard solo mode:** after Jev elects a solo, a separate typed Jev request chooses duration (8/10/12/16/20/24/28/32 bars), singing register, contour and melodic texture. Rook uses single-line lead; June can use right-hand melody with sparse left-hand comping. The selected length is a commitment, with new composition every two bars. Statements, development and a final resolution are explicit context. Constraints reserve enough note slots to reach both bars, prevent immediate pitch repetition and require changed opening/answer pitches and a rhythmic answer against the prior chunk. All alternative pitches and timings are still Jev choices. Model-selected targets, articulations and bends shape the line; no arpeggiator manufactures it. Raw plan, solo-plan and event answers are preserved. Both players may solo together.

The invitation's urgency rises with time since the last solo. At about 175 seconds without a new solo, the scheduler offers a required featured turn to guitar or keys, alternating the last starter, provided enough jam time remains. This is a scheduling guarantee of an opportunity, not a guarantee that an unavailable provider will return music. A failed solo chunk is silenced and loses its SOLO badge instead of repeatedly presenting the preceding lead as fresh material. Stop, the ten-minute ceiling and a user-requested transition can interrupt a solo. Ordinary finished phrases may hold their last accompaniment chunk while awaiting their next turn.

**Queued themes:** the prompt remains available during a live performance. Up to four follow-ups queue FIFO. The eight-bar lead-in starts at the next two-bar boundary (there can be a short pickup wait); frame counts preserve musical time during tempo changes. A director brief is prepared in parallel for each submitted theme. At its target boundary the shared cue updates the theme, restarts chapter time and requests fresh parts for all four players. This coordinated change is an explicit user cue, an exception to autonomous one-new-idea scheduling; no player sees another's unperformed notes. If the brief is late/unavailable, Jev receives the raw new prompt on schedule. Queues cannot extend the ten-minute hard limit. Failed musical calls remain disclosed fallbacks, so exact audible transformation remains subject to provider availability.

**Model preference verified:** real structured requests to `openai/gpt-5.6-luna` succeeded; it replaces 4.1 Mini as the configurable director default. The director remains distinct from ongoing Jev performance choices. June's player card now shows LH/RH patch names and each player shows its current bar range within the longer phrase/solo.

**Budget and rendering:** concurrent fresh continuations increase calls. The default/hard server cap is now 6,000 per jam, while an explicit lower environment cap is respected. Every round reserves its maximum possible requests before it starts and aborts near its audio deadline. Dense sessions can still reach the cap before ten minutes; costs remain visible. Browser clients still subscribe to one shared score.

**Parallel work explicitly authorized:** a separate isolated thread checks for Claude's intended visual PR every fifteen minutes, verifies the actual default branch (`main`), and may merge only the identified PR after review/checks against current remote head. It must not touch this active checkout or its servers. The audience subagent owns separate playback/generation modules; integration is performed in this thread. Neither task authorizes public deployment or changing repository visibility.

**Audience implementation:** the authorized subagent built the generation adapter, sample-bank validation and Web Audio player. This thread integrated the audience into the master bus and Patch's existing shared request. Use 12-second ambient beds and six-second reactions, randomized with crossfades and at least 22 seconds between reactions. Manual mute, mood, level and reaction controls remain local. The current procedural room/applause fallback is labeled honestly: no generated clips or synthetic voices are bundled, and no audio-generation credential was available. The dry-run-first script can prepare up to 100 clips, but new recordings require review and a recorded redistribution grant before activation. Full research is in `AUDIENCE.md`.

**Deadline correction from live verification:** dense simultaneous continuations exceeded the previous roughly four-second runway; a late round could also discard already-completed musicians. The first joining player now starts planning 250 ms after the opener begins. Steady-state planning starts up to two seconds before the preceding chunk, giving roughly six to nine seconds for the next chunk at supported tempos. Every peer observation still uses the actual 180 ms hearing cutoff, so a queued score is private until performed. Independent rig decisions run alongside sequential notes and both are accepted atomically. Each musician's completion time controls acceptance; a late lighting/peer response no longer invalidates a timely score. Provider failure can still cause a disclosed repeat/rest.

Solo lead gates now end at the following lead attack, preserving a clear melodic voice, while keyboard left-hand comping can sustain. A third identical onset interval is excluded when valid alternatives remain. These are explicit composition/playability constraints, not model-authored notes or a claim of human listening approval.

## 2026-09-19 — Psychedelic realism stage revision

**User requirement:** a far more psychedelic and far more realistic stage; characters and animation with visible life down to small details; everything responsive to the music; every aesthetic decision intentional; trippy, fun, a real digital jam experience. Exact wording is in the prompt log.

**Supersedes** the founding note that "low-poly geometry is an intentional prototype aesthetic" and the box-figure stage. The gig-poster interface, persona colours, no-strobe rule, reduced-motion behaviour, note-synchronised animation and "animation never creates model calls" all stand. Everything below is an implementation choice, not an explicit user approval.

### Visual thesis

*The Neverending Room has no ceiling.* A real festival stage — truss, moving heads, backline, cables, a crooked rug — stands in an open field under a listening sky, and the music is the only thing that moves the light. Realism lives in the objects and the bodies; psychedelia lives in the light, the wall and the lens. Nothing is random decoration: every moving element is driven by a committed note, a typed Jev decision, or the listener's real post-fader meters.

### One rule: the picture may only say what the music said

The stage reads `Frame` data (notes, decisions, lighting) and the soundboard's `levels()`. It never invents musical facts and never calls a model. Anticipatory motion (a drumstick rising before its hit) uses notes already committed in the current phrase, or the next phrase once the server has published it; for a continuing part it assumes the repeat. This is animation look-ahead, not musical foresight, and it never appears in the decision feed.

### Mapping table — what drives what

| Musical fact | Visual consequence |
|---|---|
| Key root | Hue of the whole room, placed on the colour wheel by the circle of fifths. A modulation up a fourth or fifth turns the room exactly one step. |
| Mode | Pattern family on the projection wall: Dorian → oil-and-water liquid projection; Mixolydian → turning mandala; minor → deep tunnel; major → op-art sunburst. Modes cross-fade. |
| Lux's `wash` | A three-colour chord (key, counter, accent), not one flat colour. Key floods, counter rims the players from behind, accent rides the beams. `ultraviolet` makes the banner's fluorescent inks glow; `blackout` leaves only LEDs, pilot lamps and the dimmed wall. |
| Lux's `beam` (12 recipes) | Twelve hand-written cues for 14 moving heads that physically pan and tilt: `four pillars` drops one column on each musician, `solo pool` converges on whoever is soloing, `prism bloom` splits into separate hues with a gobo, `rain curtain` rolls brightness along the downstage edge, and so on. |
| Lux's `laser` (8 recipes) | Colour comes from the recipe's adjective, geometry from its noun: fan, tunnel, lattice, horizon, spokes, canopy, spiral. Beams glide between shapes. |
| Lux's `intensity` / `motion` | Light level and fixture travel speed. Lux (the character) reaches across the desk each time a new look is committed. |
| A solo | A visible follow-spot beam from front of house, a slow iris on the wall, bandmates turn to watch, the crowd's hands-up threshold drops, and the soloist's posture changes (weight back, neck up, eyes closed; bends open the mouth and raise the brows). |
| Guitar / bass pitch | The fretting hand goes to the real fret: instruments are modelled to scale length (648 mm / 864 mm) with 12-TET fret spacing and standard tunings, and a mid-neck position is chosen as a player would. The sounding string shows a vibration blur. Alternate picking follows onset parity; Moss alternates index and middle fingers. |
| Keys `hand` + `patch` | Each hand moves to the instrument that carries its patch: piano/Rhodes on the stage piano, analog/pad/bell on the synth above it, organ on the console at June's left, with the Leslie horn spinning up. Real 61-key layouts; keys dip and glow for exactly the note's duration. |
| Drum voices | Kick → right foot and beater; snare/high tom/crash → left hand; hats/ride/toms → right hand. Sticks travel from the last hit to the next and land on the beat; cymbals swing on springs; heads flex. |
| `decision.effects` | The matching pedal LED on that player's board, and the player steps on the pedal when the state changes. |
| The same effects, band-wide | The lens bends the way the sound does: delay → light trails; reverb → wider bloom; drive → grain, saturation, colour fringing; wah/envelope → swimming glass; chorus → doubling and swirl; tremolo → a slow breath of brightness. |
| Note onsets | Each instrument has a visual voice: guitar throws pitch-coloured sparks from the headstock; bass rolls rings across the deck (lower notes roll further); keys release slow bubbles; kick fires a ring; cymbals shed brass shimmer. Notes also push the wall from that player's side of the stage. |
| Real meters | Amp grilles, wedges and the LED stage lip (one zone per musician in their persona colour) follow the listener's post-fader signal. With sound off they fall back to note-derived envelopes. |
| Whole-band energy | Crowd bounce, each fan's individual hands-up threshold, balloon volleys, aurora brightness, and — at sustained peaks only, at most every few bars — a glowstick war. |

### Characters

Five hand-built, jointed people replace the box figures: two-bone IK arms and legs (knees absorb the groove because feet stay planted while hips move), articulated fingers, eyes that lead the head, blinking, brows and mouths, spring-driven hair, and seeded wandering attention between bandmates, their instrument and the crowd. Looks are original and chosen per persona: Rook's long hair and copper tie-dye, Moss's beanie and shades, June's curls and round glasses, Kit's headband and tank, Lux's cap and headphones. They remain stylised figures, not motion capture or likenesses of real people.

### Safety and comfort

No strobes, as before. Brightness pulses follow the bar (about 0.4–0.6 Hz) or the kick at a few percent; the tremolo breath is 1.8 Hz at under 4 %. Fast musical events (hi-hats, 32nd runs) drive small motion and particles, never luminance. Video-feedback trails are capped so they cannot accumulate brightness, apply only to light sources, and yield to camera movement. *Less movement* freezes performance animation, shaders, trails and pulses but keeps camera navigation. A lens control (Full trip / Mellow / Clean lens) scales every effect-driven distortion for the individual viewer.

### Cameras

Balcony, front row, in the crowd, overhead, stage wing, lighting desk and four member cameras, each framed from the player's open side. *Follow solo* remains. *Director* cuts between cameras every two phrases and goes to a soloist when one appears. Manual orbit cancels both. A slight handheld drift keeps a parked camera alive.

### Performance choices

Hundreds of small parts per prop (frets, lugs, knobs, tuners) are baked into one mesh per material at load; straps, cables, truss lacing, lasers, piano keys, LED lip and crowd are instanced. Fingers and faces drop out beyond 12 m. The projection wall renders once per frame into a small target and is reused for the wall and its floor smear. Resolution adapts downward if frames run long. Software WebGL gets a reduced tier: no post chain or shadows, fewer fixtures, crowd and particles, 12 fps — audio scheduling keeps priority. All art is procedural; no models, textures or fonts are downloaded.

### Not implemented

Skinned meshes and cloth simulation; real planar reflections; per-note finger choice on keys; audience members with individual faces; beat-accurate camera cuts; a recorded "concert film" export.

## 2026-09-20 — Visual PR integration with v0.5

**Authorized scope:** safely integrate Claude's visual PR with the latest remote main from a separate checkout, preserving the active development checkout and its previews. This does not authorize public deployment or a repository visibility change.

**Integration decisions:** retain all v0.5 musical composition, long phrases and solos, causal scheduling, Luna director/theme queue, Patch mix, June patches, instrument rigs and audience controls. The stage uses the current performed `effectsTimeline` cue for pedal LEDs, foot presses and lens effects. Open hi-hats animate the hi-hat limb. Anticipation uses only a published upcoming frame and its timestamp; `continued` does not imply that the next chunk repeats. This supersedes the repeat assumption in the earlier visual design entry. Musical decisions and provenance are not modified by these visual signals. Audience recordings remain absent, with the procedural fallback explicitly labeled.

## 2026-09-20 — Provider choice, publication audit and deployment preparation (v0.6)

**User request:** audit all visible prompts/features, support direct TypeSafe alongside OpenRouter, launch an independent publication investigation, refresh README/CONTRIBUTING, choose hosting and deploy after a dedicated key is supplied. “typescript api” is interpreted as TypeSafe's API because the same request names its key; the app already uses TypeScript. This request authorizes deployment and supersedes the earlier local-only hosting boundary. It does not authorize making the existing Git history public or rewriting it.

**Transport:** direct TypeSafe uses its documented systemone endpoint and `jev-1.13.0`; OpenRouter retains the dedicated Decisions endpoint and `typesafe/jev-1.13`. Automatic configuration prefers TypeSafe when its key exists, with explicit pinning supported and no runtime failover. Trace provider/endpoint/model/token usage is disclosed; unavailable cost stays unknown. The Luna director remains a separate OpenRouter credential and request. TypeSafe-only installations compose from raw prompts.

**Hosting:** Railway fits the existing persistent Node/SSE room with one replica and one HTTPS origin. Vercel and Sites remain possible spectator frontends with a separate backend. The Docker build now includes the recorded instruments. Credentials, private docs, artifacts and local agent settings are excluded from upload/build context. A version/revision health marker supports verifying the served release. A prepared service/domain is not a deployment; the dedicated key and live verification remain pending.

**Publication:** an independent private audit found no exposed credentials in the examined source/history/bundle and verified the instrument sample provenance. It found historical personal/account information, so the existing repo remains private. Recommended publication path: a separately curated snapshot with fresh history, preserving full original prompts and history privately. The private report is stored outside this repository. New local commits use the account's GitHub noreply identity; this does not erase old metadata.

**Audience privacy:** generation now writes to ignored private staging. A separate promotion command checks reviewed hashes, copies only approved clips, substitutes an explicit public license statement, strips private prompt/billing metadata and moves prior public files back to private staging. Merely marking a file unapproved inside a public folder does not keep it private. No generated crowd recordings are present yet.

**Completeness:** `FEATURE-AUDIT.md` maps each visible request to implementation and remaining limits. Musical mechanics are implemented, but listening quality, generated audience recordings, direct-provider live validation, hosting verification and publication curation are not claimed complete. GitHub Actions stays disabled; checks run locally.

**License follow-up:** the user asked for a project-focused README and an MIT-style license. Retain the existing MIT code license, declare it in package metadata, and include it in the container. The MIT grant does not replace the recordings' separate licenses; README and credits make that distinction explicit.

## 2026-09-20 — Dedicated-key Railway release

The user supplied the production TypeSafe credential and explicitly requested it in both Railway and the development repo's environment. Credential values are redacted from prompt history. Development now explicitly selects TypeSafe and retains its existing local OpenRouter director configuration. The idle dev backend was reloaded and its health confirmed TypeSafe/v0.6.0; no computer restart occurred.

Railway runs the same TypeSafe transport, with a protected controller token and one shared room. The production service has no OpenRouter key, so the optional Luna brief is unavailable and Jev composes from the raw prompt. The public deployment does not make the Git repository public. The test jam was stopped after verification; performances begin only through an authorized host action.

The release audition temporarily capped the room at 480 attempts, then restored the normal 6000-attempt ceiling. Five direct smoke calls and a 98-call hosted performance succeeded. Unknown provider dollar cost remains unknown. This brief muted browser check verifies mechanics, not a human listening judgment or long-run musical quality.

## 2026-09-20 — Crowd talk, crowd characters and the cat

**User requirements:** thousands of jam-band/AI jokes shown as speech bubbles that fire at random; smokers; a few wild dancers who bump into others; blanket sitters behind the pit; people filming with phones and cameras; a big fat cat on stage that says "Le Chaton Fat: MEOW!" when clicked.

**Implementation assumptions:**

- Jokes are content, not code. The editable source is `content/chatter/batch-*.json` (one comic angle per batch); `node scripts/build-chatter.mjs` cleans, dedupes and writes `public/chatter.json`. The stage fetches it once after the venue is built and falls back to the user's fourteen original lines if it is missing. Song titles are punned on; lyrics are not reproduced. `docs/chatter-lingo.md` is the uncited fan-vocabulary seed list.
- Bubbles are DOM pinned to projected head positions, not scene geometry, so the words stay crisp and outside the bloom/feedback passes. At most three crowd bubbles at once, a new one every 2.5 to 8 seconds, and only from somebody the current camera can actually see. They are `aria-hidden` and never take pointer events. Crowd lines are jokes written ahead of time; they are never presented as model output or Jev decisions.
- Crowd roles are assigned from the existing seeded generator: glowsticks 16%, phones 7%, cameras 2%, smokers 6%, nine spinners (three on software GL), fifteen blankets (four) with one to three sitters each and the odd cooler. Spinners roam a small orbit, twirl in episodes and soft-collide with neighbours, who stagger on a damped spring and sometimes complain in a bubble. Smokers take a drag every 9 to 18 seconds; the cherry brightens on the inhale and the exhale uses a new `smoke` particle kind tinted by the rig. Screens glow only on the face toward their holder. All of it holds still under reduced motion.
- The cat patrols the downstage lip clear of the wedges, sits like a loaf now and then, and ignores the music. A click raycasts the cat before the performers, so it never opens a persona card.

## 2026-09-20 — Lux's wall pictures, the festival field and the weather (v0.7)

**User requirements:** fix the guitar and bass fretting hands, which read as upside down; let Lux choose among several backdrop visualizers (animated JEV logo, piano roll, band-member camera, graphic EQ, radial visualizer, Winamp-style visualizer, random geometric mandalas, a Matrix-style stream of Jev's raw JSON) and overlay any of them; make the audience look like thousands across an amorphous festival ground without rendering thousands of individuals, blurry, with a wave travelling outward; add procedural weather including sunset, sunrise, high daytime, rain and alien abductions. Everything below that is how these were met.

**Lux's decision:** three typed choices were added to Lux's one existing request: `visual` (nine pictures), `overlay` (the same nine plus none) and `sky` (eight). No new request, persona or model call exists, so the per-jam request budget is unchanged. The fields are optional in `lightingSchema`, so earlier frames, fixtures and saved traces still validate, and a missing field means liquid light, no overlay and a starry night. Lux now sees `currentLook` (the wash, picture, overlay and sky it last put up) so holding a look can be a choice. An overlay equal to the base picture is recorded as none. **Assumption:** weather has inertia. A new sky is accepted at most once every eight frames (about sixteen bars); an earlier change keeps the sky already up. This is an application filter on an accepted Jev answer, recorded here rather than presented as Jev's choice; the raw answer remains in the trace. Rehearsal tours every picture, overlay and sky on a fixed rota and stays labeled as rehearsal.

**Viewer controls:** Wall, Overlay and Sky menus sit beside the camera controls and default to Lux. A viewer's own selection is local to that browser, like the camera and lens controls, and is never sent to the room.

**The pictures** (`src/stage/wall.ts`). Liquid light is the original mode-driven oil show. The logo is a soft-edged mask drawn once to a canvas; the shader fills it with moving colour, runs a slow foil highlight across it and sends outline echoes outward every two beats. The piano roll paints the committed notes of all four players in their persona colours against a shared pitch axis with a drum lane, scrolling past a playhead, including the published upcoming frame and the previous one. The band camera renders the real scene from a member close-up into a small target at half rate, cuts hard to a soloist and otherwise changes subject every two phrases among players who are playing. The graphic EQ has 32 log-spaced LED columns with held, falling peak caps and a reflection. The radial spectrum mirrors the same bands around a ring with a waveform core. Plasma trails is the late-90s media-player look: a ping-pong feedback buffer that zooms, turns and hue-drifts around a scope line; its history is capped below the bloom threshold so it cannot accumulate brightness. The mandala is seeded line-art geometry (six to sixteen-fold symmetry, six counter-rotating layers of circles, rings, diamonds, petals and squares over a stained-glass ground); the seed comes from the phrase number, so every viewer sees the same figure and a new one opens from the hub every two phrases. The decision stream is falling green code whose characters are the room's most recent raw decision records (`role`, `source`, `answers`) exactly as received, so in rehearsal it shows rehearsal records and says so in the text itself. **Assumption:** "Winamp style" was implemented as an original feedback visualizer in that tradition, with no third-party preset, name or asset.

**Honest signals:** the EQ, radial and trails pictures read the listener's real master bus through a listen-only analyser tap when their sound is on. With sound off they fall back to a spectrum synthesized from the committed notes currently sounding (fundamental plus harmonics per held note, drum envelopes placed at their bands). Neither path calls a model or uploads audio.

**Structure and performance:** each picture is a small shader program painted into its own target; a light compositor cross-fades base and outgoing pictures, screens the overlay on, and applies the players' ripples (weakly to pictures containing text or faces), the kick push, the solo iris and Lux's intensity. A first version that put all nine pictures in one program, inlined three times, took the Direct3D compiler 26 seconds and stalled the first frame long enough to time out sample loading; the split version compiles in about 2.5 seconds, asynchronously, before the first frame. Canvases repaint at most 25 times a second and only while on the wall. The camera feed and trails render only while shown.

**The festival field** (`src/stage/crowdfield.ts`). The individually animated dancers are unchanged. Beyond and between their back rows stand 96 concentric ribbons of card on which one shader draws head-and-shoulder figures: one draw call, no textures and no per-frame CPU work. Each figure has its own height, clothes, skin and hair, faces the stage (faces from the stage side, backs of heads from behind), raises its arms when the field's excitement passes a personal threshold, and bounces on a beat delayed by its distance from the stage, so the bounce rolls outward as a wave at a little over twice the real speed of sound. Outlines dither wider with distance so the far crowd dissolves rather than aliasing. A density function shared with the ground gives the crowd ragged edges, drifts and paths; the ground paints the same people as heads seen from above, so aerial views agree with the cards. At night a few percent hold up phones or lighters (more when the music is quiet) and glowsticks come out when it is not. The ground became a real terrain: flat under the stage and pit, rising into a shallow bowl so distant rows stack into view, with rolling hills on the horizon. Two cameras were added to show it: From the stage and Drone; both joined the Director's rotation.

**Weather** (`src/stage/weather.ts`). One sky-dome shader handles gradient, sun disc and halo, horizon stain on the sun's side, drifting fbm cloud lit from the sun, stars, aurora and meteors. Skies cross-fade over about ten seconds; because light is linear, a small constant step finishes the fade that an exponential alone never seems to complete. A hemisphere light and an unshadowed sun light the 3-D scene by day; the far crowd and grass take the same ambient colour; fog colour and density follow the sky. Bloom strength and threshold ease back in daylight so lit skin does not blow out. Rain and snow are GPU particles whose motion lives in the vertex shader, wrapped around the camera; rain wets the deck (lower roughness, stronger wall reflection) and both pick up the rig's colour. **No lightning:** the no-strobe rule stands. The alien abduction is one 46-second visit: a saucer with chasing rim lights arrives over a random spot in the field, lights a beam whose rings climb at walking pace, lifts a Holstein cow that tumbles with decreasing dignity, stows it and leaves; if Lux changes the sky mid-visit the saucer drops the beam and goes. *Less movement* freezes all of it and makes sky changes immediate.

**Fretting hands:** the left hand's palm was aimed away from the neck, so the fingers curled out toward the audience and the wrist sat behind the fretboard. The palm now faces the neck and the player, the wrist hangs under the treble edge just proud of the board, and the fingers come up around the front of the neck and curl back onto the strings, with the index finger and thumb toward the headstock. Fret and string targeting are unchanged.

**Not implemented:** lightning; per-fan faces in the far field; shadows from the sun; weather affecting sound; real planar reflections in the wet deck; a roof (the band gets rained on).

## 2026-09-20 — Boredom, lead gestures and band leadership (v0.7)

**User requests:** an in-depth architecture pass on music generation; solos that sound like solos, with the hammer-ons, slides and bends of earlier iterations; an answer to "combine Jev with LLM composition, or pure Jev?"; a declarative mechanism for lower-probability choices as the jam progresses; a fix for June's left hand; then more modes, one-player key/mode leadership, drummer-led groove and tempo, band dynamics, two guitar gain stages, keyboard variety and "a way to get bored".

**Audit of recorded live traces (before this change).** These are measurements of stored `artifacts/` runs, not impressions:

| Finding | Evidence | Cause |
|---|---|---|
| Every plan was the same plan | `arc: settle` 19/19, `intent: develop_motif` 19/19, `mode` and `palette` 19/19 identical, `style` 17/19 | Plan decisions took Jev's top choice. Jev is a classifier: a near-identical state returns a near-identical answer |
| Distributions are too peaked for temperature to matter | `right: rhodes 0.94`, `volume: warm 0.99`, `feel: breakbeat 1.00`, `mode: dorian 1.00`, `keyMove: stay 1.00` | Sampling the same distribution harder cannot move a 0.99 |
| No expressive technique was ever played | `bend: 0` on 98/98 guitar notes; `articulation: natural` on 210/230 notes, the rest `legato` | Independent per-note questions each default to "plain" |
| A "solo" was a quarter-note oscillation | D5/B4 alternation, 8 notes per two bars, the next attack came 1–2 beats later in 73% of 230 attacks | One HTTP request per attack (about 350 ms) caps density at 12 attacks per two bars; Jev chose 6–8 |
| June's left hand was silent | deployed run: `leftCount = 0` in 24/24 attacks, although playing had 50% of the probability | Five ways of playing (1–5 notes) split the vote and lost to one way of resting |
| A bass or drum "solo" froze that player for the rest of the jam | live run: bass never composed again after frame 9, drums after frame 22 | The scheduler skipped any part flagged solo, but only guitar/keys solos had their own continuation track |
| Dense drum requests were rejected | HTTP 400 on 66–73 KB bodies | Four heard frames plus three private memories of a 75-hit drum part |

**Decision 1 — boredom is declarative, in three layers.** (a) *Option fatigue*: when a player has used the same option for more than its patience (keyboards, volume, register 3 phrases; arc 3; texture, chord 4; palette, feel, pulse 5; style 6; drummer tempo 6), that option may rest for one decision, with a seeded chance that grows with the run length and the jam's age. Jev then chooses its best alternative from the remaining menu and is told which option is resting and why. The incumbent returns as soon as something else has been played. After 48 bars in one key, `stay` itself can tire. (b) *Heat*: plan decisions are decoded from Jev's own distribution with a temperature, nucleus and own-recent-choice penalty that rise with novelty pressure. Pressure grows while fewer than two audible dimensions change, grows with elapsed time, differs by persona (Rook 1.25, June 1.1, Moss 0.8, Kit 0.7) and resets after a real departure. Zero-probability options are never chosen; band-moving choices are heated only above 0.45 pressure. (c) *State*: the request tells Jev its pressure, how long its direction has held and, above 0.55, to move the jam forward rather than "change a detail". Raw answers stay in `Trace.answers`; applied answers and the pressure used are disclosed. This is the harness rule the user asked for; it is not a claim that Jev itself became more adventurous.

**Decision 2 — lead gestures (pure Jev).** In a guitar or keyboard solo one request now writes a whole gesture of one to eight notes: starting pitch, up to seven relative scale steps, rhythmic grid (quarters to 32nds, exact triplets and sextuplets), landing length, breath, technique (picked, hammer-on/pull-off legato, slides, muted), landing ornament (wide vibrato, bend up into the chosen pitch and hold, bend and release, pre-bend release, slide in; grace notes for keys), dynamic shape and, for June, a left-hand comp chord. Parallel questions cannot see each other, but relative steps always compose into a connected line. Because "how many" and "how fast" cannot agree by themselves, Jev names the **next** gesture (cry, melodic cell, run, riff) at the end of each cell with everything played so far in view, and that choice shapes the following request's options. The harness does interval arithmetic, keeps the line on the instrument and in the chosen palette, and turns a line around at the edge of the range. It never supplies a lick. Every note carries the slot of the answer it came from. Solo energy follows a shape: simmer or climb first, climb or peak after 40%, cool in the last two bars.

**Decision 3 — hybrid with Luna, as advice only.** The user proposed letting `openai/gpt-5.6-luna` compose longer phrases. An LLM needs seconds and the clock gives milliseconds, so Luna works off the clock as an *arranger*: when the solo invitation reaches 55% urgency, or a spontaneous solo starts, one structured request returns a story, a motif described in words and scale degrees, and an eight-chunk arc (energy, register, idea, landing degrees, techniques). Jev sees the chunk for the bars being composed, labelled as written by an outside arranger who cannot hear the band, and may follow, bend or ignore it. The sketch contains no playable notes, is published in the room state and labelled on the soloist's card, is capped at six per jam, and its absence or failure changes nothing. This amends the working agreement "no chat model substitutes for Jev's performance decisions" only in the sense the user asked for: Luna advises, Jev still decides every sounded note. It needs the OpenRouter key, so the TypeSafe-only production service runs without it.

**Decision 4 — leadership.** One player may lead a key or mode change through a `keyMove` decision (up a fourth, up a fifth, relative, up/down a step, new mode), open from bar 17 and at most once per 16 bars. The leader's own root and mode change at once and the band reference follows; bandmates are told only after that frame has sounded ("MOSS just led the band to G dorian"), may follow in the middle of a committed phrase, and may also hold the old key for tension. This replaces the two-vote rule in live mode. The drummer owns time: Kit's push or ease moves the tempo 2.5% per phrase (others' combined votes 1.2%), still within ±10%, and Kit chooses one of nine groove feels that bandmates hear once it sounds. Twenty-two modes are offered, including every mode of melodic and harmonic minor, described as rare colors. Peers' tonal center, volume and drum feel are disclosed only for frames that have already sounded, the same rule as pedal states.

**Decision 5 — dynamics and gain.** Each player chooses whisper, soft, warm, bold or roar per phrase. It scales that channel's level (0.45–1.14) over about a beat and selects softer recorded layers; Jev's per-note velocities are unchanged. Peers' levels are heard. The guitar rig chooses light overdrive or lead per bar whenever drive is on (overdrive is 32% of the lead amount through the same RMS-matched stage).

**Fixes.** June's hands now decide play-versus-rest by total probability mass, and a comping texture does not offer a left-hand rest when that hand has been silent for two beats. Bass and drum features last one phrase and stay in the rotation. Heard context drops its oldest frames above 40 KB. `choice()` copies option tables so no rule can edit a shared constant.

**Implementation assumptions, not user requirements:** every patience, probability, pressure constant, gain value and the 55% sketch trigger are first guesses to be tuned by listening.

## 2026-09-20 — Disclosed provider fallback

**User request:** keep OpenRouter as a fallback for the direct TypeSafe key. This supersedes the v0.6 rule that a selected provider never fails over.

When both keys are configured, the other provider is the room's fallback unless `JEV_FALLBACK=0`. A room switches at most once: immediately on HTTP 401, 402 or 403, which waiting cannot cure, or after two consecutive phrases without any Jev response, or when the opening request fails. The whole room moves; requests already in flight fail and are disclosed as fallback traces, and the refused provider is not retried. The switch, its reason and frame are published as `providerSwitch`, and every trace continues to name the provider and endpoint that answered it. Each provider only ever receives its own key and its own model ID. Without a second key nothing changes: three failed phrases still stop the jam. Production currently has only the TypeSafe key, so it has no fallback until an OpenRouter key is added there.


## 2026-09-20 — Durable event recordings (local implementation)

**User requirements:** mandatory title plus optional description, interpreted together using the existing prompt path; automatic recordings of responses and performances; searchable Jtb archive with shows, sets and songs; SQLite locally, PostgreSQL on Railway, and local archive migration. Follow-up asks for safe accumulation and flushing.

**Implementation:** a continuous Room is a set; queued themes are its songs. The existing eight-bar transition, room budget and ten-minute cap remain. Replay re-renders saved committed notes, rigs, lighting, engineer mix and raw/applied decision responses with the bundled renderer. It is an event recording, not an immutable mixed audio file: listener controls and future renderer/sample changes can change the sound. Replay has no provider path and disables reference measurements. Demo tapes are explicitly identified.

A single bounded writer buffers at most 32 MiB, flushes responses within 100 ms or at 32 events, and flushes immediately for state/frame publication. Each batch uses one database transaction. Frame and response IDs are idempotent keys. Audiences receive committed data, including initial SSE/room reads. Three bounded attempts handle transient storage errors; persistent failure stops the performance and blocks another start. SQLite uses WAL/FULL durability. Abrupt process loss can discard the last uncommitted responses, but not previously committed recordings; startup marks incomplete sets as recovered/interrupted. Graceful shutdown drains the writer. One server replica owns the live room.

Railway requires DATABASE_URL to avoid accidental ephemeral SQLite storage. Migration copies transactionally, refuses conflicting IDs and active source sets, verifies content hashes, and preserves the source. No deployment or production migration is part of this local change.


## 2026-09-20 — Archive release integration (v0.8)

The user authorized creating a PR, merging it into the primary branch (named main in this repository), and deploying to Railway. Integration starts from the released v0.7 branch and preserves its musical novelty, solo arranger, provider fallback, projection/sky controls and crowd characters. The archive is enabled through a dedicated Postgres service with an app-level variable reference; local databases are excluded from deployment uploads. Release verification uses no-call rehearsal and saved replay rather than starting a paid live jam.

## 2026-09-20 — Real generated audience recordings

**User requirement:** replace the unsatisfying noise with varied generated festival murmurs, cheers and applause, respect a 10,000-credit free budget, expose sound-desk triggers, and begin cheers on Start before music.

**Implementation:** 24 distinct ElevenLabs Sound Effects v2 recordings, split evenly across listening, grooving, applause and cheering. Twelve 12-second beds and twelve six-second reactions total 216 seconds. The account billed 2,160 credits; 7,840 remain. This smaller first bank provides six takes per mood within the budget rather than claiming the earlier approximate 100-clip idea is complete. Generation is offline with a persistent conservative reservation ledger and no automatic retries. Secrets and original provider records stay ignored/private.

**Playback:** crowd starts during instrument loading and first-decision preparation, carries across room creation, and cancels on failed startup. Spectators do not retrigger the entrance. Generated-only playback supersedes the old procedural-noise fallback; asset failures now stay silent. Independent manual applause/cheer cues respect mute, quiet and reaction controls. At most one reaction plays at a time, and the normal Patch-driven cadence remains sparse.

**Licensing and review:** free-plan output is noncommercial with title attribution, excluded from the MIT code license. The page and crowd titles credit elevenlabs.io. Clips passed decode, duration, hash and Web Audio tests; no human listening approval or independent certification of no accidental music/words is claimed. Technical deployment approval is recorded distinctly from listening taste.

**Integration:** audience work is isolated from the concurrent archive work and integrated onto the current release before deployment. Existing music, archive storage and provider configuration are preserved.


## 2026-09-20 — Song title in animated lettering

**User requirement:** put the song title on the screen in animated lettering.

**Decisions:** "the screen" is read as the projection wall, where Lux's other pictures live. `song title` is a tenth wall picture that Lux can choose as the picture or as an overlay in its existing single request; viewers can also pick it locally. **Assumption:** independently of Lux, a new song or queued theme announces itself: its title is laid over whatever is on the wall for ten seconds, and a viewer who joins mid-song sees it once as "now playing". That card is application behavior tied to `themeTitle` changing, not a Jev decision, and it never alters the recorded lighting.

The text is the room's existing `themeTitle` (first line of the prompt, at most 80 characters), upper-cased and balanced over up to three lines at the largest heavy system face that fits; no fonts are downloaded. Letters drop in one after another with an overshoot, ride a wave that travels along the line on the beat, lean with the bar, push slightly on the kick, and trail five echoes that step through Lux's palette. As the base picture a slow fan of rays sits behind the words; as an overlay the words go up alone. Each letter is inked once into a sprite and re-inked only when the echo colours step (about 1.5 times a second), so a frame is a few dozen image blits; measured wall cost rose from about 0.7 ms to about 1.4 ms while the title is up. With *Less movement* the title is drawn once, settled, with no entrance, wave or lean.

## 2026-09-20 — A queued song is a new song

**User request:** queued themes stayed stuck on the previous song. Queueing should cue a natural ending; when every instrument is silent the next sequence starts as if it were the first prompt, with no residual memory. This supersedes the eight-bar lead-in and the all-four-players-change-at-once transition.

**Why the old transition stuck.** Every player kept its own notes, direction, motif, rig and recent-choice memory, all four were heard context for each other, tempo and opener never changed, and only the director concept could move the key. Jev is a classifier, so a state that was 95% the old song produced the old song.

**Wind-down.** Once the current song has played at least 16 bars, a queued song starts a wind-down at the next two-bar boundary. Every player still sounding decides each boundary how to finish: in the first two bars everyone plays a landing (resolve or thin out), for the next two resolve, thin out or stop; for the four after that resolve or stop; after eight bars only stop is offered. Arc is release or space, volume whisper to warm, tempo may ease, no key moves, solos, new phrases or option fatigue. A player who stops stays stopped. If anything is still sounding after ten bars (a failed request holds its old notes), the harness silences it and marks the part `cutForNextSong`; that is not presented as a Jev choice.

**Fresh start.** The frame after a fully silent two-bar frame begins the new song through the same path as a first song: a new opening decision (opener, tempo, tonic, mode) from the new prompt and its Luna concept, one opener, then one entrance per boundary. Players see no frames, parts, direction, heat memory, solo history, sketches or key-change cues from the earlier song, and musical time (elapsed seconds, ending pressure, chart position, heat and fatigue warmth, the solo invitation clock) restarts. If the opening decision fails, the director suggestion is used, else the opener rotates. Several queued songs play in order, each guaranteed 16 bars before its own wind-down.

**What deliberately continues:** the ten-minute room lifetime and hard stop, the request cap, provider state, Patch's mix, lighting and frame numbering. A song queued late in the room's life may therefore be short. Assumption to revisit: whether a queued song should extend the room's lifetime.

## 2026-09-20 — End jam is a landing, not a cut

**User request:** ending should use the same natural wind-down as a queued song, not a hard cut. End jam now starts that wind-down at the next two-bar boundary (no 16-bar minimum), and the room closes 1.5 seconds into the silence so tails can ring. Any queued songs are dropped. A second press while the band is landing, or a press when nothing live is sounding (starting, demo mode, already silent), stops immediately; the button says so. The hard ten-minute stop, request cap and provider failure stop are still immediate.

## 2026-09-20 — "How Jev works" liner notes

**User requirement:** funky, whimsical but true docs in the stage's "How Jev works" panel: how Jev sees music, how it chooses notes and drives the samplers and synths, how probabilities become possibilities (boredom, LLM themes), credits naming Codex (gpt-6-astra) and Claude Code (fable 5.1), the license, and an about-me with Seth's public links.

**Decisions:** the existing header modal becomes the docs (`src/HowJevWorks.tsx`), retitled "How Jev works", with six numbered sections and in-panel jump links. Tone is playful; every number is read from the code it describes (`server/listening.ts`, `server/musical-context.ts`, `server/composer.ts`, `server/heat.ts`, `server/director.ts`, `src/audio.ts`). The brief says "2 bars just heard"; the code sends the newest two-bar phrase trimmed to the sounded beat plus up to three earlier phrases, so the text says both. **Assumptions:** Jev (TypeSafe), Luna and the sample libraries are credited alongside the two coding agents the user named. The about-me uses the user's sentence plus his employer from his public GitHub and LinkedIn profiles. Links: `github.com/smcronin` (the repository owner), `linkedin.com/in/sethcronin`, `ipcg.com/team/seth-cronin`, and `x.com/SethCronin`, the last found by web search and not independently confirmed as his. The repository is private today, so the license section names MIT without linking to the source; add the link when the repository is published.

## 2026-09-20 — Every song is set somewhere

**User request:** a few variations of the horizon environment (mountains, city, night club, arena, etc.), randomly selected for each song.

**Places:** `hills` (the original open country, nothing added), `mountains` (three snow-capped ranges), `desert` (mesas; the "etc."), `city` (two rings of skyline whose windows come on at night), `night club` (a roofless black warehouse: level-meter bars, neon shapes, a mezzanine of heads, open roof trusses) and `arena` (two decks of seated crowd with phones, a suite level with a colour ribbon, floodlit rim and canopy). Each is shader drawn on a few open cylinders 170–250 m out: no textures, no per-frame CPU work, one extra draw per ring, and only the current place is drawn. They carry their own haze because scene fog would erase anything that far away; their lights carry through it. Skyline crowns, the arena ribbon and wave, and the club's meters follow the rig palette, band energy and beat, which are existing stage signals rather than new musical facts.

**Assumptions.** "Randomly selected" is a hash of the song's `themeId`, not a roll in each browser, so every spectator and every archive replay sees the same place for the same song; consecutive songs can repeat a place (one in six). The rolling hills flatten for built places (city partly, club and arena fully) through a vertex attribute shared by the ground and the far crowd, so the terrain is not rebuilt. A change of song sinks the old scenery into the ground while the new one rises over about eight seconds; with *Less movement* it is simply there. The club keeps an open roof so Lux's sky and weather still read. An empty room shows hills; after a jam the last place stays. Like wall and sky, the camera desk has a viewer-local **Place** override that is never sent anywhere. The place is application scenery, not a Jev or Lux decision, and is not recorded in traces.

Measured on the development machine: shader precompile rose by about 0.1 s and steady frame cost did not change measurably; pieces are kept buried-but-visible during precompile so no program is built mid-song.

## 2026-09-20 — Rook and Moss leave their marks

**User request:** dance moves for the band, at least Rook and Moss: jumping, swaying, walking around the stage, occasionally falling over.

**Decisions:** the two standing players get a seeded choreographer (`src/stage/moves.ts`) layered on the existing groove: a wide two-beat sway with the unweighted foot lifting, strolls inside a patch of deck between the amp line and the pedalboard, one to four hops timed so the *landing* is on the beat, a four-beat spin, and a pratfall. Feet are planted in stage space and step only when the body has moved far enough, so nobody skates; hands stay on the real frets because the arms are still solved against the instrument. Jumps and spins get likelier with band energy; a soloist mostly stays put. June and Kit are seated behind instruments and keep their current motion.

**The fall** is a stroll that goes wrong: the player walks to a spot with clear deck behind it (never onto an amp), the feet shoot out, they go over backwards, keep playing flat on their back with heels kicking in time for two to five seconds, then roll up. At most one per player every 75 seconds, never in the first 25 seconds, never during their own solo, and not chosen while the song is landing.

**Truthfulness:** this is showmanship owned by the stage, not a Jev decision and not recorded in traces. It reads only signals the stage already has (beat, tempo, energy, solo, ending). When the music stops or the song is ending the players walk back to their marks; *Less movement* puts them there immediately. A pedal change while a player is off the mark still lights the pedal but is not mimed, rather than stretching a leg across the stage. Guitar and bass leads are longer (slack 1.5 to 1.9) to allow the wandering. **Assumption to revisit:** light pools and "four pillars" still aim at the marks, not the wandering players.


## 2026-09-20 — Flatten the archive into daily shows

**User requirement:** remove the set presentation and use one Replay show button with all songs organized per day.

Each day now has one chronological numbered song list, displaying each title and description once. There are no nested set cards, Saved set labels, or individual playback buttons. Replay show plays the whole day even when search has narrowed the visible recordings. Existing stored recordings remain unchanged.

## 2026-09-20 — The director never parks a camera

**User request:** the Director should do more directing: always move the camera every 30 to 90 seconds, plus slow zooms and orbits. This supersedes "cuts between cameras every two phrases" in the camera section above.

**Why it looked idle.** Cuts were counted in phrases, so an empty or ended room never cut at all; a solo held its close-up for as long as it lasted; and a shot was static apart from the handheld drift.

**Now** (`src/stage/director.ts`, viewer-local like every camera control): each shot is held for a random 30 to 90 seconds of wall clock and then cut, whether or not anyone is playing. While the band plays a due cut waits for the next two-bar boundary, for at most six seconds. The next camera is drawn at random from the twelve, never the current one or the three before it. A new solo is still cut to at once; a long solo is covered with 10 to 18 second cutaways to the room and a return to the player, so it also never sits still. Every shot carries one slow move for its whole length: a push in, a pull out, an orbit, or an orbit with either. **Assumptions:** sizes are up to about 40° of arc and 26% of distance on open shots (balcony, overhead, drone), scaled down per camera where scenery is close (stage wing 20%, from the stage 25%, in the crowd and lighting desk 35%, member close-ups 50%), which keeps every move under two degrees a second; low shots open out along the ground rather than into it. The move steers the camera's goal and the existing damping follows, so cuts keep the house fly-between. The zoom buttons now carry on from the new distance under the Director; dragging or picking a camera still turns it off. With *Less movement* the cuts happen and the moves do not. Choices use the browser's own randomness: two viewers' directors are not meant to agree.

**Signs and the lens.** A cardboard sign could fill a low camera (in the crowd, front row, lighting desk, and now the Director's orbits through the pit). A fan whose sign is within about three metres of the camera lowers and tips it, and raises it again past about six; signs further away stay up, because a sign in the shot is part of a crowd shot. Balloons can still drift past the lens; they leave on their own.


## 2026-09-20 — Archive player reliability

User requirement: keep daily shows, restore individual song playback, and provide a visible player with next-song controls. This supersedes the earlier assumption that all individual playback controls should disappear. Implementation: playback selects only state, frame and song rows in SQL, leaving large raw response logs in durable storage. A lazy per-song queue loads one recording at a time and clips it to song/day boundaries. Previous, next, pause, seek, retry and return-to-live remain local; failures preserve navigation. Full raw recordings remain available through the original read endpoint.


## 2026-09-20 — Streamed archive audio and synchronized visuals

User requirement: implement MP3 streaming with the saved data needed for visuals. Stage motion, lighting and scenery read committed frames; the decision-text overlay reads a small time-indexed response page. Full raw requests are paged only on explicit inspection. A single background worker renders ended recordings through the same Web Audio instruments, pedals and saved engineer settings, then encodes 128 kbps stereo MP3. Archived audio uses a fixed house mix; per-instrument live mixer controls are hidden during streaming. This is a saved-note render, not capture of one listener's original mix. Crowd variation and random synthesis are baked into the rendered file. Backfill and retries require no provider calls. Until a master is ready, the saved-note renderer remains available. MP3s are stored as transactional 256 KiB chunks in the existing SQLite/Postgres archive for local portability; larger deployments can move those media blobs to object storage later.

## 2026-09-20 — The room is open, and the lot can talk

**Before:** a public deployment refused to boot without `CONTROLLER_TOKEN`, and every POST needed it as a bearer token, so only the host could start, queue or stop.

**Now:** the token is gone. Anyone can start a jam, queue a song and end one. What keeps an open room safe is input handling and pacing rather than identity: song and chat text is NFC-normalized and stripped of control, zero-width and bidi-override characters (`server/song-input.ts`), every archive write stays a parameterized query, archive search is an in-memory substring match, and React renders all of it as text. Start, queue and stop share a limit of six requests a minute per address (`trust proxy` is on when bound publicly so the address is the visitor's, not the proxy's). Spend is bounded as before by one room at a time, four queued themes, the ten-minute jam and `MAX_JEV_REQUESTS`. The local-mode Host-header check now keys off the bind address instead of the missing token. **Accepted:** any visitor can end someone else's jam, and a theme is still free text handed to Jev and the director; the typed output contract is what limits what it can do.

**Chat** (`server/chat.ts`, `src/Chat.tsx`): one room-wide conversation over the existing SSE stream, the last 60 lines held in memory and sent on connect, 280 characters a line, one line a second per address. Nothing is archived. Names are lot names drawn in the browser from `shared/chat.ts` ("Spun Box of RAG"), kept in localStorage, rerolled with the dice; they are labels, not identities, and two people can hold the same one.

**Chat in full screen.** Only the stage element goes full screen, so the chat under it used to vanish. While the stage is full screen the same chat is drawn inside it instead: bottom right above the sound button, about a third see-through with older lines fading out at the top, firming up on hover or while typing. A minus button folds it to a small "Chat" pill. It is not shown over archive playback, matching the page.


## 2026-09-20 — Compact archive modal

User requirement: archive replay in a modal, with a day selector, one compact row per song, at most 20 rows per page, and full truncated descriptions on hover. Native dialog provides focus containment and Escape dismissal; closing retains playback. The current player appears inside the modal while open and remains on the page after closing. Titles/descriptions use ellipsis with native hover tooltips and accessible full text. Search filters the selected day; playback still uses the complete daily queue across all pages.

## 2026-09-20 — Site title cleanup

**User requirement:** the browser title is exactly `Jev the Band`. Remove the crowd-audio attribution from the title; audience-audio provenance remains documented in the appropriate product and licensing surfaces.

## 2026-09-21 — The groove is the theme: drum moves

**User questions and request:** is there a premade set of drum grooves; why does the kit go to a tuplet feel every eight bars; expand Kit's palette while keeping it groove-oriented, with theme and variation, fills and beat drops; keep the tuplet feel as one option; keep previous songs playable.

**How drums worked.** There was no premade set. Kit chose a grid (quarters, eighths, triplets, sixteenths) and then, step by step across both bars, whether the kick sounds, snare or tom or rest, which cymbal or rest, and an accent level. Every drum turn rewrote all of it from nothing. The predictable tuplet was the v0.7 boredom rule, not Jev: `pulse` had a patience of five turns, so "sixteenths" was rested on a timer and Jev's next-best grid, triplets, won. Kit composes roughly every fourth boundary, hence "every eight bars".

**Decision.** The groove is a persistent object and each drum turn is one **move** on it:

| Move | What Jev decides | What stays |
|---|---|---|
| keep | nothing further | the whole groove |
| vary cymbals / kick / snare | every step of that one limb, shown what the groove plays there now | the other limbs, and the accent of any unchanged hit |
| fill | length (1, 2 or 4 beats), grid (sixteenths, triplets, sextuplets, eighths), idea, then every hit and accent, and how the groove lands afterwards | the groove up to the fill |
| drop | what falls silent, for how long (up to both bars), and the landing | Jev's own remaining hits |
| build | drum, acceleration shape, what continues underneath, landing | the groove before the build |
| change subdivision | a new groove on another grid: the tuplet feel, or back to straight | nothing |
| new groove | everything, as before | nothing; offered only after four drum turns on a groove |

Fill, drop and build are moments: they sound once, the following repeat is the groove with the chosen landing (crash, splash, ride bell or none), and later repeats are the plain groove. A **groove grammar** keeps the kinds of move from repeating: no moment directly after a moment, at most two variations or two keeps in a row, and a new grid must settle before the next. This replaces timed fatigue for `pulse` and `feel`, which now change only through a deliberate move. The drum feel bandmates hear changes only when the groove was actually rewritten. The palette gains cross-stick, pedal hi-hat, ride bell and splash, plus flams inside fills.

**Provenance.** Every kick, snare, tom and cymbal is still a Jev answer. Two things are harness arithmetic and are labelled as such: a build's rhythm is expanded from Jev's chosen drum, shape and span (slot `build`), and a landing cymbal is placed on the downbeat Jev chose it for (slot `landing`). Unasked steps are Jev's own earlier hits, kept.

**Backwards compatibility.** Recordings store finished frames and replay them; nothing about stored notes changes. All new fields (`upNext`, `drumPulse`, `drumMove`, `grooveAge`, `pendingLanding`, `cutForNextSong`) are optional. Existing drum pitches render and animate exactly as before; the four new pitches never occur in older recordings. A drum part recorded or carried over without grid memory is simply offered `new_groove`.
