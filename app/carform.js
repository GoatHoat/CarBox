/* CarForm — the shared "pick a car + customize its look" control.
   Mirrors onboarding Step 5 exactly (make/model dropdowns from the specs DB,
   2010+ year policy, 5 presets + hue slider + 8 mono swatches + darkness row)
   and is reused by the Garage's Add Car sheet. Depends on window.CarBoxCars
   (app/data/cars.js) and UI.spritePainter (ui.js).

   Usage:
     var form = CarForm.mount(containerEl, { onChange: fn(valid) });
     var v = form.value();  // {valid, make, model, year, trim, specs, presetId, hue, shade}
*/
window.CarForm = (function () {
  var MIN_YEAR = 2010;
  var PRESETS = [
    { id: 'body_suv', label: 'SUV' },
    { id: 'body_suvcoupe', label: 'SUV coupe' },
    { id: 'body_coupe2', label: '2-door coupe' },
    { id: 'body_coupe4', label: '4-door coupe' },
    { id: 'body_sedan', label: 'Sedan' }
  ];
  var PLACEHOLDER_SPECS = { engine: '', horsepower: '', torque: '', transmission: '', drivetrain: '', accel: '' };

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function mount(container, opts) {
    opts = opts || {};
    var onChange = opts.onChange || function () {};
    var thisYear = new Date().getFullYear();
    var A = { presetId: 'body_suv', hue: null, shade: 1 };
    if (opts.initial) {
      A.presetId = opts.initial.presetId || A.presetId;
      A.hue = (opts.initial.hue === undefined ? A.hue : opts.initial.hue);
      A.shade = (typeof opts.initial.shade === 'number' ? opts.initial.shade : A.shade);
    }

    container.classList.add('cf');
    container.innerHTML =
      '<div class="cf-field cf-selfield"><label>Make</label>' +
        '<select class="cf-make" aria-label="Make"><option value="">Select make</option></select></div>' +
      '<div class="cf-field cf-selfield"><label>Model</label>' +
        '<select class="cf-model" aria-label="Model" disabled><option value="">Select model</option></select></div>' +
      '<div class="cf-field"><label>Year</label>' +
        '<input class="cf-year" type="number" inputmode="numeric" placeholder="' + Math.max(MIN_YEAR, thisYear - 4) + '"></div>' +
      '<div class="cf-specnote"></div>' +
      '<div class="cf-mini">MAKE IT YOURS</div>' +
      '<canvas class="cf-preview" aria-label="Car preview"></canvas>' +
      '<div class="cf-mini">BODY STYLE</div>' +
      '<div class="cf-presetrow" role="group" aria-label="Body style"></div>' +
      '<div class="cf-mini">COLOR</div>' +
      '<div class="cf-huewrap"><div class="cf-hueslider" role="slider" aria-label="Car color" ' +
        'aria-valuemin="0" aria-valuemax="360" tabindex="0"><span class="cf-hueknob"></span></div></div>' +
      '<div class="cf-monorow cf-mono" role="group" aria-label="Monotone colors"></div>' +
      '<div class="cf-mini">DARKNESS</div>' +
      '<div class="cf-huewrap"><div class="cf-shadeslider" role="slider" aria-label="Darkness" ' +
        'aria-valuemin="0" aria-valuemax="100" tabindex="0"><span class="cf-hueknob cf-shadeknob"></span></div></div>';

    var make = container.querySelector('.cf-make');
    var model = container.querySelector('.cf-model');
    var year = container.querySelector('.cf-year');
    var specNote = container.querySelector('.cf-specnote');
    var preview = container.querySelector('.cf-preview');
    var presetRow = container.querySelector('.cf-presetrow');
    var slider = container.querySelector('.cf-hueslider');
    var knob = container.querySelector('.cf-hueknob');
    var monoRow = container.querySelector('.cf-mono');
    var shadeRow = container.querySelector('.cf-shade');
    year.min = MIN_YEAR; year.max = thisYear + 1;

    /* ── dropdowns from the specs DB ── */
    CarBoxCars.brands().forEach(function (b) {
      var o = el('option'); o.value = b; o.textContent = b; make.appendChild(o);
    });
    function styleSelect(sel) { sel.classList.toggle('placeheld', !sel.value); }
    function fillModels() {
      model.innerHTML = '<option value="">Select model</option>';
      if (make.value) {
        CarBoxCars.models(make.value).forEach(function (m) {
          var o = el('option'); o.value = m; o.textContent = m; model.appendChild(o);
        });
        model.disabled = false;
      } else { model.disabled = true; }
      styleSelect(model);
    }
    function valid() {
      var y = parseInt(year.value, 10);
      return !!(make.value && model.value && y >= MIN_YEAR && y <= thisYear + 1);
    }
    function refresh() {
      styleSelect(make); styleSelect(model);
      var y = parseInt(year.value, 10);
      var tooOld = !!year.value && y < MIN_YEAR;
      var bad = !!year.value && (y < MIN_YEAR || y > thisYear + 1);
      year.parentElement.classList.toggle('invalid', bad);
      if (tooOld) {
        specNote.className = 'cf-specnote show note';
        specNote.textContent = 'CarBox supports model years ' + MIN_YEAR + ' and newer.';
      } else if (make.value && model.value && y >= MIN_YEAR && y <= thisYear + 1) {
        var hit = CarBoxCars.lookup(make.value, model.value, y);
        specNote.className = 'cf-specnote show ' + (hit ? 'ok' : 'note');
        specNote.textContent = hit
          ? '✓ ' + [hit.specs.horsepower, hit.specs.engine, hit.trim].filter(Boolean).join(' · ') +
            (hit.exact ? '' : ' (closest: ' + hit.yearStart + '-' + hit.yearEnd + ')')
          : 'We’ll add placeholder specs you can edit later.';
      } else {
        specNote.className = 'cf-specnote'; specNote.textContent = '';
      }
      onChange(valid());
    }
    make.addEventListener('change', function () { fillModels(); refresh(); });
    model.addEventListener('change', refresh);
    year.addEventListener('input', refresh);
    fillModels(); styleSelect(make);

    /* ── appearance customizer ── */
    var painter = null;
    function draw() { if (painter) painter.paint(preview, A.hue, A.shade); }
    function loadBase(cb) {
      UI.spritePainter('assets/' + A.presetId + '.png', function (p) { painter = p; if (cb) cb(); });
    }
    function pulse() { preview.classList.remove('pulse'); void preview.offsetWidth; preview.classList.add('pulse'); }

    PRESETS.forEach(function (p) {
      var tile = el('button', 'cf-presettile' + (p.id === A.presetId ? ' sel' : ''));
      tile.type = 'button'; tile.setAttribute('aria-label', p.label);
      var img = el('img'); img.src = 'assets/' + p.id + '.png'; img.alt = ''; tile.appendChild(img);
      tile.addEventListener('click', function () {
        A.presetId = p.id;
        presetRow.querySelectorAll('.cf-presettile').forEach(function (t) { t.classList.remove('sel'); });
        tile.classList.add('sel');
        loadBase(function () { draw(); pulse(); });
      });
      presetRow.appendChild(tile);
    });

    function paintKnob() {
      var isHue = typeof A.hue === 'number';
      knob.style.left = ((isHue ? A.hue : 0) / 360 * 100) + '%';
      knob.classList.toggle('off', !isHue);
      slider.setAttribute('aria-valuenow', String(Math.round(isHue ? A.hue : 0)));
    }
    function paintMono() {
      monoRow.querySelectorAll('.cf-monoswatch').forEach(function (sw, k) {
        sw.classList.toggle('sel', A.hue === 'mono-' + k);
      });
    }
    for (var k = 0; k < 8; k++) {
      (function (kk) {
        var M = 0.08 + kk * (0.92 - 0.08) / 7, v = Math.round(M * 255);
        var sw = el('button', 'cf-monoswatch'); sw.type = 'button';
        sw.style.background = 'rgb(' + v + ',' + v + ',' + v + ')';
        sw.setAttribute('aria-label', kk === 0 ? 'Black' : kk === 7 ? 'White' : 'Grey ' + kk);
        sw.addEventListener('click', function () { A.hue = 'mono-' + kk; paintKnob(); paintMono(); draw(); pulse(); });
        monoRow.appendChild(sw);
      })(k);
    }
    /* DARKNESS is a slider: left = no darkening (shade 1), right = darkest (SHADE_MIN) */
    var SHADE_MIN = 0.3;
    var shadeSlider = container.querySelector('.cf-shadeslider');
    var shadeKnob = container.querySelector('.cf-shadeknob');
    function paintShade() {
      var s = typeof A.shade === 'number' ? A.shade : 1;
      var t = Math.max(0, Math.min(1, (1 - s) / (1 - SHADE_MIN)));
      shadeKnob.style.left = (t * 100) + '%';
      shadeSlider.setAttribute('aria-valuenow', String(Math.round(t * 100)));
    }
    function shadeFromEvent(e) {
      var r = shadeSlider.getBoundingClientRect();
      var x = Math.max(0, Math.min(r.width, e.clientX - r.left));
      return 1 - (x / r.width) * (1 - SHADE_MIN);
    }
    function applyShade(s) { A.shade = s; paintShade(); draw(); }
    var sDrag = false, sPending = null, sRaf = false;
    shadeSlider.addEventListener('pointerdown', function (e) {
      sDrag = true; shadeKnob.classList.add('drag'); shadeSlider.setPointerCapture(e.pointerId); applyShade(shadeFromEvent(e));
    });
    shadeSlider.addEventListener('pointermove', function (e) {
      if (!sDrag) return;
      sPending = shadeFromEvent(e);
      if (!sRaf) { sRaf = true; requestAnimationFrame(function () { sRaf = false; if (sPending !== null) applyShade(sPending); }); }
    });
    shadeSlider.addEventListener('pointerup', function (e) {
      if (!sDrag) return; sDrag = false; shadeKnob.classList.remove('drag'); applyShade(shadeFromEvent(e)); pulse();
    });
    shadeSlider.addEventListener('keydown', function (e) {
      var s = typeof A.shade === 'number' ? A.shade : 1;
      if (e.key === 'ArrowLeft') { e.preventDefault(); applyShade(Math.min(1, s + 0.05)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); applyShade(Math.max(SHADE_MIN, s - 0.05)); }
    });

    var dragging = false, pendingHue = null, rafQueued = false;
    function hueFromEvent(e) {
      var r = slider.getBoundingClientRect();
      var x = Math.max(0, Math.min(r.width, e.clientX - r.left));
      return Math.round(x / r.width * 360);
    }
    function applyHue(h) { A.hue = h; paintKnob(); paintMono(); draw(); }
    slider.addEventListener('pointerdown', function (e) {
      dragging = true; knob.classList.add('drag'); slider.setPointerCapture(e.pointerId); applyHue(hueFromEvent(e));
    });
    slider.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      pendingHue = hueFromEvent(e);
      if (!rafQueued) { rafQueued = true; requestAnimationFrame(function () { rafQueued = false; if (pendingHue !== null) applyHue(pendingHue); }); }
    });
    slider.addEventListener('pointerup', function (e) {
      if (!dragging) return; dragging = false; knob.classList.remove('drag'); applyHue(hueFromEvent(e)); pulse();
    });
    slider.addEventListener('keydown', function (e) {
      var h = typeof A.hue === 'number' ? A.hue : 0;
      if (e.key === 'ArrowRight') { e.preventDefault(); applyHue(Math.min(360, h + 10)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); applyHue(Math.max(0, h - 10)); }
    });

    paintKnob(); paintMono(); paintShade(); loadBase(draw); refresh();

    return {
      value: function () {
        var y = parseInt(year.value, 10);
        var hit = valid() ? CarBoxCars.lookup(make.value, model.value, y) : null;
        return {
          valid: valid(),
          make: make.value, model: model.value, year: y,
          trim: hit ? hit.trim : '',
          specs: hit ? hit.specs : PLACEHOLDER_SPECS,
          presetId: A.presetId, hue: A.hue, shade: A.shade
        };
      }
    };
  }

  return { mount: mount };
})();
