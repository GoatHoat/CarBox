/* prehydrate.js — SYNCHRONOUS, must be loaded WITHOUT `defer`.
   It runs during HTML parsing, before the deferred app scripts (state.js, ui.js
   and the heavy vendor/supabase.js) download and run. Pages call it from a tiny
   inline script right after their header markup so the REAL active car's name /
   year / mileage / sprite are painted immediately, instead of flashing the demo
   "Bugatti Chiron" that used to be baked into the static HTML on slow loads.
   state.js re-hydrates authoritatively a moment later; this only removes the
   flash. It mirrors just enough of state.js (active-car resolution + fmtMiles)
   and stays read-only. */
window.CBPre = (function () {
  function readState() {
    try { return JSON.parse(localStorage.getItem('carbox.v1')) || null; } catch (e) { return null; }
  }
  /* Mirror state.js load(): active = the car whose id === activeCarId, else
     cars[0]; a non-Pro (free/lapsed) user is restricted to the first car. */
  function activeCar() {
    var st = readState();
    if (!st || !Array.isArray(st.cars) || !st.cars.length) return null;
    var active = null;
    for (var i = 0; i < st.cars.length; i++) {
      if (st.cars[i] && st.cars[i].id === st.activeCarId) { active = st.cars[i]; break; }
    }
    if (!active) active = st.cars[0];
    if (!st.isPro && active !== st.cars[0]) active = st.cars[0];
    return active;
  }
  function activeVehicle() { var c = activeCar(); return c ? (c.vehicle || null) : null; }
  function activeAppearance() { var c = activeCar(); return c ? (c.appearance || null) : null; }

  /* match state.js fmtMiles: comma-grouped, mi/km per the units pref */
  function fmtMiles(mi) {
    if (typeof mi !== 'number') mi = 0;
    var st = readState();
    var units = (st && st.units) || 'mi';
    var v = units === 'km' ? Math.round(mi * 1.60934) : mi;
    return v.toLocaleString('en-US') + ' ' + units;
  }
  /* untinted body silhouette for the chosen preset — right shape, no color yet.
     UI.carSprite paints the tinted version once ui.js has loaded. */
  function spriteSrc(appearance) {
    var ap = appearance || activeAppearance();
    var id = (ap && ap.presetId) || 'body_suv';
    return 'assets/' + id + '.png';
  }
  /* set text ONLY when we have a real value, so a failed resolution never blanks
     out anything (the deferred hydrate will fill it a moment later). */
  function setText(sel, val) {
    var el = document.querySelector(sel);
    if (el && val != null && val !== '') el.textContent = String(val);
  }
  function setSrc(sel, src) {
    var el = document.querySelector(sel);
    if (el && src) el.src = src;
  }
  return {
    activeVehicle: activeVehicle, activeAppearance: activeAppearance,
    fmtMiles: fmtMiles, spriteSrc: spriteSrc, setText: setText, setSrc: setSrc
  };
})();
