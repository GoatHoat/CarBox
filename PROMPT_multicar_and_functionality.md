# CarBox — Claude Code build prompt: multi-car (paid) + real functionality pass

Read CLAUDE.md, README.md, app/state.js, app/ui.js, app/index.html, app/log.html,
app/upgrades.html, app/settings.html, app/onboarding.js and the /server folder FIRST.
Match the existing design system, state conventions, and motion rules exactly. Do not
restyle approved screens. Build the parts below in order. After each Part, save your work
and update CLAUDE.md's Status section. Stop for owner review when all parts are done.

════════════════════════════════════════════════════════════
PART A — Refactor state to be PER-CAR (foundation for everything else)
════════════════════════════════════════════════════════════
Today the store is single-car: top-level `vehicle`, `car` (appearance), `entries`,
`planItems`, `goal`, `nextService`, `stats`, `likes`, `liked`, `comments`. Multi-car
requires moving all of that to be per-car.

New shape in state.js:
    cars: [
      {
        id,                      // stable unique id
        vehicle: { name, make, model, year, trim, mileage, specs{...6...} },
        appearance: { presetId, hue, shade },
        entries: [...],
        planItems: [...],
        goal,
        nextService: {...},      // computed, see Part C
        stats: { baseInvested, baseCount },
        likes, liked, comments: [...]
      }
    ],
    activeCarId

- Add a MIGRATION in load(): if old flat single-car keys exist, wrap them into cars[0],
  generate an id, set activeCarId to it, and delete the old top-level keys. Existing users
  must not lose data.
- Add helpers: CarBox.activeCar() (returns the active car object), CarBox.setActiveCar(id),
  CarBox.addCar(carObj), CarBox.cars(), CarBox.maxCars() (returns 3 if isPro else 1),
  and make get/set for entries/goal/etc. operate on the ACTIVE car so existing page code
  keeps working with minimal changes. Update log.html, upgrades.html, index.html, and
  settings.html to read from the active car.
- Notifications stay a single top-level list but each service notification references a
  carId so the text can say which car it's for.

════════════════════════════════════════════════════════════
PART B — Multi-car UI (Pro-gated, up to 3 cars)
════════════════════════════════════════════════════════════
FREE users: app behaves exactly as it does now (1 car). No visible car switcher.
PRO users: can hold up to 3 cars and switch between them.

On the Garage screen (app/index.html), in the top-right icon stack (currently bell + gear),
add BELOW those, only when isPro:
- One small round button PER car the user has, each showing a tiny tinted pixel sprite of
  that car (use UI.carSprite / the sprite painter with that car's appearance). Tapping a car
  button sets it active and re-hydrates the whole app to that car (Garage, and when the user
  visits Log/Upgrades they show that car's data). Show a clear active/selected ring on the
  currently-active car button.
- BELOW the car buttons, a round "+" button.
  - PRO users under the 3-car cap: "+" opens the Add Car flow (Part B2).
  - Anyone at their cap (free user with 1 car, or pro user with 3): "+" opens the Pro
    paywall (free) or a small "You've reached 3 cars" toast (pro at max).

B2 — Add Car flow: a sheet (reuse UI.sheet + the exact car step from onboarding.js) asking:
    car brand (dropdown from CarBoxCars.brands()), model (dropdown), year (2010+ policy),
    and the full appearance customizer (5 presets + hue slider + mono swatches + darkness row),
    identical behavior to onboarding's Step 5. On confirm: look up specs via CarBoxCars.lookup,
    build the new car object with a fresh empty log (entries [], stats zeroed, goal default,
    nextService computed per Part C), push it via CarBox.addCar, set it active, close the sheet,
    and animate the new car button into the stack.

B3 — Pro lapse handling: if isPro becomes false while the user has 2–3 cars, DO NOT delete
    the extra cars. Keep their data, but lock switching so only the first/primary car is
    usable, and show the others as locked with a "Resubscribe to access" affordance. Restoring
    Pro unlocks them again.

════════════════════════════════════════════════════════════
PART C — Real service-interval / "next advised service" system
════════════════════════════════════════════════════════════
Replace the hardcoded `nextService: { title: 'First service', due: 5000 }` guess with a
computed, rules-based system. NO fabricated data.

C1 — Interval logic (put in a documented function computeServiceInterval(vehicle) in state.js
     or a new app/service.js):
     - Default gasoline oil-change interval: 7,500 mi.
     - Shorten to 5,000 mi if the car is turbocharged/supercharged or a performance trim
       (detect from vehicle.specs.engine text containing "turbo"/"supercharged", or high hp),
       or if model year < 2015 (older service schedules).
     - Electric vehicles (specs.engine indicates electric / drivetrain electric, e.g. Tesla):
       no oil change. Use a "Tire rotation / brake inspection" reminder at 7,500 mi instead of
       "Oil change".
     - Keep the mapping in ONE clearly-commented place so it's easy to tune. Add a short note
       that these are sensible approximations, not manufacturer-exact schedules.

C2 — Anchor to the user's ACTUAL last service:
     - Find the most recent maintenance-type entry (type 'maint') in the active car's log and
       take its mileage = lastServiceMileage. If none exists, anchor to the car's current
       mileage (or 0 for a brand-new empty garage).
     - nextService.due = lastServiceMileage + interval. nextService.title = the reminder name.
     - Recompute automatically whenever entries change or mileage is edited (subscribe to the
       store or recompute on hydrate).

C3 — Surface it everywhere it already appears, now driven by the computed value:
     - Garage top notification pill and the notifications sheet: "Oil change due in X mi"
       where X = due - currentMileage. If negative, show "Oil change overdue by X mi".
     - Log page "Next: <title> @ <due> mi" reminder.
     - When the user logs a new maintenance entry, the next-service recomputes and the reminder
       updates without a reload.
     - Respect the existing Settings "Service reminders" toggle (off = hide these reminders).

════════════════════════════════════════════════════════════
PART D — Garage completeness
════════════════════════════════════════════════════════════
- SHARE: today the share button copies a dead placeholder URL. Build a REAL public garage
  page: a new app/garage.html that renders a read-only public view of a car (sprite, name,
  year, specs, and the mod/maintenance timeline) from car data. Share should copy a link to
  this page for the active car. NOTE: truly public hosting (other people opening the link on
  their device) requires the backend in Part E; build garage.html so it works locally now and
  can be pointed at real hosted data later. Clearly comment this dependency.
- PHOTOS: the Add Entry sheet currently shows photo thumbnails but does NOT persist them
  (commented "previews only, not persisted"). Real photo storage requires the backend
  (Part E, cloud storage). For now: wire the photo picker so that once the backend/storage
  exists it uploads and stores a URL on the entry; until then keep previews but clearly label
  in code where the upload call goes. Do NOT fake persistence by bloating localStorage with
  base64.
- LIKES / COMMENTS: keep the current local behavior but structure the code so the like count
  and comments can be swapped to backend reads/writes (Part E) without a UI rewrite. Add a
  clear comment marking these as local-until-backend.

════════════════════════════════════════════════════════════
PART E — Enumerate what is NOT functional (build stubs + document, do not fake)
════════════════════════════════════════════════════════════
Add a short section to CLAUDE.md titled "Not yet real (needs backend/native)" listing, with
one line each on what's needed:
  - Accounts / auth / sync (no server; data is per-device localStorage today).
  - Photo storage (needs cloud storage).
  - Public garage pages viewable by other people (needs hosting + DB).
  - Real likes/comments/social (needs DB + auth).
  - Payments: the Pro paywall flips a local isPro flag; real iOS subscriptions need
    StoreKit / In-App Purchase, and "Restore purchases" must call StoreKit restore.
  - Multi-device: nothing syncs across devices without the backend.
Do not build fake versions of these; just leave clean, well-commented integration points.

════════════════════════════════════════════════════════════
General requirements
════════════════════════════════════════════════════════════
- Match colors, fonts, shadows, radii, dark-mode tokens, and the single easing family.
- Full prefers-reduced-motion fallbacks.
- Keep new persistent state consistent with state.js conventions and the carbox.v1 key.
- Update CLAUDE.md Status after each Part. Stop for owner browser review when all done.
