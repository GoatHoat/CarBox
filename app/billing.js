/* CarBoxBilling — the single gate for the Pro entitlement.

   REAL iOS subscriptions run through StoreKit, which only exists in the native
   Expo shell. The recommended path is RevenueCat: the shell wires the RevenueCat
   SDK and injects a `window.CarBoxNativeBilling` bridge into the WebView with:
       getEntitlement() -> Promise<bool>   // is "pro" entitlement active
       purchase(plan)   -> Promise<bool>   // run StoreKit purchase, resolve active
       restore()        -> Promise<bool>   // StoreKit restore, resolve active
       manage()         -> void            // open the iOS subscriptions screen
   (See SUBMISSION_CHECKLIST.md + expo-shell for where to add it.)

   This module makes the app's existing `isPro` flag MIRROR that real entitlement
   whenever the native bridge is present, so every Pro gate (multi-car, goal/
   budget changes) is driven by StoreKit, not a local toggle.

   If the native bridge is absent (web preview / dev), it falls back to flipping
   the local flag so the app still runs. That path is NON-PRODUCTION and is
   flagged as such; a shipping build MUST have CarBoxNativeBilling. */
window.CarBoxBilling = (function () {
  function native() { return window.CarBoxNativeBilling || null; }
  function configured() { return !!native(); }

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

  function purchase(plan) {
    var n = native();
    if (n && n.purchase) {
      return Promise.resolve(n.purchase(plan)).then(function (active) { if (active) setPro(true); return !!active; });
    }
    /* NON-PRODUCTION fallback: no StoreKit here, so flip the local flag for testing. */
    setPro(true);
    return Promise.resolve(true);
  }
  function restore() {
    var n = native();
    if (n && n.restore) {
      return Promise.resolve(n.restore()).then(function (active) { setPro(!!active); return !!active; });
    }
    return Promise.resolve(!!(window.CarBox && CarBox.get('isPro')));
  }
  function manage() {
    var n = native();
    if (n && n.manage) { n.manage(); return; }
    var url = 'https://apps.apple.com/account/subscriptions';
    try { var w = window.open(url, '_blank'); if (!w) location.href = url; } catch (e) { location.href = url; }
  }

  document.addEventListener('DOMContentLoaded', syncEntitlement);
  return {
    configured: configured,
    isPro: function () { return !!(window.CarBox && CarBox.get('isPro')); },
    purchase: purchase, restore: restore, manage: manage
  };
})();
