# Audience sound

Implemented 2026-09-20. The audience is a separate quiet stereo bus. It never writes notes, changes the players' plans, uploads microphone audio, or creates a model request in an audience browser.

## What is available now

The built-in fallback is **procedural room noise and soft synthesized handclaps**, not recordings, speech synthesis, or an audio generation model. Its UI label says so. There are no generated audience recordings in this checkout: no callable audio-generation tool or ElevenLabs, Stability, fal, or Replicate credential was available in this task. Only credential presence was checked. No new service was purchased and no paid audio generation ran.

`src/audience.ts` plays either the fallback or a reviewed local sample bank. Beds crossfade over up to 2.5 seconds, with seeded clip selection and avoidance of the previous generated clip when alternatives are ready. Reactions are separate brief events, with 22–46 seconds between them even if the mood remains celebratory. Sample gain ramps avoid abrupt entrances. The fallback has no human cheers: its `cheering` mood uses the same restrained handclap texture until generated reaction samples are installed.

Decoded clips are calibrated toward 0.1 RMS (-20 dBFS), independently capped at 0.5 peak (-6 dBFS). The audience bus defaults to -24 dB attenuation. Its absolute maximum is -12 dB even with a listener boost; normal playback is intentionally well behind the music. Global mix processing still provides the final output protection. These bounds are engineering limits, not listening approval of an eventual generated recording.

## Model research

**ElevenLabs Sound Effects v2 is the implemented generation adapter.** Its API accepts a text description, explicit 0.5–30 second duration, prompt influence and a seamless-loop option. Authentication is a server-side `xi-api-key`; the script requests MP3. This is a sound-effects model rather than a music generator, which fits crowd-only beds and responses. [API reference](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert).

The API overview lists **40 credits per second when duration is explicit**. The website's generation-based pricing presentation is different, so the script uses the duration-based figure as a conservative estimate and does not claim an exact dollar cost. A three-clip audition (12 + 12 + 6 seconds) estimates **1,200 credits**. The proposed 100-clip bank (60 twelve-second beds and 40 six-second responses) estimates **38,400 credits**. Billing and plan rates should be checked in the actual account before execution. [Sound-effects overview](https://elevenlabs.io/docs/overview/capabilities/sound-effects), [sound-effects pricing](https://elevenlabs.io/sound-effects).

ElevenLabs says its free plan lacks commercial rights; paid non-beta outputs have commercial rights subject to its terms. That does not automatically apply the repository's MIT license to downloadable generated audio. Record the actual account/license grant and confirm raw asset redistribution before shipping the recordings in an open-source repository. The generator requires a license description and leaves every new clip unapproved. [Provider publication guidance](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform).

**Alternative: Stable Audio.** Stability's hosted pricing lists Audio 2.5 at 20 credits, where one credit is $0.01, or $0.20 per generation at that listed rate. Its current open model family also includes a small SFX model intended for local inference. Local generation would avoid a per-clip API fee but requires a model/runtime install and compliance with the applicable model license; the Community License has an annual-revenue threshold. Neither route was installed, benchmarked, or billed here. [Hosted pricing](https://platform.stability.ai/pricing), [official model repository](https://github.com/Stability-AI/stable-audio-3), [model license](https://stability.ai/license).

## Generate and review a bank

The script is **dry-run by default**, can make at most 100 calls, uses sequential requests, and never retries a failed/uncertain paid request. It records the provider's `character-cost` when returned and stops before another call would exceed the credit estimate. This is an application estimate, not a provider-enforced billing ceiling: an unexpectedly expensive completed request cannot be undone. First review a small audition. The credential belongs only in a server shell or the ignored `.env`, never a `VITE_` variable.

```powershell
# Shows three prompts and the estimated credit bound; no credential required and no HTTP calls.
npx tsx scripts/generate-audience.ts --count 3

# After ELEVENLABS_API_KEY is configured and the account's actual license is known:
npx tsx scripts/generate-audience.ts --execute --count 3 --max-credits 1200 --license 'Describe the actual paid account output and redistribution grant here'

# Preview the complete proposed bank without generating it:
npx tsx scripts/generate-audience.ts --count 100
```

The script writes `public/audience/<id>.mp3` and `public/audience/manifest.json`, retaining each prompt, provider, model, requested duration, license description, file hash and review flag. The 100-item limit applies to the whole bank, including existing samples. A partial batch remains documented after failure. New clips have `approved: false`; listen for accidental music, intelligible foreground speech, shrieks, odd cuts and level problems, confirm the redistribution grant, then set the accepted clips to `approved: true` in the manifest. Rejected clips remain inactive. Do not relabel synthetic fallback as model output.

The browser accepts only same-origin `/audience/` asset paths, validates the manifest, verifies each file's SHA-256, rejects oversized clips, limits two downloads concurrently, and retains up to twelve decoded clips. It falls back explicitly when a clip or bank is missing or invalid. There is no runtime call to ElevenLabs or any generation provider.

## Integration contract

```ts
import { AudiencePlayer } from './audience';
import { defaultAudienceControls, defaultAudienceDirection } from '../shared/audience';

// Destination should be the band mix input, before the existing master compression/limiter.
const audience = new AudiencePlayer(audioContext, mixInput);
await audience.loadBank(); // optional; missing bank keeps the procedural fallback
audience.setControls(defaultAudienceControls());
audience.setDirection(defaultAudienceDirection());
audience.start(room.id);
audience.tick(); // call from the existing 25–250 ms audio scheduler
audience.setDirection(frame.engineerMix.audience, frameAudioTime);
audience.stop(); // graceful fade on room stop; start again for another room
audience.dispose(); // disconnects only its nodes; never closes the band's AudioContext
```

- `AudienceDirection`: `{ mood, levelDb }`. Mood is `quiet`, `listening`, `grooving`, `applause`, or `cheering`. `levelDb` is absolute bus attenuation from -48 to -12; default -24. `quiet` silences the bus regardless of level.
- `AudienceControls`: `{ enabled, levelDb, reactions }`. Defaults are true / 0 / true. This level is a listener trim from -48 to +6 dB, with the absolute -12 dB ceiling retained. Turning off reactions preserves ambience. Turning off the audience fades the whole bus.
- `status` exposes `source`, `label`, ready/approved sample counts, active state and a safe error message. Display `label` to distinguish generated recordings from procedural sound. `referenceLevel()` provides post-audience-bus RMS/peak if needed, independently of the four instrument meters.
- Add audience mood and absolute level to **the existing shared Patch request**, not another Jev agent per listener. Patch should classify only performed musical context: attentive silence during space, groove ambience under music, restrained applause after a heard solo ending/release. A solo status label alone is not a completed musical payoff. Retain the last accepted direction when Patch has no fresh evidence.
- Manual master mode can set mood/level without changing the band. Per-listener audience enable, reactions and trim remain local. No audience sound should feed the musicians' symbolic peer-note context.

The shared control decision is consistent across viewers; waveform alignment is not a synchronized broadcast guarantee. Browser joining times, decode availability and local controls can change which texture is currently heard. A future server-rendered stream could make crowd waveforms identical across clients.

## Verification

Audience unit tests exercise gain limits, true quiet/mute, deterministic but varied stereo fallback, peak calibration, bad sample values, local-path/provenance validation, duplicate/oversized manifests, and the bounded 100-clip plan. A standalone browser harness renders actual Web Audio crossfades, reacts, fades to silence, verifies shared-context ownership, and ensures unreviewed clips are never downloaded. These checks do not replace a human audition of real generated crowd samples, which are not present yet.
