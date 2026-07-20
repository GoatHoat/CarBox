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

  document.addEventListener('DOMContentLoaded', function () {
    initPressable();
    initEnter();
  });

  return { toast: toast, sheet: sheet, countUp: countUp, wiggle: wiggle, reduced: reduced, SPRING: SPRING };
})();
