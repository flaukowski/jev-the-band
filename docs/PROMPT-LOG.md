# Prompt history

## 2026-09-19 — Founding request

Full verbatim record: [ORIGINAL-PROMPT.md](ORIGINAL-PROMPT.md).

Proposed names, colors, engineering limits, and prototype tradeoffs are implementation decisions, recorded separately in [DESIGN-DECISIONS.md](DESIGN-DECISIONS.md).

## 2026-09-19 — Preview availability

```text
site can't be reached?
```

## 2026-09-19 — Listening, musicality, mixer, and stage revision

```text
add mix controls, solo and level etc to each instrument, sor of like a sound board.

e guitar is very tinny, can we have a better e guitar.

it sounds like all instruments are changing at once? they shouldn't be able to tell what eachother are going to do a priori?

also choice are little too gridded, support 32nd note runs, triplets quintuplets, more rhythmic variation etc.

it shouldn't be the case that all instruments can develop a brand new them at once, they shoul dhave to "hear" the other's decision making to respond more like a real band.

solos are not really distinguishable from support since there's not really any different about them, just sounds like an arppeggiator, no melody...

great proof of concept, and it grooves, sick first draftr now make it better more realism, better animation. add camera controls, etc, think of a dozen new fun enhancements to increase the possiblilties.
```

## 2026-09-19 — Independent rigs and recorded instrument research

```text
Also each instrument / player should have there own effects rig, sounded like effects were global?

Can you also scour the web for a better guitar e bass and keyboard samples / rig? Current sounds very very cheap midi

I’d love more especially for the guitar, distortion, envelope filter, pitch bend, more melodic phrases etc.  there’s gotta be something that sounds more convincingly like a real e guitar and e bass? Keys and drums are okay but could also be better
```

## 2026-09-19 — Prompt influence and composition provenance

```text
the prompt doesn't seem to do anything. Two prompts with absolutely completely different themes produced basically identical IDENTICAL jams. Is jev just picking licks from a premade list? how is this possible?&#x20;

The tonal variation is better now, but I'm curious why:

"the grieving pastor decides to burn it all down"

and

"saturday after nursery rhymes" produce basically identical grooves?

How can jev decide actually the notes, the modes, etc on a per insturment basis, how much of this is really being generated on the fly with jev vs. just premade loops?
```

## 2026-09-19 — Live-mode listening clarification

```text
nvm i was running rehearsal! not live jev !!! this is better
```

## 2026-09-19 — Reject preset live arrangements; require actual note composition

```text
Live Jev chooses the opening tempo, tonic and shared mode, then each player’s eight scale-degree anchors, rhythm family, development, dynamics, effects and role. Those anchors are individual model choices, not a lookup of complete licks.
The current score compiler still supplies twelve rhythm patterns, note lengths, registers, chord voicings, drum backbeats, motif transformations and the ending rule. Players share one mode; they do not yet compose arbitrary note events or choose independent modes. Recorded samples contain single instrument notes, not backing loops.
The instrument demo makes no Jev calls and uses three built-in motifs with procedural changes. Its title is not semantically interpreted. Open Under the hood to inspect real requests and their results.

^^^
This is not at all what I had envisioned. jev needs to make actual phrase by phrase note decision, my live jev smoke test produced nothing but a 10 second loop endlessly with basically no variation, that's not at all the app spec
```

## 2026-09-19 — Distortion gain

```text
distortion increases the level too much, we need to turn down the distortion level or add some dynamic range compression to keep a more even mix
```

## 2026-09-19 — Polyphony, groove and musical architecture

```text
this is actually pretty dope!
am i write current set up is montonics.

allow instruments guitar and keyboard, to have full polyphony modes where they can play rhythmic chords in addition to monotonic&#x20;

seems like the drums are cut off and not really find a groove.

this is a cool proof of concept, how do we get jev's choices to have more stylistic branches?

it's like it's all tension no release you know what i mean, i feel like the instruments should strive to groove.&#x20;

we're getting there&#x20;

seems like we lost some of things from previous turns, jev choosing effects etc. ; maybe we need to step back and think about a architecture here...
```

## 2026-09-19 — Playback controls at the top

```text
is the enable sound button have a purpose?? it seems weird.

prompt and play should be at top of UI not bottom
```

## 2026-09-19 — Effects as a major musical dimension

```text
the effects sound dope by the way, jev should make heavy use of them! it should be able to classify bars at any combination of effects on or off right? that will make a big big difference. playing around with them manually they add a TON of texture and interest!
```
