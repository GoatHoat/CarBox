# CarBox specs DB — build log

Schema: see `SCHEMA.md`. Target: ~3,000–4,000 web-verified trim configs, US-market, MY 2010–present.
Decision: used the richer DB schema (adds `torque`, `transmission`, split `accel0to60` in mph, `extendedSpecs`) over the app's existing 5-field display shape, because the Upgrades mod engine needs torque/transmission. Mapping documented in SCHEMA.md.

Tier 1 order: Honda, Toyota, Ford, Chevrolet, BMW, Mercedes-Benz, Audi, Volkswagen, Nissan, Subaru, Mazda, Hyundai, Kia, Lexus, Porsche, Jeep, Mini, Volvo, Mitsubishi, Tesla.
Tier 2 (if budget): Acura, Infiniti, Genesis, Dodge, Chrysler.
Skipped by scope: GMC, Ram, Buick, Cadillac, Lincoln, low-volume/fleet/rebadge.

| Brand | Models covered | Entries | Unverified fields | Status |
|-------|----------------|---------|-------------------|--------|
| Honda | Civic, Accord, Crosstour, CR-V, Pilot, HR-V, Fit, Odyssey, Ridgeline, Insight, CR-Z, Passport, Clarity, Prologue (14) | 47 | 0 | ✅ complete |
| Toyota | Camry, Corolla, GR Corolla, RAV4, Tacoma, 4Runner, GR86, GR Supra, Tundra, Highlander, Prius, Sienna, Sequoia, Avalon, C-HR, Venza, Land Cruiser, Corolla Cross, Yaris, bZ4X, Mirai (21) | 68 | 14 (hybrid/EV torque n/a) | ✅ complete |
| Subaru | WRX/STI (incl. S209), BRZ, Forester, Outback, Crosstrek, Impreza, Legacy, Ascent (9) | 32 | 0 | ✅ complete |

Attempt 2 (2026-07-21, after limit reset) — main-thread, no delegation, one high-yield WebFetch per model from 0-60specs.com, compiled + validated + committed per brand. **Running total: 147 verified entries across 3 brands (44 models).** Nulls (14, all Toyota) are hybrid/EV torque figures the source didn't state — nulled per the rules, never invented. Honda/Toyota/Subaru now cover all mainstream US model lines 2010–present at generation+trim granularity (base-trim resolution; a couple of very-low-volume trims folded into their nearest engine variant).
Still TODO (per SCHEMA notes): extendedSpecs (curbWeight/tires/suspension) are null across all brands so far; the app-facing `tire` field maps from there. Next brands (enthusiast-priority): Mazda, Nissan, BMW, Porsche, then remaining Tier-1.

## Attempt 1 (2026-07-21) — FAILED, 0 entries saved
Strategy: launched 10 parallel per-brand research agents (Honda, Toyota, Ford, Chevrolet, BMW, Mercedes-Benz, Audi, Volkswagen, Nissan, Subaru).
What went wrong: each brand agent **re-delegated** its brand into 4–6 nested research sub-agents (~50–60 agents total). They DID gather real verified specs in their transcripts, but before any agent compiled its `<brand>.json`, the run exhausted the **WebSearch budget (200/200)** and then hit the **account session limit** (resets ~11:50pm America/New_York, 2026-07-21). Every agent terminated; **no brand JSON files were written**; the scattered sub-agent transcripts were not compiled and are not practically recoverable.
Root cause: the per-agent prompts did not hard-prohibit further delegation, so a job meant for one agent exploded into a fan-out that blew the shared web-tool + session budget.

## Corrected plan for attempt 2 (after the limit resets)
- Do NOT use nested delegation. Either (a) build brands sequentially in the main thread with WebSearch/WebFetch, committing each `<brand>.json` as it's finished, or (b) launch at most a few agents at once, each with an ironclad "do the research YOURSELF, never spawn any agents; if you cannot verify a figure, null it" rule and a smaller per-agent scope.
- Throttle to stay under the WebSearch budget; one search per generation.
- Save + git-commit each brand file immediately so progress survives.


## Progress snapshot (2026-07-21, attempt 2, main-thread)
| Brand | Models | Entries | Unverified core |
|-------|--------|---------|-----------------|
| BMW | 7 | 35 | 0 |
| Honda | 14 | 47 | 0 |
| Mazda | 5 | 19 | 0 |
| Nissan | 15 | 43 | 5 |
| Subaru | 9 | 32 | 0 |
| Tesla | 4 | 14 | 7 |
| Toyota | 21 | 68 | 14 |
| **TOTAL** | | **258** | **26** |

Of the 10 brands last requested (Nissan, BMW, Ford, Audi, Mercedes, Hyundai, Kia, Lexus, Jeep, Tesla): **Nissan, BMW, Tesla done**; Ford, Audi, Mercedes, Hyundai, Kia, Lexus, Jeep still to do (next session — capped by per-session web-fetch budget).
Known gaps to revisit: BMW 3-/5-Series non-M sedans (site 404); extendedSpecs (curbWeight/tires/suspension) null across all brands; Nissan GT-R 0-60 and several hybrid/EV torque + Tesla dual-motor hp are honest nulls.
