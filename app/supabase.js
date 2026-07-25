/* CarBox ↔ Supabase connector.
   ADDITIVE + defensive: the app keeps working entirely on localStorage (via
   state.js). This layer adds real accounts and cloud persistence on top:
     • signup during onboarding creates a real Supabase Auth user
     • the whole app state is synced to a per-user row (user_state table)
     • on another device, logging in pulls that state back

   If the Supabase library/keys/tables aren't present, or the network is down,
   every call fails quietly and the app just runs locally. Nothing here can
   block or break the existing experience.

   Requires: config.js (keys) + vendor/supabase.js (library), loaded before this. */
(function () {
  var cfg = window.CARBOX_CONFIG || {};
  var libOk = window.supabase && window.supabase.createClient;
  var keysOk = cfg.SUPABASE_URL && cfg.SUPABASE_URL.indexOf('PASTE') !== 0 && cfg.SUPABASE_ANON_KEY;
  if (!libOk || !keysOk) { return; }   /* app stays fully local */

  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  window.sb = sb;

  var KEY = 'carbox.v1';
  function localState() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function setLocal(obj) { try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {} }

  /* Sync failures stay quiet by design (the app is fully usable offline), but a
     failed SIGNUP is different: the account silently never exists, and the user
     only finds out when they try to log in on another device. Surface those.
     UI.toast isn't on every page that loads this file, so fall back to the
     console — the detail always lands somewhere. */
  function reportError(msg, detail) {
    try { console.error('[CarBox] ' + msg, detail || ''); } catch (e) {}
    try { if (window.UI && UI.toast) UI.toast(msg); } catch (e) {}
  }

  var UNREACHABLE = 'Could not reach CarBox accounts — your data is saved on this device only';
  /* Turn a signUp failure into copy that points at the actual cause. */
  function signupErrorText(err) {
    var m = String((err && (err.message || err.msg)) || err || 'unknown error');
    var name = String((err && err.name) || '');
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(m) ||
        /AuthRetryableFetchError/i.test(name)) return UNREACHABLE;
    if (/already registered|already exists/i.test(m)) {
      return 'That email already has a CarBox account — sign in instead';
    }
    return 'Could not create your CarBox account: ' + m;
  }

  /* Fields the SERVER owns — written only by the Stripe webhook, never by the
     device. A full-blob upsert of local state would wipe them, which would
     "un-stick" a real purchase the next time the device pushed (the webhook marks
     you Pro in the cloud, then a routine push overwrites it back). So pushState
     MERGES: it keeps these from the current cloud row. */
  var STRIPE_FIELDS = ['stripeCustomerId', 'stripeSubscriptionId', 'subscriptionStatus', 'cancelAtPeriodEnd', 'currentPeriodEnd'];

  /* ── push the local state up (debounced), preserving server-owned fields ── */
  var pushT = null;
  function pushState() {
    if (pushT) clearTimeout(pushT);
    pushT = setTimeout(function () {
      sb.auth.getUser().then(function (r) {
        var user = r && r.data && r.data.user;
        if (!user) return;
        /* never sync the plaintext signup password to the cloud (auth handles it) */
        var data = localState();
        if (data && data.account && data.account.password) {
          data = JSON.parse(JSON.stringify(data));
          delete data.account.password;
        }
        /* read the current cloud row so we don't clobber what the webhook wrote */
        sb.from('user_state').select('data').eq('user_id', user.id).maybeSingle().then(function (res) {
          var cloud = (res && res.data && res.data.data) || {};
          var stripeManaged = !!(cloud.stripeSubscriptionId || cloud.stripeCustomerId);
          STRIPE_FIELDS.forEach(function (k) {
            if (cloud[k] !== undefined) data[k] = cloud[k]; else delete data[k];
          });
          /* Pro is cloud-authoritative for Stripe subscribers; for native/free
             accounts the device value (StoreKit/local) is kept and synced up. */
          if (stripeManaged) data.isPro = !!cloud.isPro;
          sb.from('user_state').upsert({
            user_id: user.id, data: data, updated_at: new Date().toISOString()
          }).then(function () {}, function () {});
        }, function () { /* couldn't read cloud: skip rather than risk clobbering entitlement */ });
      });
    }, 800);
  }

  /* ── write the profile row (username/tag/name/birthday) for a user ── */
  function writeProfile(user, local) {
    var acct = local.account || {};
    var prof = local.profile || {};
    return sb.from('profiles').upsert({
      id: user.id,
      first_name: acct.firstName || null,
      last_name: acct.lastName || null,
      username: prof.name || null,
      tag: prof.handle || null,
      birthday: local.birthday || null,
      is_pro: !!local.isPro
    });
  }

  /* ── pull cloud state down once per browser session ── */
  function pullOnce(user) {
    if (sessionStorage.getItem('cbPulled')) return;
    sessionStorage.setItem('cbPulled', '1');
    sb.from('user_state').select('data').eq('user_id', user.id).maybeSingle().then(function (res) {
      var row = res && res.data;
      if (res && res.error) { pushState(); return; }
      /* Only adopt a cloud row that is a REAL, completed garage. An empty or
         half-written {} would blank the app and could churn reloads; in that
         case seed the cloud from local instead. */
      if (!row || !row.data || !row.data.onboardingComplete) { pushState(); return; }
      setLocal(row.data);
      if (window.CarBox && CarBox.reload) CarBox.reload();
      location.reload();                                 /* re-hydrate pages from pulled data (once) */
    }, function () {});
  }

  /* Pull the Pro entitlement DOWN from the cloud when the account is Stripe-managed.
     The Stripe webhook writes user_state.data.isPro authoritatively; the device
     otherwise only ever pushes state UP, so without this a server-side cancel or
     lapse would never reach the app. Only STRIPE-managed accounts are governed by
     the cloud here (they carry a stripeCustomerId/stripeSubscriptionId); native
     StoreKit users are governed by billing.js syncEntitlement() instead, and
     non-subscribers keep the device-wins behaviour. Returns a promise so the
     caller can order it before pushState(). */
  function reconcileEntitlement(user) {
    return sb.from('user_state').select('data').eq('user_id', user.id).maybeSingle().then(function (res) {
      var d = res && res.data && res.data.data;
      if (!d) return;
      if (!(d.stripeSubscriptionId || d.stripeCustomerId)) return;   /* not Stripe-managed */
      var cloudPro = !!d.isPro;
      var localPro = !!(window.CarBox && CarBox.get('isPro'));
      if (cloudPro === localPro) return;
      if (window.CarBox) CarBox.set('isPro', cloudPro);
      /* fire the same event pages already listen for on unlock; a distinct one on
         lapse so a downgrade can re-lock live if a page cares (else it re-locks on
         the next navigation, which is when reconcile runs again anyway). */
      try { document.dispatchEvent(new CustomEvent(cloudPro ? 'carbox-pro' : 'carbox-pro-lapsed')); } catch (e) {}
    }, function () { /* offline: keep whatever the device has */ });
  }

  /* ── reconcile on every page load: logged in -> sync; else -> sign up if onboarding done ── */
  function reconcile() {
    sb.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      var local = localState();
      if (session && session.user) {
        window.CARBOX_USER = session.user;   /* lets uploads.js switch photos to real cloud Storage */
        /* Adopt cloud state ONLY on a fresh device with no local garage yet
           (e.g. logging in on a new phone). If THIS device already finished
           onboarding, do NOT overwrite its local state or hard-reload under the
           user — that clobbers good local data with a possibly older cloud copy
           and interrupts taps (the page reloading a second or two after load
           feels like "nothing works / can't switch tabs"). Just sync upward.
           A proper two-way merge is a future improvement; for now the device
           you're actively using always wins. */
        if (local && local.onboardingComplete) {
          /* The device wins for the garage data it's actively editing, BUT the Pro
             entitlement is the one field the SERVER owns for a Stripe subscriber:
             the webhook writes isPro (true through a paid/canceled-but-not-yet-
             ended period, false once it lapses). Pull that down FIRST, then push
             the (corrected) local state up — otherwise a stale local isPro:true
             would re-clobber a server-side cancellation. */
          reconcileEntitlement(session.user).then(function () { pushState(); }, function () { pushState(); });
        }
        else { pullOnce(session.user); }
        return;
      }

      /* not logged in yet: if onboarding finished with creds, create the account now */
      var acct = local.account || {};
      if (local.onboardingComplete && acct.email && acct.password && !localStorage.getItem('cbSignedUp')) {
        sb.auth.signUp({ email: acct.email, password: acct.password }).then(function (res) {
          if (res && res.error) {
            /* Leave local state as-is either way — the app keeps working — but say
               so, because an unreported failure here means "no account was ever
               created" and nothing else in the UI would ever hint at it.
               NOTE: supabase-js does NOT reject on network failure — it resolves
               with the error in here ("Failed to fetch" / AuthRetryableFetchError),
               so an unreachable project must be recognised in THIS branch or it
               gets misreported as a bad-account problem. */
            reportError(signupErrorText(res.error), res.error);
            return;
          }
          localStorage.setItem('cbSignedUp', '1');
          sb.auth.getSession().then(function (r2) {
            var s2 = r2 && r2.data && r2.data.session;
            if (s2 && s2.user) { writeProfile(s2.user, local).then(function () { pushState(); }, function () {}); }
            /* if email confirmation is ON, there is no session yet; the profile row is still
               created by the DB trigger, and state syncs after the user confirms + logs in. */
          });
        }, function (err) {
          /* Backstop: supabase-js normally resolves-with-error even for network
             failures (handled above), so this only fires if the client itself
             throws. Report it rather than swallowing it. */
          reportError(signupErrorText(err), err);
        });
      }
    }, function () {});
  }

  /* ── keep profiles.discoverable / profiles.city in sync (Social, 2026-07-24) ──
     Discover reads other users' rows straight from `profiles`/`cars` (RLS-gated),
     NOT from the per-user `user_state` JSON blob that pushState() writes — so
     those two fields need their own direct upsert whenever they change, or a
     user flipping the Settings toggle would never actually become discoverable. */
  function pushProfileField(key, value) {
    if (key !== 'discoverable' && key !== 'city') return;
    sb.auth.getUser().then(function (r) {
      var user = r && r.data && r.data.user;
      if (!user) return;
      var patch = { id: user.id };
      patch[key] = value;
      sb.from('profiles').upsert(patch).then(function () {}, function () {});
    });
  }

  /* push whenever the store changes (only takes effect once a session exists) */
  if (window.CarBox && CarBox.subscribe) {
    CarBox.subscribe(function (key, value) { pushState(); pushProfileField(key, value); });
  }

  /* ── public auth helpers (used by login.html + settings sign out) ── */
  window.CarBoxAuth = {
    available: true,
    signIn: function (email, pass) { return sb.auth.signInWithPassword({ email: email, password: pass }); },
    signUp: function (email, pass) { return sb.auth.signUp({ email: email, password: pass }); },
    resetPassword: function (email) { return sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/login.html' }); },
    signOut: function () {
      sessionStorage.removeItem('cbPulled');
      localStorage.removeItem('cbSignedUp');
      return sb.auth.signOut();
    },
    getUser: function () { return sb.auth.getUser(); },
    pushNow: pushState
  };

  reconcile();

  /* wire the Settings sign-out button to also end the Supabase session */
  document.addEventListener('DOMContentLoaded', function () {
    var so = document.getElementById('signout');
    if (so) so.addEventListener('click', function () { try { CarBoxAuth.signOut(); } catch (e) {} });
  });
})();
