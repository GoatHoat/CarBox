/* Coilover Pro paywall — centered modal, two screens inside one card.
   Screen 1: benefits + a primary "Subscribe" button. Screen 2 (slides in when
   Subscribe is tapped): a Monthly/Annual picker whose options START CHECKOUT
   immediately.

   PLATFORM-GATED (2026-07-26, reversing the 2026-07-24 Stripe-default decision):
   Apple requires the app's own purchase mechanism to be StoreKit, full stop —
   an external checkout can't be the thing that actually unlocks a paid feature,
   regardless of a US "external purchase link" allowance, which only covers
   ALSO showing a link, not replacing IAP with one (see APPLE_REVIEW_AUDIT.md).
   So: INSIDE the native iOS shell, "Subscribe" -> plan picker -> CarBoxBilling
   .purchase(plan) (StoreKit via RevenueCat) is PRIMARY, and a small secondary
   "or subscribe on the web" link (screen 1 only, defaults to annual) offers
   CarBoxBilling.purchaseViaStripe as a cheaper alternative — kept deliberately
   less prominent than the Subscribe button per Apple's rules on external links.
   OUTSIDE the native shell (the plain website), there's no StoreKit available
   at all, so "Subscribe" -> plan picker -> Stripe is the only path and the
   secondary link is not shown. No free trial: the plan charges immediately,
   so the disclosure copy must not promise one. */
window.Pro = (function () {
  var showing = false;
  function nativeShell() { return !!window.CARBOX_NATIVE_SHELL; }

  /* disclosure block (App Store 3.1.2). Shown on BOTH screens so the
     auto-renew terms sit next to whichever purchase control the user uses. */
  var MICRO =
    '<div class="pro-micro">$4.99/month or $39.99/year for the plan you pick. ' +
      'Subscription automatically renews unless canceled at least 24 hours before the period ends. ' +
      'Manage or cancel anytime in Settings. ' +
      '<a href="#" class="pro-legal" data-doc="terms">Terms</a> &middot; ' +
      '<a href="#" class="pro-legal" data-doc="privacy">Privacy</a></div>';

  function open() {
    if (showing || !window.UI || !window.CarBox) return;
    showing = true;
    var prevFocus = document.activeElement;

    /* hero starts as THIS car's untinted silhouette (right body, no color yet),
       never a hardcoded demo car; UI.carSprite tints it a beat later. Prevents
       a Bugatti flash in the paywall for anyone who isn't driving one. */
    var _ap = CarBox.get('car') || {};
    var heroSrc = 'assets/' + (_ap.presetId || 'body_suv') + '.png';

    var scrim = document.createElement('div');
    scrim.className = 'pro-scrim';
    var card = document.createElement('div');
    card.className = 'pro-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Coilover Pro');
    card.tabIndex = -1;
    card.innerHTML =
      '<button class="pro-x" aria-label="Close">×</button>' +

      /* ── Screen 1: benefits + primary/secondary purchase entry points ── */
      '<div class="pro-view pro-step1 active" data-step="1">' +
        '<div class="pro-hero">' +
          '<img class="pro-sprite" src="' + heroSrc + '" alt="Your car">' +
          '<img class="pro-spark s1" src="assets/sparkle.png" alt="">' +
          '<img class="pro-spark s2" src="assets/sparkle.png" alt="">' +
          '<img class="pro-spark s3" src="assets/sparkle.png" alt="">' +
          '<img class="pro-spark s4" src="assets/sparkle.png" alt="">' +
          '<img class="pro-spark s5" src="assets/sparkle.png" alt="">' +
          '<img class="pro-spark s6" src="assets/sparkle.png" alt="">' +
        '</div>' +
        '<h2 class="serif pro-title">Coilover Pro</h2>' +
        '<div class="pro-benefit"><img src="assets/pro_trophy.png" alt=""><div>' +
          '<div class="pb-top">All upgrade goals unlocked</div></div></div>' +
        '<div class="pro-benefit"><img src="assets/pro_garage.png" alt=""><div>' +
          '<div class="pb-top">Up to 3 cars in your garage</div></div></div>' +
        '<div class="pro-benefit"><img src="assets/pro_doc.png" alt=""><div>' +
          '<div class="pb-top">PDF history export for resale</div></div></div>' +
        '<button class="pro-cta">Subscribe</button>' +
        (nativeShell() ? '<button class="pro-stripe-link">or subscribe on the web</button>' : '') +
        MICRO +
      '</div>' +

      /* ── Screen 2: pick a plan (tap to select), then the Subscribe button buys it ── */
      '<div class="pro-view pro-step2" data-step="2" style="display:none">' +
        '<button class="pro-back" aria-label="Back">‹ Back</button>' +
        '<h2 class="serif pro-plan-title">Choose your plan</h2>' +
        '<div class="pro-planpick">' +
          '<button class="pro-planopt" data-plan="monthly">' +
            '<div class="pp-name">Monthly</div>' +
            '<div class="pp-amt">$4.99/mo</div>' +
            '<div class="pp-tag">Billed every month</div><span class="pp-check">✓</span></button>' +
          '<button class="pro-planopt best sel" data-plan="annual">' +
            '<span class="pp-save">SAVE 33%</span>' +
            '<div class="pp-name">Annual</div>' +
            '<div class="pp-amt">$39.99/yr</div>' +
            '<div class="pp-tag">Best value</div><span class="pp-check">✓</span></button>' +
        '</div>' +
        '<button class="pro-buy">Subscribe</button>' +
        MICRO +
      '</div>';

    document.body.appendChild(scrim);
    document.body.appendChild(card);
    UI.carSprite(card.querySelector('.pro-sprite'));
    card.querySelectorAll('.pro-step1 .pro-benefit').forEach(function (b, i) {
      b.style.transitionDelay = (120 + i * 50) + 'ms';
    });
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        scrim.classList.add('show');
        card.classList.add('show');
        card.focus({ preventScroll: true });
      });
    });

    /* Re-enable the plan buttons when the page is restored from the back/forward
       cache (e.g. you tapped Monthly, went to Stripe, then came back). Without
       this the whole plan picker stays disabled and you can't switch to Annual
       without closing and reopening the paywall. */
    function reenablePlans() {
      card.querySelectorAll('.pro-planopt').forEach(function (o) { o.disabled = false; o.classList.remove('loading'); });
      var buy = card.querySelector('.pro-buy'); if (buy) { buy.disabled = false; buy.classList.remove('loading'); buy.textContent = 'Subscribe'; }
      var cta = card.querySelector('.pro-cta'); if (cta) cta.disabled = false;
      var link = card.querySelector('.pro-stripe-link'); if (link) link.disabled = false;
    }
    function onPageShow(e) { if (e.persisted) reenablePlans(); }
    window.addEventListener('pageshow', onPageShow);

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      showing = false;
      card.classList.remove('show');
      card.classList.add('out');
      scrim.classList.remove('show');
      document.documentElement.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('pageshow', onPageShow);
      setTimeout(function () { scrim.remove(); card.remove(); }, 260);
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
    }

    /* focusable controls in the CURRENTLY VISIBLE screen (+ the always-present
       close button), so the Tab trap never lands on the hidden screen. */
    function focusables() {
      return Array.prototype.slice.call(card.querySelectorAll('button, a[href]'))
        .filter(function (el) { return el.offsetParent !== null && !el.disabled; });
    }
    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') {
        var f = focusables();
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    scrim.addEventListener('click', close);
    card.querySelector('.pro-x').addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    /* ── screen transition: slide + fade with the shared spring easing ──
       `dir` is 'fwd' (Subscribe) or 'back'; the CSS uses it to pick which way
       the outgoing/incoming views slide. Respects reduced motion (no stagger). */
    function showStep(step, dir) {
      var to = card.querySelector('.pro-view[data-step="' + step + '"]');
      var from = card.querySelector('.pro-view.active');
      if (!to || to === from) return;
      card.setAttribute('data-dir', dir || 'fwd');
      var reduce = UI.reduced && UI.reduced();
      if (from) { from.classList.remove('active'); from.classList.add('leaving'); }
      var reveal = function () {
        if (from) { from.classList.remove('leaving'); from.style.display = 'none'; }
        to.style.display = 'block';
        to.classList.add('entering');
        void to.offsetWidth;                 /* commit the offset before animating in */
        requestAnimationFrame(function () {
          to.classList.remove('entering');
          to.classList.add('active');
          var f = to.querySelector('button:not([disabled])');
          if (f) f.focus({ preventScroll: true });
        });
      };
      if (reduce) reveal(); else setTimeout(reveal, 160);
    }

    /* Terms / Privacy links (present on both screens) open the bundled legal pages */
    card.querySelectorAll('.pro-legal').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var L = window.CARBOX_LEGAL || {};
        var url = a.getAttribute('data-doc') === 'privacy' ? L.PRIVACY_URL : L.TERMS_URL;
        if (url && url.indexOf('REPLACE') < 0) { close(); location.href = url; }
        else if (window.UI) UI.toast('Link not configured yet');
      });
    });

    /* shared error toast: same wording/logging both purchase controls used before */
    function toastErr(err, fallback) {
      var text = (window.CarBoxBilling && CarBoxBilling.errorText)
        ? CarBoxBilling.errorText(err, fallback) : fallback;
      UI.toast(text);
      try { console.error('[Coilover] purchase failed:', err); } catch (e) {}
    }

    /* "Subscribe" itself only advances to screen 2; the plan option there is
       what actually starts a purchase. */
    card.querySelector('.pro-cta').addEventListener('click', function () {
      showStep('2', 'fwd');
    });
    card.querySelector('.pro-back').addEventListener('click', function () {
      showStep('1', 'back');
    });
    /* tap a plan to SELECT it (highlight); annual is selected by default */
    card.querySelectorAll('.pro-planopt').forEach(function (opt) {
      opt.addEventListener('click', function () {
        if (this.disabled) return;
        card.querySelectorAll('.pro-planopt').forEach(function (o) { o.classList.remove('sel'); });
        this.classList.add('sel');
      });
    });
    /* ── PRIMARY: the plan-picker's Subscribe button ──
       Inside the native shell this MUST be StoreKit (Apple requires the app's
       own unlock mechanism to be IAP); only the plain website falls back to
       Stripe, since there's no StoreKit to use there at all. */
    card.querySelector('.pro-buy').addEventListener('click', function () {
      var btn = this;
      if (btn.disabled) return;
      var selEl = card.querySelector('.pro-planopt.sel') || card.querySelector('.pro-planopt[data-plan="annual"]');
      var plan = (selEl && selEl.getAttribute('data-plan')) || 'annual';
      var reset = function () {
        btn.disabled = false; btn.classList.remove('loading'); btn.textContent = 'Subscribe';
        card.querySelectorAll('.pro-planopt').forEach(function (o) { o.disabled = false; });
      };
      btn.disabled = true; btn.classList.add('loading');
      card.querySelectorAll('.pro-planopt').forEach(function (o) { o.disabled = true; });

      if (nativeShell()) {
        if (!window.CarBoxBilling || !CarBoxBilling.purchase) { reset(); return; }
        btn.textContent = 'Processing…';
        CarBoxBilling.purchase(plan).then(function (active) {
          if (active) { close(); UI.toast('Welcome to Coilover Pro'); }
          else { reset(); UI.toast('Purchase cancelled'); }
        }, function (err) {
          reset();
          toastErr(err, 'Purchase could not be completed');
        });
      } else {
        if (!window.CarBoxBilling || !CarBoxBilling.purchaseViaStripe) { reset(); return; }
        btn.textContent = 'Starting checkout…';
        CarBoxBilling.purchaseViaStripe(plan).then(function () {
          /* navigates away to Stripe Checkout on success; nothing to do here */
        }, function (err) {
          reset();
          toastErr(err, 'Could not start Stripe checkout');
        });
      }
    });

    /* ── SECONDARY (native shell only): "or subscribe on the web" -> Stripe ──
       A cheaper alternative for people who'd rather not pay Apple's cut, kept
       deliberately less prominent than the Subscribe button above (Apple only
       permits an external-purchase link alongside IAP, not in place of it).
       Defaults to annual; navigates away, so there's no success case to handle
       here — only a rejection can come back. */
    var stripeLink = card.querySelector('.pro-stripe-link');
    if (stripeLink) stripeLink.addEventListener('click', function () {
      var btn = this;
      if (btn.disabled || !window.CarBoxBilling || !CarBoxBilling.purchaseViaStripe) return;
      btn.disabled = true;
      CarBoxBilling.purchaseViaStripe('annual').then(function () {
        /* navigates away to Stripe Checkout on success; nothing to do here */
      }, function (err) {
        btn.disabled = false;
        toastErr(err, 'Could not start checkout');
      });
    });
  }

  return { open: open };
})();
