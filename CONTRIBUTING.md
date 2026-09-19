# Contributing

Read the original brief and decision log before changing musical or visual behavior. Describe the audible or visible effect of a proposal. Keep the provider adapter, score compiler, audio scheduler, and stage separate.

Run `npm ci`, `npm run check`, and browser tests for changes affecting the user experience. Live calls require an explicitly configured key and the separate `smoke:live` command; never put them in unattended CI.

Add focused tests for musical constraints, scheduling, response validation, and failure behavior. Do not label procedural decisions as Jev, fabricate model reasoning, or introduce undisclosed fallback providers. Keep keys and generated assets out of commits. Document third-party sample/model/asset licenses before adding any.

When taste decisions change, append a dated entry to `docs/DESIGN-DECISIONS.md`; do not edit the original user prompt.
