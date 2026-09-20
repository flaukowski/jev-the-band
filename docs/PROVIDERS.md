# Jev provider compatibility

Updated 2026-09-20. The application and shared contracts are TypeScript. The request for “typescript api” was interpreted as **TypeSafe's direct API**, given the accompanying TypeSafe key request. Both direct TypeSafe and OpenRouter's dedicated Decisions API are supported; neither is routed through chat completions.

| Configuration | Direct TypeSafe | OpenRouter |
|---|---|---|
| `JEV_PROVIDER` | `typesafe` | `openrouter` |
| Server credential | `TYPESAFE_API_KEY` | `OPENROUTER_API_KEY` |
| Endpoint | `https://api.typesafe.ai/v1/systemone` | `https://openrouter.ai/api/alpha/decisions` |
| Model override | `TYPESAFE_MODEL` | `OPENROUTER_JEV_MODEL` |
| Default pin | `jev-1.13.0` | `typesafe/jev-1.13` |

`auto` prefers a configured TypeSafe key, otherwise OpenRouter. An explicitly selected provider never borrows the other provider's key, retries against it, or silently fails over. Legacy `JEV_MODEL` remains a fallback override, and the two known 1.13 spellings translate when switching providers. Unknown IDs still require the correct provider namespace.

`server/provider.ts` owns server-only credential selection. `server/jev.ts` sends the same typed `state`, `model` and `questions` body through the selected transport. The existing strict answer validation, confidence checks, deadline cancellation, request budget and probability sampling apply to both. Traces record provider, endpoint, response model and returned token usage; no authorization header is serialized. A provider without a reported dollar cost has `cost: null`, never an invented estimate.

The optional sonic director is a separate structured chat request to OpenRouter, defaulting to `openai/gpt-5.6-luna`. It always uses `OPENROUTER_API_KEY`. A TypeSafe-only installation composes from the raw user prompt and makes no director request; it does not send a TypeSafe key to OpenRouter. Add a dedicated OpenRouter credential to retain the Luna concept layer in production.

`tests/provider.test.ts` covers selection, endpoint/body/header compatibility, provenance, no credential crossover, failure without failover, and a direct-provider room's opening/notes/rigs/lights. These are mocked transport tests. On 2026-09-20, five real TypeSafe smoke calls passed (93 validated answers, 482–598 ms), followed by a hosted 98-call live performance with all traces accepted as Jev. The API did not report dollar cost. Earlier real OpenRouter verification is recorded in `VERIFICATION.md`. Use `npm run smoke:live` for an explicit five-call live check after configuration.

Official references checked 2026-09-20: [TypeSafe HTTP API](https://docs.typesafe.ai/api), [models](https://docs.typesafe.ai/models), [JavaScript/TypeScript SDK](https://docs.typesafe.ai/sdk/javascript), [OpenRouter Decisions endpoint](https://openrouter.ai/api/alpha/decisions). Direct typed HTTP avoids an extra SDK and preserves the application's explicit timeout/no-retry policy.
