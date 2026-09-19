# Instrument recordings

JEV the band composes phrases at runtime using individual recorded notes. There are no prerecorded songs or backing loops.

## Guitar and bass — Karoryfer Samples / D. Smolken

- [Black And Green Guitars](https://shop.karoryfer.com/pages/free-black-and-green-guitars): green hollowbody guitar, plucks at two dynamics and two alternate takes, staccato and hammer-on articulations.
- [Black And Blue Basses](https://shop.karoryfer.com/pages/free-black-and-blue-basses): darkblack fingered hollowbody bass, two dynamics and two alternate takes.
- Source repositories: [guitars](https://github.com/sfzinstruments/karoryfer.black-and-green-guitars), [basses](https://github.com/sfzinstruments/karoryfer.black-and-blue-basses).
- License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). A copy is in `CC0-1.0.txt`. Karoryfer's [current licensing statement](https://shop.karoryfer.com/pages/free-samples) confirms its free sample libraries are CC0.

## Piano — Versilian Studios, packaged by Nicholaus P. Brosowsky

Selected piano notes from [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments), whose source list credits Versilian's VSCO collection. Credit: Versilian Studios; Nicholaus P. Brosowsky / tonejs-instruments contributors.

Distributed under the collection's [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/) license. [License text](https://creativecommons.org/licenses/by/3.0/legalcode). Retain this attribution when redistributing these piano samples. No endorsement is implied.

## Drum accents — Versilian Studios

Recorded snare, hi-hat, tom and suspended-cymbal hits from the [Versilian Community Sample Library](https://github.com/sgossner/VCSL), [CC0 1.0](https://versilian-studios.com/vcsl/). Kick and mid tom retain synthesis in this edition. Organ, Rhodes, synth, pad and bell remain synthesized.

## Browser edition changes

Selected subsets, converted to mono 44.1 kHz / 128 kbps MP3 and truncated at six seconds. Pitch centers come from the original SFZ mappings for guitar and bass, not assumptions about filename octave conventions. Runtime fixed gain normalization, velocity scaling, repitching, envelopes and effects modify playback. This is a compact browser sampler, not the complete original SFZ instrument.

`manifest.json` records every upstream URL pinned to a commit, original SHA-256, derived SHA-256, pitch center, dynamic layer and articulation. `scripts/fetch-samples.mjs` recreates the collection with ffmpeg. The app's source-code license does not replace the sample licenses.
