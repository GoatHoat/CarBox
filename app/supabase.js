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

  /* ── push the full local state up (debounced) ── */
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
        sb.from('user_state').upsert({
          user_id: user.id, data: data, updated_at: new Date().toISOString()
        }).then(function () {}, function () {});
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
      if (!row || !row.data) { pushState(); return; }  /* nothing stored yet -> seed cloud from local */
      setLocal(row.data);
      if (window.CarBox && CarBox.reload) CarBox.reload();
      location.reload();                                 /* re-hydrate pages from pulled data (once) */
    }, function () {});
  }

  /* ── reconcile on every page load: logged in -> sync; else -> sign up if onboarding done ── */
  function reconcile() {
    sb.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      var local = localState();
      if (session && session.user) {
        window.CARBOX_USER = session.user;   /* lets uploads.js switch photos to real cloud Storage */
        pullOnce(session.user);
        return;
      }

      /* not logged in yet: if onboarding finished with creds, create the account now */
      var acct = local.account || {};
      if (local.onboardingComplete && acct.email && acct.password && !localStorage.getItem('cbSignedUp')) {
        sb.auth.signUp({ email: acct.email, password: acct.password }).then(function (res) {
          if (res && res.error) { return; }              /* e.g. already registered; leave local as-is */
          localStorage.setItem('cbSignedUp', '1');
          sb.auth.getSession().then(function (r2) {
            var s2 = r2 && r2.data && r2.data.session;
            if (s2 && s2.user) { writeProfile(s2.user, local).then(function () { pushState(); }, function () {}); }
            /* if email confirmation is ON, there is no session yet; the profile row is still
               created by the DB trigger, and state syncs after the user confirms + logs in. */
          });
        }, function () {});
      }
    }, function () {});
  }

  /* push whenever the store changes (only takes effect once a session exists) */
  if (window.CarBox && CarBox.subscribe) { CarBox.subscribe(function () { pushState(); }); }

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
