# CarBox specs DB — build log

Schema: see `SCHEMA.md`. Target: ~3,000–4,000 web-verified trim configs, US-market, MY 2010–present.
Decision: used the richer DB schema (adds `torque`, `transmission`, split `accel0to60` in mph, `extendedSpecs`) over the app's existing 5-field display shape, because the Upgrades mod engine needs torque/transmission. Mapping documented in SCHEMA.md.

Tier 1 order: Honda, Toyota, Ford, Chevrolet, BMW, Mercedes-Benz, Audi, Volkswagen, Nissan, Subaru, Mazda, Hyundai, Kia, Lexus, Porsche, Jeep, Mini, Volvo, Mitsubishi, Tesla.
Tier 2 (if budget): Acura, Infiniti, Genesis, Dodge, Chrysler.
Skipped by scope: GMC, Ram, Buick, Cadillac, Lincoln, low-volume/fleet/rebadge.

| Brand | Models covered | Entries | Unverified fields | Status |
|-------|----------------|---------|-------------------|--------|
| _none saved_ | — | 0 | — | attempt 1 failed (see below) |

## Attempt 1 (2026-07-21) — FAILED, 0 entries saved
Strategy: launched 10 parallel per-brand research agents (Honda, Toyota, Ford, Chevrolet, BMW, Mercedes-Benz, Audi, Volkswagen, Nissan, Subaru).
What went wrong: each brand agent **re-delegated** its brand into 4–6 nested research sub-agents (~50–60 agents total). They DID gather real verified specs in their transcripts, but before any agent compiled its `<brand>.json`, the run exhausted the **WebSearch budget (200/200)** and then hit the **account session limit** (resets ~11:50pm America/New_York, 2026-07-21). Every agent terminated; **no brand JSON files were written**; the scattered sub-agent transcripts were not compiled and are not practically recoverable.
Root cause: the per-agent prompts did not hard-prohibit further delegation, so a job meant for one agent exploded into a fan-out that blew the shared web-tool + session budget.

## Corrected plan for attempt 2 (after the limit resets)
- Do NOT use nested delegation. Either (a) build brands sequentially in the main thread with WebSearch/WebFetch, committing each `<brand>.json` as it's finished, or (b) launch at most a few agents at once, each with an ironclad "do the research YOURSELF, never spawn any agents; if you cannot verify a figure, null it" rule and a smaller per-agent scope.
- Throttle to stay under the WebSearch budget; one search per generation.
- Save + git-commit each brand file immediately so progress survives.
