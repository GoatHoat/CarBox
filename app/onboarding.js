/* CarBox onboarding — 7-step signup flow, single page, JS step machine.
   Answers live in one in-memory object; NOTHING is written to the carbox.v1
   store until the user finishes step 6, when everything commits at once. */
document.addEventListener('DOMContentLoaded', function () {

  /* ─── CarBox age policy ────────────────────────────────────────────────
     16 is CarBox's OWN chosen minimum. Apple doesn't mandate a specific
     number, but whatever we set must be genuinely enforced (step 4 blocks
     under-age users), not merely asked. Change here to change the policy. */
  var MIN_AGE = 16;

  /* ─── SECURITY NOTE ────────────────────────────────────────────────────
     This prototype has NO backend. The password is kept only in local state
     for UI completeness — it is NOT hashed, NOT transmitted, NOT real auth,
     and must never be treated as secure. A real signup requires a proper
     backend auth service (hashing, tokens, transport security) before ship. */

  /* Make/model dropdowns AND the Garage's six specs both come from
     app/data/cars.js (window.CarBoxCars), which is generated from the verified
     specs DB in app/data/specs/. The user only picks from real DB entries, so a
     lookup should always resolve; this placeholder is a defensive fallback. */
  var PLACEHOLDER_SPECS = { engine: '', horsepower: '', torque: '', transmission: '', drivetrain: '', accel: '' };

  /* CarBox policy: model years 2010 and newer only (older years are declined). */
  var MIN_YEAR = 2010;

  /* single in-memory answer object; survives forward/back navigation.
     presetId/hue hold the car-appearance choices, committed with everything
     else at step 6 (default = the grey Chiron sprite, same as Settings). */
  var A = { firstName: '', lastName: '', email: '', password: '',
            username: '', tag: '', birthday: '', make: '', model: '', year: '',
            presetId: 'body_suv', hue: null, shade: 1 };

  var $ = function (id) { return document.getElementById(id); };
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var steps = Array.prototype.slice.call(document.querySelectorAll('.ostep'));
  var head = $('ob-head'), back = $('ob-back'), fill = $('ob-fill');
  var current = 1;

  /* ── theme: onboarding opens in LIGHT; moon/sun toggles it locally
     (does NOT persist to the store — that's set from Settings post-signup) ── */
  var themeBtn = $('ob-theme'), obTheme = 'light';
  function applyOb(t) {
    obTheme = t;
    if (window.UI && UI.applyTheme) UI.applyTheme(t);         /* also syncs native shell */
    else document.documentElement.setAttribute('data-theme', t);
    themeBtn.classList.toggle('is-dark', t === 'dark');
    themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
  applyOb('light');                                            /* re-assert after ui.js init */
  themeBtn.addEventListener('click', function () { applyOb(obTheme === 'dark' ? 'light' : 'dark'); });

  /* progress bar fills across steps 2..7 */
  function paintProgress() {
    var frac = current <= 1 ? 0 : Math.min(1, (current - 1) / 6);
    fill.style.width = (frac * 100) + '%';
  }

  function show(n, dir) {
    current = n;
    steps.forEach(function (s) {
      s.classList.remove('active', 'fwd', 'back');
      if (+s.getAttribute('data-step') === n) s.classList.add('active', reduced ? '' : dir);
    });
    head.hidden = (n === 1 || n === 7);
    paintProgress();
    window.scrollTo(0, 0);
  }
  back.addEventListener('click', function () { if (current > 1) show(current - 1, 'back'); });

  /* Enter advances a step when its Continue button is enabled */
  function enterAdvances(inputs, btn) {
    inputs.forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !btn.disabled) { e.preventDefault(); btn.click(); }
      });
    });
  }
  function markInvalid(field, on) { field.classList.toggle('invalid', on); }

  /* ─── Step 1: Welcome ─── */
  $('ob-start').addEventListener('click', function () { show(2, 'fwd'); });

  /* ─── Step 2: Account ─── */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var first = $('ob-first'), last = $('ob-last'), email = $('ob-email'), pass = $('ob-pass');
  var accErr = $('ob-acc-err'), accNext = $('ob-acc-next');
  function validAccount() {
    return first.value.trim() && last.value.trim() &&
      EMAIL_RE.test(email.value.trim()) && pass.value.length >= 8;
  }
  function refreshAccount() {
    var msgs = [];
    if (email.value && !EMAIL_RE.test(email.value.trim())) msgs.push('Enter a valid email address');
    if (pass.value && pass.value.length < 8) msgs.push('Password must be at least 8 characters');
    accErr.textContent = msgs[0] || '';
    accErr.classList.toggle('show', !!msgs.length);
    markInvalid(email.parentElement, !!email.value && !EMAIL_RE.test(email.value.trim()));
    markInvalid(pass.parentElement, !!pass.value && pass.value.length < 8);
    accNext.disabled = !validAccount();
  }
  [first, last, email, pass].forEach(function (inp) { inp.addEventListener('input', refreshAccount); });
  $('ob-pass-toggle').addEventListener('click', function () {
    var showing = pass.type === 'text';
    pass.type = showing ? 'password' : 'text';
    this.textContent = showing ? 'Show' : 'Hide';
  });
  enterAdvances([first, last, email, pass], accNext);
  accNext.addEventListener('click', function () {
    if (!validAccount()) return;
    A.firstName = first.value.trim(); A.lastName = last.value.trim();
    A.email = email.value.trim(); A.password = pass.value;
    show(3, 'fwd');
  });

  /* ─── Step 3: Username & tag ─── */
  var USER_RE = /^[A-Za-z0-9_]{3,20}$/;
  var user = $('ob-user'), tag = $('ob-tag');
  var userErr = $('ob-user-err'), userNext = $('ob-user-next');
  var pvName = $('ob-pv-name'), pvTag = $('ob-pv-tag');
  function validUser() {
    return USER_RE.test(user.value.trim()) && /^[A-Za-z0-9_.]{2,20}$/.test(tag.value.trim());
  }
  function refreshUser() {
    tag.value = tag.value.replace(/[^A-Za-z0-9_.]/g, '');
    pvName.textContent = user.value.trim() || 'yourname';
    pvTag.textContent = '@' + (tag.value.trim() || 'yourtag');
    var msg = '';
    if (user.value && !USER_RE.test(user.value.trim())) msg = '3–20 letters, numbers or underscores';
    userErr.textContent = msg;
    userErr.classList.toggle('show', !!msg);
    markInvalid(user.parentElement, !!user.value && !USER_RE.test(user.value.trim()));
    userNext.disabled = !validUser();
  }
  [user, tag].forEach(function (inp) { inp.addEventListener('input', refreshUser); });
  enterAdvances([user, tag], userNext);
  userNext.addEventListener('click', function () {
    if (!validUser()) return;
    A.username = user.value.trim(); A.tag = tag.value.trim();
    show(4, 'fwd');
  });

  /* ─── Step 4: Birthday (enforces MIN_AGE) ─── */
  var bday = $('ob-bday'), bdayErr = $('ob-bday-err'), bdayNext = $('ob-bday-next');
  bday.max = new Date().toISOString().slice(0, 10);
  function ageFrom(iso) {
    var b = new Date(iso + 'T00:00:00'), now = new Date();
    var age = now.getFullYear() - b.getFullYear();
    var m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
  }
  function refreshBday() {
    var ok = !!bday.value;
    bdayNext.disabled = !ok;
    if (bday.value && ageFrom(bday.value) < MIN_AGE) { /* recheck live but block on continue */ }
    bdayErr.classList.remove('show');
  }
  bday.addEventListener('input', refreshBday);
  bdayNext.addEventListener('click', function () {
    if (!bday.value) return;
    if (ageFrom(bday.value) < MIN_AGE) {
      bdayErr.textContent = 'You must be at least ' + MIN_AGE + ' to use CarBox';
      bdayErr.classList.add('show');
      markInvalid(bday.parentElement, true);
      return;
    }
    markInvalid(bday.parentElement, false);
    A.birthday = bday.value;
    show(5, 'fwd');
  });

  /* ─── Step 5: Car — make/model dropdowns from the specs DB + customizer ─── */
  var make = $('ob-make'), model = $('ob-model'), year = $('ob-year');
  var carErr = $('ob-car-err'), carNext = $('ob-car-next'), specNote = $('ob-specnote');
  var thisYear = new Date().getFullYear();
  year.min = MIN_YEAR; year.max = thisYear + 1;
  year.placeholder = String(Math.max(MIN_YEAR, thisYear - 4));

  /* makes: only brands present in the specs DB */
  CarBoxCars.brands().forEach(function (b) {
    var o = document.createElement('option'); o.value = b; o.textContent = b; make.appendChild(o);
  });
  function styleSelect(sel) { sel.classList.toggle('placeheld', !sel.value); }

  /* models: only models the chosen brand actually has in the DB */
  function fillModels() {
    model.innerHTML = '<option value="">Select model</option>';
    if (make.value) {
      CarBoxCars.models(make.value).forEach(function (m) {
        var o = document.createElement('option'); o.value = m; o.textContent = m; model.appendChild(o);
      });
      model.disabled = false;
    } else {
      model.disabled = true;
    }
    styleSelect(model);
  }

  function validCar() {
    var y = parseInt(year.value, 10);
    return !!(make.value && model.value && y >= MIN_YEAR && y <= thisYear + 1);
  }
  function refreshCar() {
    styleSelect(make); styleSelect(model);
    var y = parseInt(year.value, 10);
    var tooOld = !!year.value && y < MIN_YEAR;
    var badYear = !!year.value && (y < MIN_YEAR || y > thisYear + 1);
    markInvalid(year.parentElement, badYear);
    if (tooOld) {
      /* explicit decline for pre-2010 model years */
      specNote.className = 'ob-specnote show note';
      specNote.textContent = 'CarBox supports model years ' + MIN_YEAR + ' and newer.';
    } else if (make.value && model.value && y >= MIN_YEAR && y <= thisYear + 1) {
      var hit = CarBoxCars.lookup(make.value, model.value, y);
      specNote.className = 'ob-specnote show ' + (hit ? 'ok' : 'note');
      if (hit) {
        specNote.textContent = '✓ ' + [hit.specs.horsepower, hit.specs.engine, hit.trim]
          .filter(Boolean).join(' · ') + (hit.exact ? '' : ' (closest: ' + hit.yearStart + '–' + hit.yearEnd + ')');
      } else {
        specNote.textContent = 'We’ll add placeholder specs you can edit in your garage.';
      }
    } else {
      specNote.className = 'ob-specnote';
      specNote.textContent = '';
    }
    carErr.classList.remove('show');
    carNext.disabled = !validCar();
  }
  make.addEventListener('change', function () { fillModels(); refreshCar(); });
  model.addEventListener('change', refreshCar);
  year.addEventListener('input', refreshCar);
  fillModels();
  styleSelect(make);
  enterAdvances([year], carNext);

  /* ── appearance customizer — same behavior as Settings' My Car ── */
  var PRESETS = [
    { id: 'body_suv', label: 'SUV' },
    { id: 'body_suvcoupe', label: 'SUV coupe' },
    { id: 'body_coupe2', label: '2-door coupe' },
    { id: 'body_coupe4', label: '4-door coupe' },
    { id: 'body_sedan', label: 'Sedan' }
  ];
  var SHADES = [1, 0.82, 0.64, 0.47, 0.32];   /* darkness levels for the DARKNESS row */
  var preview = $('ob-carprev'), painter = null;
  function drawPreview() { if (painter) painter.paint(preview, A.hue, A.shade); }
  function loadBase(cb) {
    UI.spritePainter('assets/' + A.presetId + '.png', function (p) { painter = p; if (cb) cb(); });
  }
  function pulsePreview() { preview.classList.remove('pulse'); void preview.offsetWidth; preview.classList.add('pulse'); }

  var presetRow = $('ob-presetRow');
  PRESETS.forEach(function (p) {
    var tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'ob-presettile' + (p.id === A.presetId ? ' sel' : '');
    tile.setAttribute('aria-label', p.label);
    var img = document.createElement('img'); img.src = 'assets/' + p.id + '.png'; img.alt = '';
    tile.appendChild(img);
    tile.addEventListener('click', function () {
      A.presetId = p.id;
      presetRow.querySelectorAll('.ob-presettile').forEach(function (t) { t.classList.remove('sel'); });
      tile.classList.add('sel');
      loadBase(function () { drawPreview(); pulsePreview(); });
    });
    presetRow.appendChild(tile);
  });

  var slider = $('ob-hueSlider'), knob = $('ob-hueKnob');
  function paintKnob() {
    var isHue = typeof A.hue === 'number';
    knob.style.left = ((isHue ? A.hue : 0) / 360 * 100) + '%';
    knob.classList.toggle('off', !isHue);
    slider.setAttribute('aria-valuenow', String(Math.round(isHue ? A.hue : 0)));
  }
  var monoRow = $('ob-monoRow');
  function paintMono() {
    monoRow.querySelectorAll('.ob-monoswatch').forEach(function (sw, k) {
      sw.classList.toggle('sel', A.hue === 'mono-' + k);
    });
  }
  (function buildMono() {
    for (var k = 0; k < 8; k++) {
      var M = 0.08 + k * (0.92 - 0.08) / 7;
      var v = Math.round(M * 255);
      var sw = document.createElement('button');
      sw.type = 'button'; sw.className = 'ob-monoswatch';
      sw.style.background = 'rgb(' + v + ',' + v + ',' + v + ')';
      sw.setAttribute('aria-label', k === 0 ? 'Black' : k === 7 ? 'White' : 'Grey ' + k);
      (function (kk) {
        sw.addEventListener('click', function () {
          A.hue = 'mono-' + kk; paintKnob(); paintMono(); drawPreview(); pulsePreview();
        });
      })(k);
      monoRow.appendChild(sw);
    }
  })();
  /* DARKNESS row: darkens the chosen colour toward black (A.shade multiplier) */
  var shadeRow = $('ob-shadeRow');
  function paintShade() {
    shadeRow.querySelectorAll('.ob-monoswatch').forEach(function (sw, k) {
      sw.classList.toggle('sel', (A.shade || 1) === SHADES[k]);
    });
  }
  SHADES.forEach(function (s, k) {
    var sw = document.createElement('button');
    sw.type = 'button'; sw.className = 'ob-monoswatch';
    var v = Math.round(s * 200);
    sw.style.background = 'rgb(' + v + ',' + v + ',' + v + ')';
    sw.setAttribute('aria-label', k === 0 ? 'No darkening' : 'Darker level ' + k);
    sw.addEventListener('click', function () {
      A.shade = s; paintShade(); drawPreview(); pulsePreview();
    });
    shadeRow.appendChild(sw);
  });
  paintShade();

  var dragging = false, pendingHue = null, rafQueued = false;
  function hueFromEvent(e) {
    var r = slider.getBoundingClientRect();
    var x = Math.max(0, Math.min(r.width, e.clientX - r.left));
    return Math.round(x / r.width * 360);
  }
  function applyHue(h) { A.hue = h; paintKnob(); paintMono(); drawPreview(); }
  slider.addEventListener('pointerdown', function (e) {
    dragging = true; knob.classList.add('drag'); slider.setPointerCapture(e.pointerId);
    applyHue(hueFromEvent(e));
  });
  slider.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    pendingHue = hueFromEvent(e);
    if (!rafQueued) {
      rafQueued = true;
      requestAnimationFrame(function () { rafQueued = false; if (pendingHue !== null) applyHue(pendingHue); });
    }
  });
  slider.addEventListener('pointerup', function (e) {
    if (!dragging) return;
    dragging = false; knob.classList.remove('drag'); applyHue(hueFromEvent(e)); pulsePreview();
  });
  slider.addEventListener('keydown', function (e) {
    var h = typeof A.hue === 'number' ? A.hue : 0;
    if (e.key === 'ArrowRight') { e.preventDefault(); applyHue(Math.min(360, h + 10)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); applyHue(Math.max(0, h - 10)); }
  });
  paintKnob(); paintMono(); loadBase(drawPreview);

  carNext.addEventListener('click', function () {
    if (!validCar()) return;
    A.make = make.value; A.model = model.value; A.year = String(parseInt(year.value, 10));
    show(6, 'fwd');
  });

  /* ─── Step 6: Terms & Privacy ─── */
  /* Real copy lives in legal.js (window.CarBoxLegal) — same source Settings
     links to — joined into a single scrollable block for this step's box. */
  var LEGAL = {
    terms: CarBoxLegal.terms.join('\n\n'),
    privacy: CarBoxLegal.privacy.join('\n\n')
  };
  var legalBox = $('ob-legalbox'), legalSeg = $('ob-legalseg');
  var agreeTerms = $('ob-agree-terms'), agreePrivacy = $('ob-agree-privacy'), finish = $('ob-finish');
  function showDoc(which) {
    legalBox.textContent = LEGAL[which];
    legalBox.scrollTop = 0;
    legalSeg.classList.toggle('privacy', which === 'privacy');
    legalSeg.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-doc') === which);
    });
  }
  legalSeg.querySelectorAll('button').forEach(function (b) {
    b.addEventListener('click', function () { showDoc(b.getAttribute('data-doc')); });
  });
  showDoc('terms');
  function refreshFinish() {
    var ok = agreeTerms.checked && agreePrivacy.checked;
    finish.disabled = !ok;
    finish.classList.toggle('ob-btn-disabled', !ok);
  }
  agreeTerms.addEventListener('change', refreshFinish);
  agreePrivacy.addEventListener('change', refreshFinish);
  refreshFinish();

  finish.addEventListener('click', function () {
    if (finish.disabled) return;
    /* the single commit moment — everything lands in carbox.v1 at once.
       The Garage auto-fills its six specs from this vehicle.specs, resolved
       from the verified specs DB for the chosen make/model/year. */
    var hit = CarBoxCars.lookup(A.make, A.model, A.year);
    var specs = hit ? hit.specs : PLACEHOLDER_SPECS;
    CarBox.set('account', {
      firstName: A.firstName, lastName: A.lastName, email: A.email,
      password: A.password /* prototype only — NOT secure, see note at top of file */
    });
    CarBox.set('birthday', A.birthday);
    CarBox.set('profile', { name: A.username, handle: '@' + A.tag });
    CarBox.set('vehicle', {
      name: A.make + ' ' + A.model, make: A.make, model: A.model,
      year: parseInt(A.year, 10), mileage: 0, specs: specs,
      trim: hit ? hit.trim : ''
    });
    /* the appearance choices from the customizer */
    CarBox.set('car', { presetId: A.presetId, hue: A.hue, shade: A.shade });

    /* fresh account: a real new signup starts with an empty garage — clear the
       Bugatti demo activity so the whole app reflects THIS car, not the seeds.
       (App preferences like theme/currency/units are intentionally kept.) */
    CarBox.set('entries', []);
    CarBox.set('stats', { baseInvested: 0, baseCount: 0 });
    CarBox.set('likes', 0);
    CarBox.set('liked', false);
    CarBox.set('planItems', []);
    CarBox.set('comments', []);
    CarBox.set('notifications', [
      { id: 'welcome', type: 'service', text: 'Add your first entry to start your build log', unread: false }
    ]);
    CarBox.set('nextService', { title: 'First service', due: 5000 });

    CarBox.set('onboardingComplete', true);
    show(7, 'fwd');
    var delay = reduced ? 700 : 1500;
    setTimeout(function () { location.replace('index.html?v=' + Date.now()); }, delay);
  });
});
