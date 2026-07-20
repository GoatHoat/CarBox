/* CarBox state store — single source of truth, persisted under "carbox.v1".
   Pages hydrate from this on load so HTML and store never disagree. */
window.CarBox = (function () {
  var KEY = 'carbox.v1';
  var SEED_IDS = { e1: 1, e2: 1, e3: 1, e4: 1 };

  var DEFAULTS = {
    vehicle: { name: 'Bugatti Chiron', year: 2026, mileage: 82410 },
    specs: [
      '8.0L quad-turbo W16',
      '1,479 hp (1,500 PS); Super Sport: 1,578 hp',
      '7-speed Ricardo dual-clutch gearbox',
      'Double wishbone suspension',
      'Michelin Cup tires',
      '0-100 km/h: ~2.4 s'
    ],
    entries: [
      { id: 'e1', type: 'mod', title: 'Titanium exhaust install', cost: 12400, miles: 81900, date: 'Jun 30, 2026',
        notes: 'Akrapovic full system. Torqued manifold bolts to 22 Nm. Sourced from EuroParts — part #AK-CH-77.',
        part: 'Akrapovic Evolution', shop: 'Apex Performance' },
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
    stats: { baseInvested: 48200, baseCount: 31 }, /* totals shown on Log; seeds are part of these */
    likes: 412,
    liked: false,
    goal: 'More power',
    planItems: [],
    notifications: [
      { id: 'oil', text: 'Oil change due in 400 mi', unread: true }
    ],
    comments: [
      { user: '@TurboTom', text: 'That exhaust note must be insane.' },
      { user: '@LinaDrives', text: 'Cleanest Chiron build on here, easily.' },
      { user: '@BoostedBen', text: 'What tune are you running for stage 1?' }
    ],
    nextService: { title: 'Oil change', due: 82800 },
    units: 'mi',
    reminders: true,
    notifsOn: true
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function load() {
    var state = clone(DEFAULTS);
    try {
      var raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach(function (k) { state[k] = raw[k]; });
      }
    } catch (e) { /* corrupted storage: fall back to defaults */ }
    /* migrate entries saved by the pre-store add-entry sheet */
    try {
      var legacy = JSON.parse(localStorage.getItem('carbox_entries'));
      if (legacy && legacy.length) {
        legacy.forEach(function (entry, i) {
          entry.id = 'u' + Date.now().toString(36) + i;
          state.entries.unshift(entry);
        });
        localStorage.removeItem('carbox_entries');
      }
    } catch (e) { /* ignore */ }
    return state;
  }

  var state = load();
  var subs = [];
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
  }
  save();

  function get(key) { return clone(state[key]); }
  function set(key, value) {
    state[key] = clone(value);
    save();
    subs.forEach(function (fn) { try { fn(key, clone(value)); } catch (e) {} });
  }
  function subscribe(fn) { subs.push(fn); }

  /* ── formatting helpers (units-aware) ── */
  function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function toUnits(mi) { return state.units === 'km' ? Math.round(mi * 1.60934) : mi; }
  function fmtMiles(mi) {
    return toUnits(mi).toLocaleString('en-US') + ' ' + state.units;
  }
  function isSeed(id) { return !!SEED_IDS[id]; }
  /* invested/count totals = seeded base + anything added on top of the seeds */
  function totals() {
    var invested = state.stats.baseInvested, count = state.stats.baseCount;
    state.entries.forEach(function (entry) {
      if (!isSeed(entry.id)) { invested += entry.cost || 0; count += 1; }
    });
    return { invested: invested, count: count };
  }

  return {
    get: get, set: set, subscribe: subscribe,
    fmtMoney: fmtMoney, fmtMiles: fmtMiles, toUnits: toUnits,
    totals: totals, isSeed: isSeed
  };
})();
