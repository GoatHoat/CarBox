/* CarBox shared UI primitives: toast, bottom sheet, pressable, page-enter
   stagger, count-up. One easing family: cubic-bezier(.3,1.4,.4,1). */
window.UI = (function () {
  var SPRING = 'cubic-bezier(.3,1.4,.4,1)';
  function reduced() {
    return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ── toast: one visible at a time, bottom-center above the nav ── */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    clearTimeout(toastTimer);
    toastEl.classList.remove('show');
    toastEl.textContent = msg;
    /* force restart of the transition */
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  /* ── bottom sheet: scrim fade + spring slide, drag-down to dismiss ── */
  function sheet(opts) {
    var scrim = document.createElement('div');
    scrim.className = 'ui-scrim';
    var panel = document.createElement('div');
    panel.className = 'ui-sheet';
    panel.setAttribute('role', 'dialog');
    if (opts.label) panel.setAttribute('aria-label', opts.label);
    var handle = document.createElement('div');
    handle.className = 'ui-handle';
    panel.appendChild(handle);
    if (opts.title) {
      var h = document.createElement('h2');
      h.className = 'serif ui-sheet-title';
      h.textContent = opts.title;
      panel.appendChild(h);
    }
    var body = document.createElement('div');
    body.className = 'ui-sheet-body';
    panel.appendChild(body);
    if (opts.build) opts.build(body);

    document.body.appendChild(scrim);
    document.body.appendChild(panel);
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () {
      scrim.classList.add('show');
      panel.classList.add('open');
    });

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      scrim.classList.remove('show');
      panel.classList.remove('open');
      document.documentElement.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { scrim.remove(); panel.remove(); }, 450);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    /* drag-down on the handle: follow finger, release past 30% (or fast) closes */
    var dragStart = null, lastY = 0, lastT = 0, vel = 0;
    handle.addEventListener('pointerdown', function (e) {
      dragStart = e.clientY; lastY = e.clientY; lastT = e.timeStamp; vel = 0;
      panel.style.transition = 'none';
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', function (e) {
      if (dragStart === null) return;
      var dy = Math.max(0, e.clientY - dragStart);
      var dt = e.timeStamp - lastT;
      if (dt > 0) vel = (e.clientY - lastY) / dt;
      lastY = e.clientY; lastT = e.timeStamp;
      panel.style.transform = 'translate(-50%,' + dy + 'px)';
    });
    handle.addEventListener('pointerup', function (e) {
      if (dragStart === null) return;
      var dy = Math.max(0, e.clientY - dragStart);
      dragStart = null;
      panel.style.transition = '';
      panel.style.transform = '';
      if (dy > panel.offsetHeight * 0.3 || vel > 0.65) close();
    });

    return { close: close, body: body, panel: panel };
  }

  /* ── pressable: every button/tab/tappable card scales to .965 on press ── */
  function initPressable() {
    var SEL = 'button, .tab, [data-press]';
    document.addEventListener('pointerdown', function (e) {
      var el = e.target.closest && e.target.closest(SEL);
      if (!el || el.disabled) return;
      el.classList.add('pressed');
      var lift = function () {
        el.classList.remove('pressed');
        window.removeEventListener('pointerup', lift);
        window.removeEventListener('pointercancel', lift);
      };
      window.addEventListener('pointerup', lift);
      window.addEventListener('pointercancel', lift);
    });
  }

  /* ── page-enter stagger: header → cards, 40ms apart; nav never animates ── */
  function initEnter() {
    var phone = document.querySelector('.phone');
    if (!phone) return;
    var blocks = Array.prototype.filter.call(phone.children, function (el) {
      var t = el.tagName;
      return t !== 'NAV' && t !== 'SCRIPT' &&
        !el.classList.contains('backdrop') && !el.classList.contains('sheet') &&
        !el.classList.contains('fab');
    });
    blocks.forEach(function (el, i) {
      el.classList.add('anim-in');
      el.style.transitionDelay = (i * 40) + 'ms';
    });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        blocks.forEach(function (el) { el.classList.add('anim-go'); });
        /* clean up delays so later transforms aren't delayed */
        setTimeout(function () {
          blocks.forEach(function (el) {
            el.classList.remove('anim-in', 'anim-go');
            el.style.transitionDelay = '';
          });
        }, 450 + blocks.length * 40);
      });
    });
  }

  /* ── count-up/down for changing stats: 500ms ease-out ── */
  function countUp(el, from, to, format) {
    format = format || function (n) { return String(n); };
    if (reduced() || from === to) { el.textContent = format(to); return; }
    var t0 = null, DUR = 500;
    function tick(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / DUR);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = format(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ── wiggle: 3-shake refusal, 280ms ── */
  function wiggle(el) {
    el.classList.remove('wiggle');
    void el.offsetWidth;
    el.classList.add('wiggle');
    setTimeout(function () { el.classList.remove('wiggle'); }, 320);
  }

  /* ── sprite tinting ──
     Each sprite ships with a precomputed body mask (assets/mask_<name>.png,
     opaque = paintable). Only masked pixels are recolored; wheels, windows,
     headlights and dark outlines are untouched. Each pixel keeps its own
     luminance so panel shading survives, via a 256-entry hue LUT. */
  function hslToRgb(h, s, l) {
    h /= 360;
    function f(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return [Math.round(f(p, q, h + 1 / 3) * 255), Math.round(f(p, q, h) * 255), Math.round(f(p, q, h - 1 / 3) * 255)];
  }
  var TINT_SAT = 0.62;
  var painterCache = {};   /* src -> painter (or pending callbacks) */
  var tintCache = {};      /* src|hue -> data URL */

  function spritePainter(src, cb) {
    var entry = painterCache[src];
    if (entry && entry.painter) { cb(entry.painter); return; }
    if (entry) { entry.waiting.push(cb); return; }
    entry = painterCache[src] = { painter: null, waiting: [cb] };
    var img = new Image(), maskImg = new Image();
    var left = 2, failed = false;
    function fail() {
      if (failed) return;
      failed = true;
      /* no mask -> paint the original, never hue-rotate everything */
      entry.painter = {
        paint: function (canvas, hue) {
          if (!img.naturalWidth) return;
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          canvas.getContext('2d').drawImage(img, 0, 0);
        }
      };
      entry.waiting.forEach(function (fn) { fn(entry.painter); });
      entry.waiting = [];
    }
    function done() {
      if (failed || --left > 0) return;
      try {
        var w = img.naturalWidth, h = img.naturalHeight;
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        var base = x.getImageData(0, 0, w, h);
        x.clearRect(0, 0, w, h);
        x.drawImage(maskImg, 0, 0);
        var maskData = x.getImageData(0, 0, w, h).data;
        var n = w * h;
        var masked = new Uint8Array(n), lumArr = new Uint8Array(n);
        var d = base.data;
        for (var i = 0; i < n; i++) {
          var o = i * 4;
          if (maskData[o + 3] > 128) {
            masked[i] = 1;
            var mx = Math.max(d[o], d[o + 1], d[o + 2]);
            var mn = Math.min(d[o], d[o + 1], d[o + 2]);
            lumArr[i] = (mx + mn) >> 1;
          }
        }
        entry.painter = {
          width: w, height: h,
          paint: function (canvas, hue) {
            canvas.width = w; canvas.height = h;
            var ctx = canvas.getContext('2d');
            var out = new ImageData(new Uint8ClampedArray(d), w, h);
            if (hue !== null && hue !== undefined && hue !== '') {
              var lut = new Uint8Array(256 * 3);
              var mono = typeof hue === 'string' && hue.indexOf('mono-') === 0;
              for (var L = 0; L < 256; L++) {
                var rgb;
                if (mono) {
                  /* levels remap toward the target grey M, contrast preserved */
                  var k = parseInt(hue.slice(5), 10) || 0;
                  var M = 0.08 + k * (0.92 - 0.08) / 7;
                  var l = L / 255;
                  var v = M <= 0.5 ? l * (M / 0.5) : 1 - (1 - l) * ((1 - M) / 0.5);
                  v = Math.round(v * 255);
                  rgb = [v, v, v];
                } else {
                  rgb = hslToRgb(hue, TINT_SAT, L / 255);
                }
                lut[L * 3] = rgb[0]; lut[L * 3 + 1] = rgb[1]; lut[L * 3 + 2] = rgb[2];
              }
              var od = out.data;
              for (var i = 0; i < n; i++) {
                if (!masked[i]) continue;
                var o = i * 4, li = lumArr[i] * 3;
                od[o] = lut[li]; od[o + 1] = lut[li + 1]; od[o + 2] = lut[li + 2];
              }
            }
            ctx.putImageData(out, 0, 0);
          }
        };
      } catch (e) { fail(); return; }
      entry.waiting.forEach(function (fn) { fn(entry.painter); });
      entry.waiting = [];
    }
    img.onload = done; maskImg.onload = done;
    img.onerror = fail; maskImg.onerror = fail;
    img.src = src;
    maskImg.src = src.replace(/([^\/]+)\.png$/, 'mask_$1.png');
  }

  function tintSprite(src, hue, cb) {
    if (hue === null || hue === undefined || hue === '') { cb(src); return; }
    var key = src + '|' + hue;
    if (tintCache[key]) { cb(tintCache[key]); return; }
    spritePainter(src, function (painter) {
      try {
        var c = document.createElement('canvas');
        painter.paint(c, hue);
        var url = c.toDataURL('image/png');
        tintCache[key] = url;
        cb(url);
      } catch (e) { cb(src); }
    });
  }
  /* apply the saved {presetId, hue} to any <img> that shows the car */
  function carSprite(imgEl) {
    if (!imgEl || !window.CarBox) return;
    var car = CarBox.get('car') || { presetId: 'sprite_chiron', hue: null };
    tintSprite('assets/' + car.presetId + '.png', car.hue, function (url) { imgEl.src = url; });
  }

  /* ── theme: resolve system + follow live changes ── */
  function applyTheme(pref) {
    var t = pref;
    if (t === 'system' || !t) {
      t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
    /* tell the native Expo shell so the safe areas match */
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ theme: t })); } catch (e) {}
    }
  }
  function syncTheme() {
    if (!window.CarBox) return;
    CarBox.reload();
    applyTheme(CarBox.get('theme'));
  }

  document.addEventListener('DOMContentLoaded', function () {
    initPressable();
    initEnter();
    if (window.CarBox) applyTheme(CarBox.get('theme'));
    if (window.matchMedia && window.CarBox) {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if ((CarBox.get('theme') || 'system') === 'system') applyTheme('system');
      });
    }
    /* prerendered/bfcached copies re-check the saved theme when shown */
    window.addEventListener('pageshow', function (e) { if (e.persisted) syncTheme(); });
    document.addEventListener('prerenderingchange', syncTheme);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) syncTheme();
    });
  });

  return { toast: toast, sheet: sheet, countUp: countUp, wiggle: wiggle, reduced: reduced,
           tintSprite: tintSprite, carSprite: carSprite, spritePainter: spritePainter,
           applyTheme: applyTheme, SPRING: SPRING };
})();
