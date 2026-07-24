/* CarBox Pro — informational modal only. NO purchase button, NO pricing,
   NO "Start trial"/"Upgrade" CTA anywhere in this file, on purpose.

   CarBox Pro is sold entirely on the web via Stripe (app/upgrade.html +
   server/api/create-checkout-session.js), never through Apple's In-App
   Purchase, so Apple takes no cut of the subscription. Under App Store
   guideline 3.1.3(f) ("free stand-alone companion app"), that is compliant
   ONLY as long as the app itself has zero purchasing mechanism and zero
   call-to-action pointing at one — including a tappable link to the web
   checkout page. If you add one back, you must either switch to real
   StoreKit/IAP (guideline 3.1.1) or accept the guideline 3.1.3(f) risk.

   The entitlement itself (`isPro`) is granted server-side by the Stripe
   webhook and synced down via Supabase — see app/billing.js and
   supabase_stripe_migration.sql. This modal just explains what's included;
   Settings has the one exception (a "Manage subscription" row, visible only
   to existing subscribers, which is account self-service, not a sale). */
window.Pro = (function () {
  var showing = false;

  function open() {
    if (showing || !window.UI) return;
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
      '<div class="pro-micro">CarBox Pro is a membership on your account, managed outside the app.</div>';

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
      if (e.key === 'Escape') close();
    }
    scrim.addEventListener('click', close);
    card.querySelector('.pro-x').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
  }

  return { open: open };
})();
