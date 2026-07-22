# CarBox vehicle specs database — schema (authoritative)

Every brand file `app/data/specs/<brand>.json` is a JSON object:

```json
{
  "brand": "Honda",
  "entryCount": 0,
  "unverifiedFields": 0,
  "models": ["Civic", "Accord", "..."],
  "sources": ["edmunds.com", "caranddriver.com", "..."],
  "entries": [ /* array of entry objects, schema below */ ]
}
```

Each **entry** = one meaningfully-distinct trim of one generation:

```json
{
  "make": "Honda",
  "model": "Civic",
  "generation": "9th gen (FB/FG)",
  "yearStart": 2012,
  "yearEnd": 2015,
  "trim": "LX",
  "specs": {
    "engine": "1.8L I4",
    "horsepower": "140 hp @ 6500 rpm",
    "torque": "128 lb-ft @ 4300 rpm",
    "transmission": "5-speed manual",
    "drivetrain": "FWD",
    "accel0to60": "8.6 s"
  },
  "extendedSpecs": {
    "curbWeight": "2765 lb",
    "tires": "P195/65R15",
    "suspension": "MacPherson strut front / multi-link rear"
  },
  "source": "https://www.edmunds.com/honda/civic/2012/"
}
```

## Rules (NON-NEGOTIABLE)
1. **Core 6 required** (`engine, horsepower, torque, transmission, drivetrain, accel0to60`). Fill every one you can verify. `accel0to60` is 0–60 **mph** in seconds (US standard).
2. **Extended 3 optional** (`curbWeight, tires, suspension`). Include when found; never block an entry on them.
3. **Never write a spec from memory.** Web-verify each generation/trim lineup against a reputable source (manufacturer spec sheet, Edmunds, Car and Driver, U.S. News, MotorTrend, automobile-catalog, mycarspecs). One good search usually covers a whole generation's trim spread.
4. **If a figure can't be verified, store `null`** for that field and count it in `unverifiedFields`. A missing field is fine; a wrong one is not. Accuracy > completeness.
5. **Record a `source`** (URL or site name) on every entry.
6. Coverage: US-market mainstream models, model years **2010–present**, split by **generation**, and within each generation every trim with a **meaningfully different engine / power output** gets its own entry (e.g. Civic LX vs Si vs Type R). Do **not** collapse distinct trims; do **not** pad near-duplicates.

## Mapping back to the app
The onboarding/Garage display shape is `{engine, horsepower, drivetrain, accel, tire}`. It maps from this DB as: `engine→engine`, `horsepower→horsepower`, `drivetrain→drivetrain`, `accel0to60→accel`, `extendedSpecs.tires→tire`. The DB is richer on purpose (adds torque + transmission for the Upgrades mod engine). Wiring is a later task.
