# Product Description: Car Build & Maintenance Logbook

*(Working name — pick something like "Garaged," "Shopbook," "Wrench," "Buildfolio," or "Logbook" — leaving that open for now.)*

## What it is
A web/mobile app where car enthusiasts, modifiers, and project-car owners log every maintenance job, modification, part, and cost tied to their vehicle(s) — replacing the spreadsheets, notebooks, and phone-photo folders they currently use — and can optionally publish a clean, shareable public "garage" page for each car, similar to how Letterboxd gives a film a profile or Strava gives a run a shareable activity page.

## The problem it solves
Car enthusiasts who do their own maintenance or modify their vehicles need to track: what part they installed, when, what it cost, what the part number/brand was, mileage at time of install, and often photos/receipts — because they need this later for warranty claims, resale value, remembering torque specs or install notes, and because other enthusiasts genuinely want to see "what's on your car." Right now this lives in a mess of Google Sheets, paper binders, whiteboards in the garage, or scattered phone photos with no structure. People in enthusiast forums actively ask each other for spreadsheet templates and complain that existing apps are either too narrow (fuel-economy trackers like Fuelly) or too generic (basic note-taking apps) to capture a real build log. There is no dominant, well-designed tool that owns this specific behavior the way Strava owns "log a run" or Letterboxd owns "log a film."

## Who it's for
- **Primary:** Car enthusiasts and DIY modifiers who own project cars, track cars, or daily-driven builds and actively maintain/modify them (oil changes, brake jobs, suspension, engine mods, cosmetic mods).
- **Secondary:** Multi-vehicle owners who just want organized maintenance records for resale value and warranty purposes, without necessarily being "into mods."
- **Tertiary/viral layer:** People who browse other users' public garages for inspiration — the way people browse build threads on forums like NASIOC, Garage Journal, or model-specific subreddits today.

## Core user action (the daily/weekly habit)
Logging an entry to a vehicle's timeline: a maintenance task, a part installed, a repair, or a modification — each with date, mileage, cost, photos, notes, and (optionally) the specific part/brand used. This single repeatable action is the heart of the product, the same way "log a flight" is the heart of a pilot logbook or "log a film" is the heart of Letterboxd.

## Core features (MVP)
1. **Vehicle profiles** — add one or more vehicles (year/make/model/trim, VIN optional, current mileage, photo).
2. **Timeline/logbook per vehicle** — chronological feed of every entry: maintenance, repair, or modification. Each entry has: title, category (maintenance/mod/repair/cosmetic), date, mileage, cost, notes, photos, and optionally a part name/brand/part number.
3. **Cost tracking & totals** — running total spent per vehicle, breakdown by category (maintenance vs. mods), so an owner can see "I've put $4,200 into this car."
4. **Reminders/service intervals** — set a reminder for the next oil change, brake fluid flush, etc. based on mileage or date.
5. **Photo storage** — attach before/after photos to any entry; build a visual history of the car.
6. **Public "garage" page** — an optional, shareable public profile per vehicle (like a build-thread replacement) showing the car's specs, photos, and (if the owner chooses) the full mod/maintenance history — link-shareable to forums, Instagram, Reddit, etc.

## Features to add after initial traction (the "moat" layer)
- **Shared parts/mod database keyed by make/model** — as users log parts, the app builds a crowd-sourced database of "what parts fit and work well on a 2015 WRX," which becomes genuinely useful to the next person with that car (this is the network-effect layer that turns it from a personal tool into a platform).
- **Community/discovery** — browse public garages by make/model, follow other builders, "like" or comment on garages (kept light-touch, not a full social network, to avoid feature bloat).
- **Export/reports** — generate a PDF maintenance history for resale listings or warranty disputes.
- **VIN decode / auto-fill** — pull vehicle specs automatically from a VIN.

## Why existing tools don't solve this
- **Fuelly** and similar apps focus almost entirely on fuel economy/mileage tracking, not a full build/maintenance/mod log.
- **CarFax-style tools** are for pre-purchase vehicle history reports, not an owner's ongoing personal log.
- **Generic note apps / spreadsheets** work but have no structure, no reminders, no cost rollups, no photos-attached-to-entries, and nothing shareable.
- **Forum build threads** (the current de facto standard on sites like Garage Journal, NASIOC, model-specific subreddits) are unstructured, hard to search, and not owned by the user — if the forum goes down or the thread gets buried, the history is gone.

## Differentiation / unique angle
The combination of (1) structured logging with cost/mileage tracking, (2) a genuinely well-designed public garage page as the shareable/viral hook, and (3) a future shared parts database that makes the product smarter with more users — no single existing tool does all three. The public garage page in particular is the "Letterboxd profile" equivalent: something people will want to share because it looks good, not just because it's functional.

## Suggested tech approach
- Frontend: React + TypeScript, Tailwind for styling.
- Backend/data: Supabase (Postgres, auth, row-level security for private vs. public vehicles, storage for photos).
- Keep the MVP narrow: vehicle profiles + timeline logging + public garage page + basic reminders. Resist adding social features, VIN decoding, or the shared parts database until there's a real base of active loggers — those are stage-two moat features, not stage-one requirements.

## Target initial audience for launch/validation
Enthusiast communities where this exact pain has already been expressed: r/cars, r/JDM, r/Trucks, marque-specific forums and subreddits (WRX, Miata, Jeep, truck communities), and Garage Journal. These are the people already maintaining spreadsheets for this purpose today — the most direct signal of product-market fit.
