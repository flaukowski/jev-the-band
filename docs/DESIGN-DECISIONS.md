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
