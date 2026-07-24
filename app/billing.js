/* CarBoxBilling — reads the Pro entitlement. Does NOT sell anything.

   CarBox Pro is granted server-side: a Stripe webhook flips `isPro` in
   Supabase (supabase_stripe_migration.sql) after a purchase made on
   app/upgrade.html, a web page never linked from inside this app. The app
   only needs to reflect that state, which `supabase.js` already pulls down
   into the local store on every sign-in — this module just exposes it
   under one name so every Pro gate reads from the same place, and offers
   a manual refresh for "I just paid on the web, check again now."

   There is intentionally no purchase()/native bridge here. Adding an
   in-app purchase mechanism (StoreKit or otherwise) changes CarBox Pro's
   compliance story — see the header comment in app/pro.js before doing that. */
window.CarBoxBilling = (function () {
  function isPro() { return !!(window.CarBox && CarBox.get('isPro')); }

  /* re-pull cloud state now, so returning to the app right after paying on
     the web reflects the new entitlement without waiting for the next
     natural sync point. No-op if not signed in or Supabase isn't configured. */
  function refresh() {
    if (!window.sb || !window.CarBox) return Promise.resolve(isPro());
    return sb.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      if (!session) return isPro();
      return sb.from('user_state').select('data').eq('user_id', session.user.id).maybeSingle()
        .then(function (res) {
          var row = res && res.data;
          if (row && row.data && window.CarBox) {
            CarBox.set('isPro', !!row.data.isPro);
          }
          return isPro();
        }, function () { return isPro(); });
    }, function () { return isPro(); });
  }

  return { isPro: isPro, refresh: refresh };
})();
