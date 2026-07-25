/* Coilover Pro paywall — centered modal, two screens inside one card.
   Screen 1: benefits + a primary "Subscribe" button + a secondary "or pay on
   app" link. Screen 2 (slides in when Subscribe is tapped): a Monthly/Annual
   picker whose options START CHECKOUT immediately.

   PRIMARY path = Stripe: "Subscribe" -> plan picker -> CarBoxBilling
   .purchaseViaStripe(plan), unconditionally, on every platform including inside
   the native iOS shell. SECONDARY path = the native/in-app purchase (StoreKit
   when the RevenueCat bridge is present, Stripe otherwise), reached only via the
   small "or pay on app" link, defaulted to the annual plan.

   Because Stripe is now the DEFAULT purchase everywhere, the App Store External
   Purchase Link Entitlement caveat now applies to the MAIN button, not just a
   secondary link — see CarBoxBilling.purchaseViaStripe in billing.js and
   SUBMISSION_CHECKLIST.md section 2. No free trial: the plan charges
   immediately, so the disclosure copy must not promise one. */
window.Pro = (function () {
  var showing = false;

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
        '<button class="pro-stripe-link">or pay on app</button>' +
        MICRO +
      '</div>' +

      /* ── Screen 2: plan picker; each option starts Stripe checkout at once ── */
      '<div class="pro-view pro-step2" data-step="2" style="display:none">' +
        '<button class="pro-back" aria-label="Back">‹ Back</button>' +
        '<h2 class="serif pro-plan-title">Choose your plan</h2>' +
        '<div class="pro-planpick">' +
          '<button class="pro-planopt" data-plan="monthly">' +
            '<div class="pp-name">Monthly</div>' +
            '<div class="pp-amt">$4.99/mo</div>' +
            '<div class="pp-tag">Billed every month</div></button>' +
          '<button class="pro-planopt best" data-plan="annual">' +
            '<span class="pp-save">SAVE 33%</span>' +
            '<div class="pp-name">Annual</div>' +
            '<div class="pp-amt">$39.99/yr</div>' +
            '<div class="pp-tag">Best value</div></button>' +
        '</div>' +
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

    /* ── PRIMARY: Subscribe -> plan picker -> Stripe checkout ──
       "Subscribe" itself only advances to screen 2; the plan option there is
       what actually starts Stripe (which navigates away, so its promise never
       settles on success — only a rejection comes back here). */
    card.querySelector('.pro-cta').addEventListener('click', function () {
      showStep('2', 'fwd');
    });
    card.querySelector('.pro-back').addEventListener('click', function () {
      showStep('1', 'back');
    });
    card.querySelectorAll('.pro-planopt').forEach(function (opt) {
      opt.addEventListener('click', function () {
        var btn = this;
        if (btn.disabled || !window.CarBoxBilling || !CarBoxBilling.purchaseViaStripe) return;
        var plan = btn.getAttribute('data-plan') || 'annual';
        card.querySelectorAll('.pro-planopt').forEach(function (o) { o.disabled = true; });
        btn.classList.add('loading');
        CarBoxBilling.purchaseViaStripe(plan).then(function () {
          /* navigates away to Stripe Checkout on success; nothing to do here */
        }, function (err) {
          card.querySelectorAll('.pro-planopt').forEach(function (o) { o.disabled = false; });
          btn.classList.remove('loading');
          toastErr(err, 'Could not start Stripe checkout');
        });
      });
    });

    /* ── SECONDARY: "or pay on app" -> the native/in-app purchase path ──
       Defaults to annual (no plan picker on screen 1). Inside the native shell
       this is StoreKit (or the dev fallback); in a plain browser CarBoxBilling
       .purchase falls through to Stripe. Resolves true/false, so unlike the
       Stripe path it can report success here and close with a confirmation. */
    card.querySelector('.pro-stripe-link').addEventListener('click', function () {
      var btn = this;
      if (btn.disabled) return;
      btn.disabled = true;
      var run = (window.CarBoxBilling && CarBoxBilling.purchase)
        ? CarBoxBilling.purchase('annual')
        : (CarBox.set('isPro', true), document.dispatchEvent(new CustomEvent('carbox-pro')), Promise.resolve(true));
      Promise.resolve(run).then(function (active) {
        if (active) { close(); UI.toast('Welcome to Coilover Pro'); }
        else { btn.disabled = false; UI.toast('Purchase cancelled'); }
      }, function (err) {
        btn.disabled = false;
        toastErr(err, 'Purchase could not be completed');
      });
    });
  }

  return { open: open };
})();
