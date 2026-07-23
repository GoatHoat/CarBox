/* CarBox Pro paywall — centered modal. Pure state, no payments.
   Every Pro touchpoint calls Pro.open(); "Start free week" flips isPro and
   fires a "carbox-pro" event so open pages can unlock live. */
window.Pro = (function () {
  var showing = false;

  function open() {
    if (showing || !window.UI || !window.CarBox) return;
    showing = true;
    var prevFocus = document.activeElement;

    var scrim = document.createElement('div');
    scrim.className = 'pro-scrim';
    var card = document.createElement('div');
    card.className = 'pro-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'CarBox Pro');
    card.tabIndex = -1;
    card.innerHTML =
      '<button class="pro-x" aria-label="Close">×</button>' +
      '<div class="pro-hero">' +
        '<img class="pro-sprite" src="assets/sprite_chiron.png" alt="Your car">' +
        '<img class="pro-spark s1" src="assets/sparkle.png" alt="">' +
        '<img class="pro-spark s2" src="assets/sparkle.png" alt="">' +
        '<img class="pro-spark s3" src="assets/sparkle.png" alt="">' +
        '<img class="pro-spark s4" src="assets/sparkle.png" alt="">' +
        '<img class="pro-spark s5" src="assets/sparkle.png" alt="">' +
        '<img class="pro-spark s6" src="assets/sparkle.png" alt="">' +
      '</div>' +
      '<h2 class="serif pro-title">CarBox Pro</h2>' +
      '<div class="pro-benefit"><img src="assets/pro_trophy.png" alt=""><div>' +
        '<div class="pb-top">All upgrade goals unlocked</div></div></div>' +
      '<div class="pro-benefit"><img src="assets/pro_garage.png" alt=""><div>' +
        '<div class="pb-top">Up to 3 cars in your garage</div></div></div>' +
      '<div class="pro-benefit"><img src="assets/pro_doc.png" alt=""><div>' +
        '<div class="pb-top">PDF history export for resale</div></div></div>' +
      '<div class="pro-prices">' +
        '<button class="pro-price" data-plan="monthly">' +
          '<div class="pp-name">Monthly</div><div class="pp-amt">$4.99/mo</div></button>' +
        '<button class="pro-price sel" data-plan="annual">' +
          '<span class="pp-save">SAVE 33%</span>' +
          '<div class="pp-name">Annual</div><div class="pp-amt">$39.99/yr</div></button>' +
      '</div>' +
      '<button class="pro-cta">Start free week</button>' +
      /* App Store guideline 3.1.2: disclose the auto-renewing terms + link legal.
         (Prices shown match the App Store Connect products; a real build should
         populate them from StoreKit via the RevenueCat bridge — see billing.js.) */
      '<div class="pro-micro">7-day free trial, then $4.99/month or $39.99/year for the plan you pick. ' +
        'Subscription automatically renews unless canceled at least 24 hours before the period ends. ' +
        'Manage or cancel anytime in your App Store settings. ' +
        '<a href="#" class="pro-legal" data-doc="terms">Terms</a> &middot; ' +
        '<a href="#" class="pro-legal" data-doc="privacy">Privacy</a></div>';

    document.body.appendChild(scrim);
    document.body.appendChild(card);
    UI.carSprite(card.querySelector('.pro-sprite'));
    card.querySelectorAll('.pro-benefit').forEach(function (b, i) {
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
      setTimeout(function () { scrim.remove(); card.remove(); }, 260);
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
    }
    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      /* keep Tab focus inside the dialog */
      if (e.key === 'Tab') {
        var f = card.querySelectorAll('button');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    scrim.addEventListener('click', close);
    card.querySelector('.pro-x').addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    /* price selection: border slides to the picked card, price pulses */
    card.querySelectorAll('.pro-price').forEach(function (p) {
      p.addEventListener('click', function () {
        card.querySelectorAll('.pro-price').forEach(function (q) { q.classList.remove('sel'); });
        p.classList.add('sel');
        var amt = p.querySelector('.pp-amt');
        amt.classList.remove('pop'); void amt.offsetWidth; amt.classList.add('pop');
      });
    });
    /* Terms / Privacy links in the disclosure open the bundled legal pages */
    card.querySelectorAll('.pro-legal').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var L = window.CARBOX_LEGAL || {};
        var url = a.getAttribute('data-doc') === 'privacy' ? L.PRIVACY_URL : L.TERMS_URL;
        if (url && url.indexOf('REPLACE') < 0) { close(); location.href = url; }
        else if (window.UI) UI.toast('Link not configured yet');
      });
    });

    /* start free week: runs a REAL StoreKit purchase via CarBoxBilling (which
       drives the Pro entitlement); falls back to the local flag only when no
       native IAP bridge is present (dev/web preview). */
    card.querySelector('.pro-cta').addEventListener('click', function () {
      var btn = this;
      if (btn.disabled) return;
      btn.disabled = true;
      var plan = (card.querySelector('.pro-price.sel') || {}).getAttribute
        ? card.querySelector('.pro-price.sel').getAttribute('data-plan') : 'annual';
      var okMoment = function () {
        btn.innerHTML =
          '<svg class="checkdraw" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
          '<path d="M4 12.5 L10 18.5 L20 6.5" fill="none" stroke="#FBF8F4" stroke-width="3" ' +
          'stroke-linecap="round" stroke-linejoin="round"/></svg>';
        setTimeout(function () { close(); UI.toast('Welcome to CarBox Pro'); }, 700);
      };
      var run = (window.CarBoxBilling && CarBoxBilling.purchase)
        ? CarBoxBilling.purchase(plan)
        : (CarBox.set('isPro', true), document.dispatchEvent(new CustomEvent('carbox-pro')), Promise.resolve(true));
      Promise.resolve(run).then(function (active) {
        if (active) okMoment();
        else { btn.disabled = false; UI.toast('Purchase cancelled'); }
      }, function () { btn.disabled = false; UI.toast('Purchase could not be completed'); });
    });
  }

  return { open: open };
})();
