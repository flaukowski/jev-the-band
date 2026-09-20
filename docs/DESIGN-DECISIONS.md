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
