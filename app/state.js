/* CarBox state store — single source of truth, persisted under "carbox.v1".
   Pages hydrate from this on load so HTML and store never disagree.

   MULTI-CAR (2026-07-22): all per-car data lives inside state.cars[], and
   state.activeCarId names the one currently shown. get/set on the legacy
   per-car keys (vehicle, car, entries, planItems, goal, nextService, stats,
   likes, liked, comments) TRANSPARENTLY route to the active car, so existing
   page code keeps working unchanged. Free users get 1 car, Pro up to 3. */
window.CarBox = (function () {
  var KEY = 'carbox.v1';
  var SEED_IDS = { e1: 1, e2: 1, e3: 1, e4: 1 };

  /* keys that live PER CAR. Legacy key 'car' maps to the car's `appearance`.
     `goalLocked` = the free one-time goal choice for this car has been used
     (changing the goal again requires CarBox Pro). */
  var PER_CAR = {
    vehicle: 'vehicle', car: 'appearance', entries: 'entries',
    planItems: 'planItems', goal: 'goal', goalLocked: 'goalLocked',
    budget: 'budget', nextService: 'nextService', stats: 'stats',
    likes: 'likes', liked: 'liked', comments: 'comments'
  };

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function uid(prefix) {
    return (prefix || 'car') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     SERVICE INTERVALS (Part C) — sensible approximations, NOT manufacturer-exact
     schedules. All the tuning lives in this one place so it is easy to adjust.
     ───────────────────────────────────────────────────────────────────────── */
  function computeServiceInterval(vehicle) {
    var s = (vehicle && vehicle.specs) || {};
    var eng = String(s.engine || '').toLowerCase();
    var dt = String(s.drivetrain || '').toLowerCase();
    /* Electric: no oil. Advise tire rotation / brake inspection instead. */
    var isEV = /electric|\bev\b/.test(eng) || eng.indexOf('motor') >= 0 ||
      /electric/.test(dt) || (String(vehicle && vehicle.make).toLowerCase() === 'tesla');
    if (isEV) return { title: 'Tire rotation / brake inspection', interval: 7500 };
    /* Gas default 7,500 mi; shorten to 5,000 for boosted/high-output or older cars. */
    var boosted = /turbo|supercharg/.test(eng);
    var hp = parseInt(String(s.horsepower || '').replace(/[^0-9]/g, ''), 10) || 0;
    var year = (vehicle && vehicle.year) || 9999;
    var interval = (boosted || hp >= 400 || year < 2015) ? 5000 : 7500;
    return { title: 'Oil change', interval: interval };
  }

  /* Mileage is DERIVED: the car's odometer = max(baseMileage, highest entry
     mileage). So logging a higher-mileage entry raises it, and DELETING the
     entry that set it drops the odometer back down. baseMileage is the non-log
     floor (0 for a new garage, the seed value for the demo). */
  function recomputeMileage(car) {
    var v = car.vehicle || {};
    var maxE = 0;
    (car.entries || []).forEach(function (e) { if (typeof e.miles === 'number' && e.miles > maxE) maxE = e.miles; });
    if (v.baseMileage === undefined) {
      /* first time: if current odometer exceeds any entry, that excess is the floor */
      v.baseMileage = (typeof v.mileage === 'number' && v.mileage > maxE) ? v.mileage : 0;
    }
    v.mileage = Math.max(v.baseMileage || 0, maxE);
  }

  /* Anchor to the owner's actual last maintenance entry (highest-mileage 'maint'),
     else the current odometer (0 for a brand-new empty garage). */
  function computeNextService(car) {
    var v = car.vehicle || {};
    var ci = computeServiceInterval(v);
    var lastMaint = null;
    (car.entries || []).forEach(function (e) {
      if (e.type === 'maint' && typeof e.miles === 'number' && e.miles > 0) {
        if (lastMaint === null || e.miles > lastMaint) lastMaint = e.miles;
      }
    });
    var anchor = (lastMaint !== null) ? lastMaint : (v.mileage || 0);
    return { title: ci.title, due: anchor + ci.interval, interval: ci.interval };
  }

  /* ── demo car (matches the approved mockups: Bugatti Chiron, 4 entries) ── */
  function demoCar() {
    return {
      id: 'car-demo',
      vehicle: {
        name: 'Bugatti Chiron', make: 'Bugatti', model: 'Chiron', year: 2026, trim: '', mileage: 82410, baseMileage: 82410,
        specs: {
          engine: '8.0L quad-turbo W16', horsepower: '1,479 hp (1,500 PS)',
          torque: '1,180 lb-ft', transmission: '7-speed dual-clutch',
          drivetrain: 'AWD', accel: '0-60 mph: ~2.4 s'
        }
      },
      appearance: { presetId: 'sprite_chiron', hue: null, shade: 1 },
      entries: [
        { id: 'e1', type: 'mod', title: 'Titanium exhaust install', cost: 12400, miles: 81900, date: 'Jun 30, 2026',
          notes: 'Akrapovic full system. Torqued manifold bolts to 22 Nm. Sourced from EuroParts, part #AK-CH-77.',
          part: 'Akrapovic Evolution', shop: 'Apex Performance',
          photos: ['assets/photo_exhaust_1.jpg', 'assets/photo_exhaust_2.jpg', 'assets/photo_exhaust_3.jpg'] },
        { id: 'e2', type: 'maint', title: 'Oil change + inspection', cost: 620, miles: 80500, date: 'May 12, 2026',
          notes: 'Liqui Moly 5W-40, 9.2 L. Replaced drain plug washer, reset service indicator. All fluids topped.',
          part: 'Liqui Moly 5W-40', shop: 'Bugatti Service Center' },
        { id: 'e3', type: 'mod', title: 'Michelin Cup 2 tires', cost: 3800, miles: 79100, date: 'Apr 2, 2026',
          notes: 'Square setup. Cold pressures 32/30 psi. TPMS re-learned on the first drive.',
          part: 'Michelin Cup 2 R', shop: 'Apex Performance' },
        { id: 'e4', type: 'repair', title: 'Front sensor replacement', cost: 1150, miles: 78300, date: 'Feb 18, 2026',
          notes: 'Front collision sensor fault P2D11. Cleared after replacement and static calibration.',
          part: 'OEM radar sensor', shop: 'Bugatti Service Center' }
      ],
      planItems: [],
      goal: 'More power',
      goalLocked: false,
      budget: null,   /* {min, max} spend target for the goal; max null = no cap */
      nextService: { title: 'Oil change', due: 82800, interval: 5000 },
      stats: { baseInvested: 48200, baseCount: 31 },
      likes: 412, liked: false,
      comments: [
        { id: 'c1', user: '@TurboTom', text: 'That exhaust note must be insane.', reply: null },
        { id: 'c2', user: '@LinaDrives', text: 'Cleanest Chiron build on here, easily.', reply: null },
        { id: 'c3', user: '@BoostedBen', text: 'What tune are you running for stage 1?', reply: null }
      ]
    };
  }

  var DEFAULTS = {
    cars: [demoCar()],
    activeCarId: 'car-demo',
    profile: { name: 'Vojtech13', handle: '@Vojtech.Arkes' },
    account: null,          /* {firstName,lastName,email,password} — see onboarding note */
    birthday: null,         /* ISO yyyy-mm-dd */
    onboardingComplete: false,
    currency: 'USD',
    theme: 'system',
    isPro: false,
    /* Upgrades AI recs, cached per (car+goal); mappedMod = which rec's shops show.
       Kept top-level: the cache key already includes the car, so switching cars
       naturally invalidates it. */
    recs: null,
    mappedMod: null,
    locationGranted: false,
    location: null,
    /* notifications stay a single top-level list; service items carry a carId so
       the text can say which car they are for. (Service reminders are also
       COMPUTED live from each car's nextService — see index.html / log.html.) */
    notifications: [
      { id: 'n-c1', type: 'comment', ref: 'c1', carId: 'car-demo', user: '@TurboTom', text: 'That exhaust note must be insane.', unread: false },
      { id: 'n-c2', type: 'comment', ref: 'c2', carId: 'car-demo', user: '@LinaDrives', text: 'Cleanest Chiron build on here, easily.', unread: false },
      { id: 'n-c3', type: 'comment', ref: 'c3', carId: 'car-demo', user: '@BoostedBen', text: 'What tune are you running for stage 1?', unread: false }
    ],
    units: 'mi',
    reminders: true,
    notifsOn: true
  };

  /* ── migration: wrap a legacy flat single-car store into cars[0] ── */
  function migrateFlat(raw) {
    if (raw.cars || !(raw.vehicle || raw.entries || raw.car)) return raw;
    var car = {
      id: uid('car'),
      vehicle: raw.vehicle || clone(demoCar().vehicle),
      appearance: raw.car || { presetId: 'body_suv', hue: null, shade: 1 },
      entries: raw.entries || [],
      planItems: raw.planItems || [],
      goal: raw.goal || 'More power',
      goalLocked: !!raw.goalLocked,
      budget: raw.budget || null,
      nextService: raw.nextService || null,
      stats: raw.stats || { baseInvested: 0, baseCount: 0 },
      likes: typeof raw.likes === 'number' ? raw.likes : 0,
      liked: !!raw.liked,
      comments: raw.comments || []
    };
    if (car.vehicle && car.vehicle.trim === undefined) car.vehicle.trim = '';
    raw.cars = [car];
    raw.activeCarId = car.id;
    ['vehicle', 'car', 'entries', 'planItems', 'goal', 'nextService', 'stats', 'likes', 'liked', 'comments']
      .forEach(function (k) { delete raw[k]; });
    return raw;
  }

  function load() {
    var state = clone(DEFAULTS);
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* corrupted */ }
    if (raw && typeof raw === 'object') {
      raw = migrateFlat(raw);
      Object.keys(raw).forEach(function (k) { state[k] = raw[k]; });
    }
    /* guarantee a valid cars[] + activeCarId */
    if (!Array.isArray(state.cars) || !state.cars.length) {
      state.cars = [demoCar()]; state.activeCarId = state.cars[0].id;
    }
    state.cars.forEach(function (c) {
      if (!c.id) c.id = uid('car');
      if (!c.appearance) c.appearance = { presetId: 'body_suv', hue: null, shade: 1 };
      if (!Array.isArray(c.entries)) c.entries = [];
      if (!Array.isArray(c.planItems)) c.planItems = [];
      if (!Array.isArray(c.comments)) c.comments = [];
      if (!c.stats) c.stats = { baseInvested: 0, baseCount: 0 };
      if (typeof c.goalLocked !== 'boolean') c.goalLocked = false;
      if (c.budget === undefined) c.budget = null;
      if (c.vehicle && c.vehicle.trim === undefined) c.vehicle.trim = '';
    });
    if (!findCar(state, state.activeCarId)) state.activeCarId = state.cars[0].id;
    /* Pro lapse (Part B3): free/lapsed users can only use the first car. */
    if (!state.isPro && state.activeCarId !== state.cars[0].id) state.activeCarId = state.cars[0].id;

    /* legacy: entries saved by the pre-store add-entry sheet -> active car */
    try {
      var legacy = JSON.parse(localStorage.getItem('carbox_entries'));
      if (legacy && legacy.length) {
        var ac = findCar(state, state.activeCarId);
        legacy.forEach(function (entry, i) { entry.id = 'u' + Date.now().toString(36) + i; ac.entries.unshift(entry); });
        localStorage.removeItem('carbox_entries');
      }
    } catch (e) { /* ignore */ }

    /* derive odometer + advised service for each car from its own log */
    state.cars.forEach(function (c) { recomputeMileage(c); c.nextService = computeNextService(c); });
    return state;
  }

  function findCar(st, id) {
    for (var i = 0; i < st.cars.length; i++) if (st.cars[i].id === id) return st.cars[i];
    return null;
  }

  var state = load();
  var subs = [];
  function active() { return findCar(state, state.activeCarId) || state.cars[0]; }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* full/blocked */ }
  }
  save();

  function notify(key, value) { subs.forEach(function (fn) { try { fn(key, clone(value)); } catch (e) {} }); }

  function get(key) {
    if (PER_CAR.hasOwnProperty(key)) return clone(active()[PER_CAR[key]]);
    return clone(state[key]);
  }
  function set(key, value) {
    if (PER_CAR.hasOwnProperty(key)) {
      var car = active();
      car[PER_CAR[key]] = clone(value);
      /* keep odometer + advised service current whenever the log/car changes */
      if (key === 'entries' || key === 'vehicle') { recomputeMileage(car); car.nextService = computeNextService(car); }
    } else {
      state[key] = clone(value);
    }
    save();
    notify(key, value);
  }
  function subscribe(fn) { subs.push(fn); }

  /* ── multi-car helpers ── */
  function cars() { return clone(state.cars); }
  function activeCar() { return clone(active()); }
  function activeCarId() { return state.activeCarId; }
  function maxCars() { return state.isPro ? 3 : 1; }
  function setActiveCar(id) {
    var c = findCar(state, id);
    if (!c) return false;
    /* free/lapsed users may only switch to the primary car */
    if (!state.isPro && id !== state.cars[0].id) return false;
    state.activeCarId = id;
    save();
    notify('activeCarId', id);
    return true;
  }
  function addCar(carObj) {
    carObj = clone(carObj) || {};
    carObj.id = carObj.id || uid('car');
    if (!carObj.appearance) carObj.appearance = { presetId: 'body_suv', hue: null, shade: 1 };
    if (!Array.isArray(carObj.entries)) carObj.entries = [];
    if (!Array.isArray(carObj.planItems)) carObj.planItems = [];
    if (!Array.isArray(carObj.comments)) carObj.comments = [];
    if (!carObj.stats) carObj.stats = { baseInvested: 0, baseCount: 0 };
    if (typeof carObj.likes !== 'number') carObj.likes = 0;
    if (typeof carObj.liked !== 'boolean') carObj.liked = false;
    if (!carObj.goal) carObj.goal = 'More power';
    if (typeof carObj.goalLocked !== 'boolean') carObj.goalLocked = false;
    if (carObj.budget === undefined) carObj.budget = null;
    if (carObj.vehicle && carObj.vehicle.trim === undefined) carObj.vehicle.trim = '';
    carObj.nextService = computeNextService(carObj);
    state.cars.push(carObj);
    save();
    notify('cars', state.cars);
    return carObj.id;
  }
  function removeCar(id) {
    if (state.cars.length <= 1) return false;
    state.cars = state.cars.filter(function (c) { return c.id !== id; });
    if (state.activeCarId === id) state.activeCarId = state.cars[0].id;
    save();
    notify('cars', state.cars);
    return true;
  }

  /* ── formatting helpers (units/currency-aware) ── */
  var CUR_SYMBOL = { USD: '$', EUR: '€', GBP: '£' };
  function fmtMoney(n) {
    return (CUR_SYMBOL[state.currency] || '$') + Math.round(n).toLocaleString('en-US');
  }
  function toUnits(mi) { return state.units === 'km' ? Math.round(mi * 1.60934) : mi; }
  function fmtMiles(mi) {
    return toUnits(mi).toLocaleString('en-US') + ' ' + state.units;
  }
  function isSeed(id) { return !!SEED_IDS[id]; }
  /* invested/count totals for the ACTIVE car = seeded base + non-seed entries */
  function totals() {
    var car = active();
    var invested = car.stats.baseInvested, count = car.stats.baseCount;
    car.entries.forEach(function (entry) {
      if (!isSeed(entry.id)) { invested += entry.cost || 0; count += 1; }
    });
    return { invested: invested, count: count };
  }

  function requireOnboarding() {
    if (!state.onboardingComplete) { location.replace('onboarding.html'); return false; }
    return true;
  }

  return {
    get: get, set: set, subscribe: subscribe,
    reload: function () { state = load(); },
    requireOnboarding: requireOnboarding,
    fmtMoney: fmtMoney, fmtMiles: fmtMiles, toUnits: toUnits,
    totals: totals, isSeed: isSeed,
    /* multi-car API */
    cars: cars, activeCar: activeCar, activeCarId: activeCarId,
    setActiveCar: setActiveCar, addCar: addCar, removeCar: removeCar, maxCars: maxCars,
    /* service-interval helpers (also used by pages that surface reminders) */
    computeServiceInterval: computeServiceInterval, computeNextService: computeNextService
  };
})();
