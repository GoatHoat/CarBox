/* CarBoxBilling — the single gate for the Pro entitlement.

   TWO payment paths, picked by platform (2026-07-26 — reversed the 2026-07-24
   Stripe-everywhere decision: Apple requires the app's own unlock mechanism to
   be StoreKit, not an external checkout, so Stripe can only be a secondary
   option inside the native shell, never the default):

   1. NATIVE (iOS app, RevenueCat wired) — `purchase(plan)` is the PRIMARY path
      inside the native shell. The Expo shell injects `window.CarBoxNativeBilling`
      into the WebView with:
          getEntitlement() -> Promise<bool>
          purchase(plan)   -> Promise<bool>
          restore()        -> Promise<bool>
          manage()         -> void
      If the bridge is missing inside the native shell, purchase() FAILS rather
      than granting Pro for free (see below) — there is no dev fallback.

   2. WEB / STRIPE — `purchaseViaStripe(plan)` (session from /api/stripe-checkout;
      entitlement written back by /api/stripe-webhook into Supabase's user_state,
      which the rest of the app already syncs from — see supabase.js). This is
      the ONLY path on the plain website (no StoreKit available there), and a
      secondary "or subscribe on the web" link inside the native app for anyone
      who'd rather avoid Apple's cut — kept deliberately less prominent than the
      native Subscribe button, per Apple's rules on external purchase links.
      The Expo shell sets `window.CARBOX_NATIVE_SHELL = true` (see App.js) so
      the code can tell "inside our iOS app" apart from "in a browser." */
window.CarBoxBilling = (function () {
  function native() { return window.CarBoxNativeBilling || null; }
  function insideNativeShell() { return !!window.CARBOX_NATIVE_SHELL; }
  function configured() { return !!(native() || !insideNativeShell()); }

  function apiBase() {
    try { var s = localStorage.getItem('carbox.apiBase'); if (s) return s.replace(/\/+$/, ''); } catch (e) {}
    return 'https://carboxserver.vercel.app';
  }
  /* Errors thrown out of here carry a `.code` so callers (the paywall) can show
     a SPECIFIC message instead of a generic "cancelled" — the failure modes look
     identical to a user otherwise:
       not-signed-in  no Supabase session yet (window.CARBOX_USER unset)
       not-configured server is missing Stripe env vars -> 503
       network        server unreachable / CORS / offline
       server         anything else the endpoint returned */
  function billingError(code, message, status) {
    var e = new Error(message || code);
    e.code = code;
    if (status) e.status = status;
    return e;
  }
  function api(path, payload) {
    return fetch(apiBase() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.ok) return data;
        var msg = (data && data.error) || ('http ' + r.status);
        /* 503 from stripe-checkout/stripe-portal means the deploy is missing
           STRIPE_SECRET_KEY / STRIPE_PRICE_* / CARBOX_WEB_URL — an owner setup
           gap, not a user error, so it gets its own code. */
        throw billingError(r.status === 503 ? 'not-configured' : 'server', msg, r.status);
      });
    }, function (e) {
      throw billingError('network', 'could not reach the Coilover server: ' + (e && e.message || e));
    });
  }

  /* One place that turns a billing error into user-facing text, so the paywall
     and Settings say the same thing. `fallback` covers a plain rejection with
     no code (e.g. the native StoreKit bridge throwing). */
  function purchaseErrorText(err, fallback) {
    var code = err && err.code;
    if (code === 'not-signed-in') return 'Sign in to subscribe';
    if (code === 'not-configured') return 'Subscriptions aren’t set up yet — try again later';
    if (code === 'network') return 'Couldn’t reach Coilover — check your connection';
    /* surface the actual message when there is one (e.g. the native StoreKit /
       RevenueCat bridge explaining exactly what's wrong) rather than a generic line */
    return (err && err.message) || fallback || 'Purchase could not be completed';
  }

  function setPro(v) {
    if (window.CarBox) CarBox.set('isPro', !!v);
    if (v) { try { document.dispatchEvent(new CustomEvent('carbox-pro')); } catch (e) {} }
  }

  /* on load, if the native bridge exists, sync isPro to the REAL entitlement */
  function syncEntitlement() {
    var n = native();
    if (!n || !n.getEntitlement) return;
    try { Promise.resolve(n.getEntitlement()).then(function (active) { setPro(!!active); }, function () {}); } catch (e) {}
  }

  /* read the signed-in user's Supabase entitlement row (the Stripe webhook writes
     it: isPro, subscriptionStatus, cancelAtPeriodEnd, currentPeriodEnd, stripe ids).
     Returns the raw data object, or null. */
  function readCloudEntitlement() {
    if (!window.sb || !window.CARBOX_USER) return Promise.resolve(null);
    return sb.from('user_state').select('data').eq('user_id', window.CARBOX_USER.id).maybeSingle()
      .then(function (r) { return (r && r.data && r.data.data) || null; }, function () { return null; });
  }

  /* re-read isPro from the cloud. Used right after a Stripe Checkout redirect and
     as the web/Stripe "restore purchases". Only flips isPro UP here (a genuine
     downgrade is handled authoritatively by supabase.js reconcileEntitlement and
     by handlePortalReturn); this keeps restore/checkout from ever revoking. */
  function refreshFromCloud() {
    return readCloudEntitlement().then(function (d) {
      var active = !!(d && d.isPro);
      if (active) setPro(true);
      return active;
    });
  }

  function fmtDate(epochSeconds) {
    try { return new Date(epochSeconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch (e) { return ''; }
  }

  /* handle the return from the Stripe Billing Portal ("Manage subscription").
     stripe-portal.js sets return_url = settings.html?fromPortal=1. Re-pull the
     entitlement (the webhook is async, so poll briefly) and confirm what happened:
       - canceled (at period end): Pro stays active, tell them the end date
       - lapsed already: downgrade + say it ended
       - otherwise (card update / resubscribe / undo-cancel): active confirmation
     Applies isPro authoritatively in BOTH directions for a Stripe-managed row. */
  function handlePortalReturn() {
    var fromPortal;
    try { fromPortal = new URLSearchParams(location.search).get('fromPortal'); } catch (e) { return; }
    if (!fromPortal) return;
    try { history.replaceState({}, '', location.pathname); } catch (e) {}
    if (!window.sb || !window.CARBOX_USER) return;
    var tries = 0;
    (function poll() {
      tries++;
      readCloudEntitlement().then(function (d) {
        if (!d) { if (tries < 5) return setTimeout(poll, 1500); return; }
        var stripeManaged = !!(d.stripeSubscriptionId || d.stripeCustomerId);
        if (stripeManaged) setPro(!!d.isPro);   /* authoritative, both directions */

        if (d.cancelAtPeriodEnd && d.currentPeriodEnd) {
          if (window.UI) UI.toast('Your subscription will end on ' + fmtDate(d.currentPeriodEnd) + ' — Pro stays active until then');
          return;
        }
        if (stripeManaged && !d.isPro) {
          if (window.UI) UI.toast('Your Coilover Pro subscription has ended');
          return;
        }
        /* still active and not scheduled to cancel. Poll a couple times first so a
           just-made cancel has time to reflect, then confirm. */
        if (tries < 4) return setTimeout(poll, 1500);
        if (window.UI) UI.toast('Your subscription is active');
      });
    })();
  }

  /* Stripe Checkout. This function itself has no platform check — pro.js is
     what decides WHEN to call it: the only path on the plain website (no
     StoreKit there), and a secondary "or subscribe on the web" link inside the
     native app, never the native app's main Subscribe button (see pro.js). */
  function stripeCheckout(plan) {
    var user = window.CARBOX_USER;
    if (!user || !user.id) {
      /* window.CARBOX_USER is set by supabase.js reconcile() once the session
         resolves, so this is either "not signed in" or "signed in but the
         session hasn't loaded yet". Both are fixed by signing in. */
      return Promise.reject(billingError('not-signed-in', 'no signed-in user to attach the subscription to'));
    }
    return api('/api/stripe-checkout', { plan: plan, userId: user.id, email: user.email })
      .then(function (data) {
        if (data && data.url) { location.href = data.url; return new Promise(function () {}); /* navigating away */ }
        throw billingError('server', 'checkout session had no url');
      });
  }

  function purchase(plan) {
    var n = native();
    if (n && n.purchase) {
      return Promise.resolve(n.purchase(plan)).then(function (active) { if (active) setPro(true); return !!active; });
    }
    if (!insideNativeShell()) return stripeCheckout(plan);
    /* Inside the native shell but the StoreKit bridge isn't available — FAIL,
       never grant Pro. (The old dev fallback here granted Pro for free, which
       leaked into the cloud and gave new sign-ins free Pro. Removed.) */
    return Promise.reject(billingError('server', 'In-app purchase isn’t available in this build.'));
  }
  function restore() {
    var n = native();
    if (n && n.restore) {
      return Promise.resolve(n.restore()).then(function (active) { setPro(!!active); return !!active; });
    }
    if (!insideNativeShell()) return refreshFromCloud();
    return Promise.resolve(!!(window.CarBox && CarBox.get('isPro')));
  }
  function manage() {
    var n = native();
    if (n && n.manage) { n.manage(); return; }
    if (!insideNativeShell()) {
      var user = window.CARBOX_USER;
      if (!user || !user.id) { if (window.UI) UI.toast('Sign in first'); return; }
      api('/api/stripe-portal', { userId: user.id }).then(function (data) {
        if (data && data.url) location.href = data.url;
        else if (window.UI) UI.toast('No subscription on file yet');
      }, function (err) {
        if (window.UI) UI.toast(purchaseErrorText(err, 'Could not open billing portal'));
      });
      return;
    }
    var url = 'https://apps.apple.com/account/subscriptions';
    try { var w = window.open(url, '_blank'); if (!w) location.href = url; } catch (e) { location.href = url; }
  }

  /* handle the redirect back from a Stripe Checkout session (success_url /
     cancel_url in stripe-checkout.js both point at index.html?stripe=...) */
  function handleStripeReturn() {
    var status;
    try { status = new URLSearchParams(location.search).get('stripe'); } catch (e) { return; }
    if (!status) return;
    try { history.replaceState({}, '', location.pathname); } catch (e) {}
    if (status === 'cancel') { if (window.UI) UI.toast('Checkout cancelled'); return; }
    if (status !== 'success') return;
    if (window.UI) UI.toast('Finishing up your subscription…');
    var tries = 0;
    (function poll() {
      tries++;
      refreshFromCloud().then(function (active) {
        if (active) { if (window.UI) UI.toast('Welcome to Coilover Pro'); return; }
        if (tries < 8) setTimeout(poll, 1200);
        else if (window.UI) UI.toast('Still confirming, check back in a minute');
      });
    })();
  }

  document.addEventListener('DOMContentLoaded', function () {
    syncEntitlement();
    handleStripeReturn();
    handlePortalReturn();
  });
  return {
    configured: configured,
    isPro: function () { return !!(window.CarBox && CarBox.get('isPro')); },
    purchase: purchase, restore: restore, manage: manage,
    purchaseViaStripe: stripeCheckout,
    errorText: purchaseErrorText
  };
})();
