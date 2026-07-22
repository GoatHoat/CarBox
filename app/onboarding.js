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

  /* curated make/model dataset → auto-fills Garage base specs when matched */
  var CARS = [
    { make: 'Bugatti', model: 'Chiron', specs: { engine: '8.0L quad-turbo W16', horsepower: '1,479 hp (1,500 PS)', drivetrain: 'AWD · 7-speed dual-clutch', accel: '0-60 mph: ~2.4 s', tire: 'Michelin Cup 2' } },
    { make: 'Toyota', model: 'Supra', specs: { engine: '3.0L turbo I6', horsepower: '382 hp', drivetrain: 'RWD · 8-speed auto', accel: '0-60 mph: ~3.9 s', tire: 'Michelin Pilot Super Sport' } },
    { make: 'Toyota', model: 'GR86', specs: { engine: '2.4L flat-4', horsepower: '228 hp', drivetrain: 'RWD · 6-speed manual', accel: '0-60 mph: ~6.1 s', tire: 'Michelin Pilot Sport 4' } },
    { make: 'Honda', model: 'Civic Type R', specs: { engine: '2.0L turbo I4', horsepower: '315 hp', drivetrain: 'FWD · 6-speed manual', accel: '0-60 mph: ~5.0 s', tire: 'Michelin Pilot Sport 4S' } },
    { make: 'Nissan', model: 'GT-R', specs: { engine: '3.8L twin-turbo V6', horsepower: '565 hp', drivetrain: 'AWD · 6-speed dual-clutch', accel: '0-60 mph: ~2.9 s', tire: 'Dunlop SP Sport Maxx GT600' } },
    { make: 'Mazda', model: 'MX-5 Miata', specs: { engine: '2.0L I4', horsepower: '181 hp', drivetrain: 'RWD · 6-speed manual', accel: '0-60 mph: ~5.7 s', tire: 'Bridgestone Potenza S001' } },
    { make: 'Subaru', model: 'WRX', specs: { engine: '2.4L turbo flat-4', horsepower: '271 hp', drivetrain: 'AWD · 6-speed manual', accel: '0-60 mph: ~5.4 s', tire: 'Dunlop Sport Maxx GT' } },
    { make: 'Ford', model: 'Mustang GT', specs: { engine: '5.0L V8', horsepower: '480 hp', drivetrain: 'RWD · 6-speed manual', accel: '0-60 mph: ~4.2 s', tire: 'Pirelli P Zero' } },
    { make: 'Chevrolet', model: 'Corvette', specs: { engine: '6.2L V8', horsepower: '495 hp', drivetrain: 'RWD · 8-speed dual-clutch', accel: '0-60 mph: ~2.9 s', tire: 'Michelin Pilot Sport 4S' } },
    { make: 'Dodge', model: 'Charger', specs: { engine: '6.4L V8', horsepower: '485 hp', drivetrain: 'RWD · 8-speed auto', accel: '0-60 mph: ~4.3 s', tire: 'Goodyear Eagle F1' } },
    { make: 'BMW', model: 'M3', specs: { engine: '3.0L twin-turbo I6', horsepower: '473 hp', drivetrain: 'RWD · 6-speed manual', accel: '0-60 mph: ~4.1 s', tire: 'Michelin Pilot Sport 4S' } },
    { make: 'Porsche', model: '911', specs: { engine: '3.0L twin-turbo flat-6', horsepower: '379 hp', drivetrain: 'RWD · 8-speed dual-clutch', accel: '0-60 mph: ~4.0 s', tire: 'Pirelli P Zero' } },
    { make: 'Audi', model: 'R8', specs: { engine: '5.2L V10', horsepower: '562 hp', drivetrain: 'AWD · 7-speed dual-clutch', accel: '0-60 mph: ~3.4 s', tire: 'Michelin Pilot Sport 4S' } },
    { make: 'Tesla', model: 'Model 3', specs: { engine: 'Dual electric motor', horsepower: '450 hp', drivetrain: 'AWD · single-speed', accel: '0-60 mph: ~3.1 s', tire: 'Michelin Pilot Sport EV' } },
    { make: 'Volkswagen', model: 'Golf GTI', specs: { engine: '2.0L turbo I4', horsepower: '241 hp', drivetrain: 'FWD · 6-speed manual', accel: '0-60 mph: ~5.6 s', tire: 'Bridgestone Potenza' } }
  ];
  var PLACEHOLDER_SPECS = { engine: 'Add engine', horsepower: 'Add horsepower', drivetrain: 'Add drivetrain', accel: 'Add 0-60', tire: 'Add tires' };

  function findCar(make, model) {
    var m = (make || '').trim().toLowerCase(), md = (model || '').trim().toLowerCase();
    for (var i = 0; i < CARS.length; i++) {
      if (CARS[i].make.toLowerCase() === m && CARS[i].model.toLowerCase() === md) return CARS[i];
    }
    return null;
  }

  /* single in-memory answer object; survives forward/back navigation */
  var A = { firstName: '', lastName: '', email: '', password: '',
            username: '', tag: '', birthday: '', make: '', model: '', year: '' };

  var $ = function (id) { return document.getElementById(id); };
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var steps = Array.prototype.slice.call(document.querySelectorAll('.ostep'));
  var head = $('ob-head'), back = $('ob-back'), dotsWrap = $('ob-dots');
  var current = 1;

  /* progress dots: one per step 2..7 */
  var dots = [];
  for (var d = 2; d <= 7; d++) {
    var dot = document.createElement('span');
    dot.className = 'ob-dot';
    dotsWrap.appendChild(dot);
    dots.push(dot);
  }
  function paintDots() {
    dots.forEach(function (el, i) { el.classList.toggle('on', (i + 2) <= current); });
  }

  function show(n, dir) {
    current = n;
    steps.forEach(function (s) {
      s.classList.remove('active', 'fwd', 'back');
      if (+s.getAttribute('data-step') === n) s.classList.add('active', reduced ? '' : dir);
    });
    head.hidden = (n === 1 || n === 7);
    paintDots();
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

  /* ─── Step 5: Car (curated search → auto specs) ─── */
  var make = $('ob-make'), model = $('ob-model'), year = $('ob-year');
  var carErr = $('ob-car-err'), carNext = $('ob-car-next'), specNote = $('ob-specnote');
  var makesDL = $('ob-makes'), modelsDL = $('ob-models');
  var thisYear = new Date().getFullYear();
  year.min = 1990; year.max = thisYear + 1;
  year.placeholder = String(thisYear);
  /* unique makes */
  var seenMake = {};
  CARS.forEach(function (c) {
    if (!seenMake[c.make]) { seenMake[c.make] = 1; var o = document.createElement('option'); o.value = c.make; makesDL.appendChild(o); }
  });
  function fillModels() {
    modelsDL.innerHTML = '';
    var m = make.value.trim().toLowerCase();
    CARS.forEach(function (c) {
      if (!m || c.make.toLowerCase() === m) { var o = document.createElement('option'); o.value = c.model; modelsDL.appendChild(o); }
    });
  }
  function validCar() {
    var y = parseInt(year.value, 10);
    return make.value.trim() && model.value.trim() && y >= 1990 && y <= thisYear + 1;
  }
  function refreshCar() {
    var hit = findCar(make.value, model.value);
    if (make.value.trim() && model.value.trim()) {
      specNote.className = 'ob-specnote show ' + (hit ? 'ok' : 'note');
      specNote.textContent = hit
        ? '✓ Specs found for ' + hit.make + ' ' + hit.model
        : 'No match — we’ll add placeholder specs you can edit in Settings';
    } else {
      specNote.className = 'ob-specnote';
      specNote.textContent = '';
    }
    var y = parseInt(year.value, 10);
    markInvalid(year.parentElement, !!year.value && (y < 1990 || y > thisYear + 1));
    carNext.disabled = !validCar();
  }
  make.addEventListener('input', function () { fillModels(); refreshCar(); });
  model.addEventListener('input', refreshCar);
  year.addEventListener('input', refreshCar);
  fillModels();
  enterAdvances([make, model, year], carNext);
  carNext.addEventListener('click', function () {
    if (!validCar()) return;
    A.make = make.value.trim(); A.model = model.value.trim(); A.year = String(parseInt(year.value, 10));
    show(6, 'fwd');
  });

  /* ─── Step 6: Terms & Privacy ─── */
  var LEGAL = {
    terms: 'CarBox Terms of Service (placeholder)\n\n' +
      'These are placeholder Terms of Service for the CarBox prototype. The owner will replace this copy with real, legally reviewed terms before launch.\n\n' +
      '1. Your garage. You are responsible for the accuracy of the vehicle, build, and maintenance information you add to CarBox.\n\n' +
      '2. Acceptable use. Do not misuse the service, attempt to disrupt it, or upload content you do not have the rights to share.\n\n' +
      '3. Prototype status. CarBox is an early build. Features may change and data may be reset during development.\n\n' +
      '4. No warranty. The service is provided “as is” without warranties of any kind to the extent permitted by law.\n\n' +
      '5. Contact. Questions about these terms can be directed to the CarBox team once support channels are live.',
    privacy: 'CarBox Privacy Policy (placeholder)\n\n' +
      'This is placeholder Privacy Policy copy for the CarBox prototype. The owner will replace it with a real policy before launch.\n\n' +
      '1. What we store. In this prototype, the details you enter during signup are stored locally on your device only.\n\n' +
      '2. No server. There is currently no backend; your information is not transmitted to or held on CarBox servers.\n\n' +
      '3. Your control. You can clear your data at any time by resetting the app’s local storage.\n\n' +
      '4. Future changes. When accounts and cloud sync launch, this policy will be updated to describe exactly what is collected and why.\n\n' +
      '5. Contact. Privacy questions can be directed to the CarBox team once support channels are live.'
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
    /* the single commit moment — everything lands in carbox.v1 at once */
    var car = findCar(A.make, A.model);
    var specs = car ? car.specs : PLACEHOLDER_SPECS;
    CarBox.set('account', {
      firstName: A.firstName, lastName: A.lastName, email: A.email,
      password: A.password /* prototype only — NOT secure, see note at top of file */
    });
    CarBox.set('birthday', A.birthday);
    CarBox.set('profile', { name: A.username, handle: '@' + A.tag });
    CarBox.set('vehicle', {
      name: A.make + ' ' + A.model, make: A.make, model: A.model,
      year: parseInt(A.year, 10), mileage: 0, specs: specs
    });
    CarBox.set('onboardingComplete', true);
    show(7, 'fwd');
    var delay = reduced ? 700 : 1500;
    setTimeout(function () { location.replace('index.html'); }, delay);
  });
});
