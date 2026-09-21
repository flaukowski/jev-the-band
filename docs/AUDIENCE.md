# Festival audience — elevenlabs.io

24 generated crowd recordings accompany the band: six quiet murmuring beds, six livelier festival beds, six applause reactions, and six cheers. They were generated offline with ElevenLabs Sound Effects v2 on 2026-09-20. Each bed lasts 12 seconds; each reaction lasts six seconds (216 seconds total). There are no runtime ElevenLabs calls or browser credentials.

Pressing Start unlocks audio and begins an opening cheer plus ambience while instrument samples and the first musical decisions load. This carries into the new room without a second entrance. Failed startup cancels the crowd. A late spectator joins the ongoing ambience without another opening cheer. Missing, invalid, or unavailable assets leave silence instead of the old white-noise fallback.

Patch still chooses crowd mood and level in its existing shared decision. The sound desk also offers local **Applause** and **Cheers** buttons. Reactions obey audience mute, quiet mood and the reactions checkbox, do not stack, and do not change Patch's shared settings. Automatic reactions remain spaced 22–46 seconds apart. Beds select different recordings and crossfade over up to 2.5 seconds. The browser caches at most 12 decoded clips with two concurrent downloads.

Samples are calibrated toward 0.1 RMS with a 0.5 peak ceiling. The audience bus defaults to -24 dB and caps at -12 dB, feeding the same protected master mix. Keep the crowd behind the band; use the audience fader to suit the performance.

## Credits and use

**These audio files are excluded from the MIT code license.** They were generated on the ElevenLabs free plan: noncommercial use only, with `elevenlabs.io` in the published content title, subject to the provider's terms. Attribution appears in the page title, audience heading and bank manifest. Do not claim unrestricted commercial redistribution rights for these clips. Generate a replacement bank with suitable rights for commercial releases. [ElevenLabs publication guidance](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform).

The 24 successful requests billed **2,160 credits**, confirmed against both response headers and the account's usage change. **7,840 of the initial 10,000 credits remained.** No upgrade or paid extension was enabled. The script reserved 9,120 conservatively, including two rejected overlength prompts before the 450-character check was added. A reservation is not a claim of a charge.

## Reproduce or replace the bank

Keep `ELEVENLABS_API_KEY` only in an ignored local `.env` or server shell. Generation is a separate offline operation. The published site does not need that credential.

```sh
npm run generate:audience -- --count 24
# Executes only with an explicit budget and an accurate license statement:
npm run generate:audience -- --execute --count 24 --max-credits 10000 --license "Your actual output-use terms"
```

The dry run makes no requests. Execution uses sequential calls, no automatic retries, and a durable private credit ledger that reserves each request before sending it. A timeout may still be billed, so a restart does not reset the bank's credit budget. The estimate remains 40 credits per requested second as documented by the [API overview](https://elevenlabs.io/docs/overview/capabilities/sound-effects); actual response billing may differ. The generated prompt is validated against the [450-character limit](https://help.elevenlabs.io/hc/en-us/articles/25735182995985-What-is-Sound-Effects).

Private `artifacts/audience-bank` retains original prompts, output hashes, actual billing, approval flags and the reservation ledger. After reviewing desired files and their use terms, mark the selected clips approved and run:

```sh
npm run promote:audience -- --public-license "Accurate public audio-use statement"
```

Promotion verifies hashes, strips private prompts/billing, publishes only approved files, and removes revoked public clips. The browser accepts only same-origin files, validates SHA-256, and rejects oversized or invalid decoded audio.

## Verification and limits

All 24 files have distinct SHA-256 hashes, decode successfully, and have the requested duration and supported channel count. Browser tests render the real recordings through Web Audio and check crossfades, gain limits, silence, reaction spacing, failed-start cleanup, and crowd playback before delayed instrument loading with zero notes scheduled. No model calls are needed for playback verification.

This release received technical playback validation, **not human listening approval**. The generation prompts explicitly exclude music, instruments, singing and intelligible speech; that semantic content is not independently certified by file/level tests. A human audition remains useful for selecting favorite takes or rejecting an odd model artifact.
