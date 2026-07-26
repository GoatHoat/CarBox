/* Coilover ↔ Supabase connector.
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
  if (!libOk || !keysOk) {
    /* app stays fully local — expose a no-op cloud reader so callers (garage.html,
       discover.html, settings) can branch on availability without knowing why */
    window.CarBoxCloud = {
      available: false,
      fetchPublicCar: function () { return Promise.resolve(null); },
      discover: function () { return Promise.resolve([]); },
      setDiscoverable: function () { return Promise.resolve(); }
    };
    return;
  }

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
    try { console.error('[Coilover] ' + msg, detail || ''); } catch (e) {}
    try { if (window.UI && UI.toast) UI.toast(msg); } catch (e) {}
  }

  var UNREACHABLE = 'Could not reach Coilover accounts — your data is saved on this device only';
  /* Turn a signUp failure into copy that points at the actual cause. */
  function signupErrorText(err) {
    var m = String((err && (err.message || err.msg)) || err || 'unknown error');
    var name = String((err && err.name) || '');
    if (/failed to fetch|networkerror|network request failed|load failed/i.test(m) ||
        /AuthRetryableFetchError/i.test(name)) return UNREACHABLE;
    if (/already registered|already exists/i.test(m)) {
      return 'That email already has a Coilover account — sign in instead';
    }
    return 'Could not create your Coilover account: ' + m;
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
        mirrorNormalized();                  /* additive: mirror cars/entries/posts up on load */
        /* reflect the cloud Discover opt-in into local state so the toggle is accurate */
        sb.from('profiles').select('discoverable').eq('id', session.user.id).maybeSingle().then(function (res) {
          var d = res && res.data;
          if (d && window.CarBox && !!CarBox.get('discoverable') !== !!d.discoverable) CarBox.set('discoverable', !!d.discoverable);
        }, function () {});
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

  /* push whenever the store changes (only takes effect once a session exists) */
  if (window.CarBox && CarBox.subscribe) {
    CarBox.subscribe(function () { pushState(); });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ADDITIVE cloud mirror → normalized cars/entries/posts tables.
     Runs ALONGSIDE the user_state blob sync above; it never replaces it. Local
     writes always land in localStorage first (state.js) with zero dependence on
     this. This best-effort mirror copies cars/entries/posts UP so OTHER users
     can read them (public garages, feed). Debounced + fully guarded: no session,
     or any failed cloud write, is swallowed and can never roll back or block the
     local save. "My own data" is still read from the local blob, unchanged; only
     OTHER users' data is read from these tables (see CarBoxCloud below).
     ══════════════════════════════════════════════════════════════════════════ */
  function makeModelFromLabel(label) {
    var t = String(label || '').trim().split(/\s+/);
    if (/^\d{4}$/.test(t[0])) t = t.slice(1);          /* drop a leading year */
    return { make: t[0] || null, model: t.slice(1).join(' ') || null };
  }
  function mirrorEntries(cloudCarId, entries) {
    /* replace-all: a car's entries are few, so delete + re-insert keeps the cloud
       copy an exact mirror without needing to map per-entry ids */
    return sb.from('entries').delete().eq('car_id', cloudCarId).then(function () {
      if (!entries || !entries.length) return;
      var rows = entries.map(function (e) {
        return {
          car_id: cloudCarId, type: e.type || 'mod', title: e.title || '',
          cost: e.cost || 0, miles: (typeof e.miles === 'number' ? e.miles : null),
          date: e.date || null, notes: e.notes || null, part: e.part || null,
          shop: e.shop || null, photos: e.photos || []
        };
      });
      return sb.from('entries').insert(rows);
    });
  }
  function mirrorCar(userId, c, idMap) {
    var v = c.vehicle || {};
    return sb.from('cars').upsert({
      client_id: c.id, user_id: userId,
      name: v.name || null, make: v.make || null, model: v.model || null,
      year: v.year || null, trim: v.trim || null, mileage: v.mileage || 0,
      specs: v.specs || null, appearance: c.appearance || null,
      goal: c.goal || null, is_public: true            /* synced cars are viewable by link */
    }, { onConflict: 'client_id' }).select('id').maybeSingle().then(function (res) {
      var cloudId = res && res.data && res.data.id;
      if (!cloudId) return;
      idMap[c.id] = cloudId;
      return mirrorEntries(cloudId, c.entries || []);
    });
  }
  function mirrorPosts(userId, posts, idMap) {
    var chain = Promise.resolve();
    (posts || []).forEach(function (p) {
      if (!p || !p.mine) return;                        /* only mirror MY posts */
      chain = chain.then(function () {
        var mm = makeModelFromLabel(p.carLabel);
        return sb.from('posts').upsert({
          client_id: p.id, user_id: userId,
          car_id: (p.carId && idMap[p.carId]) || null,
          car_label: p.carLabel || null, make: mm.make, model: mm.model,
          city: p.city || null, title_suffix: p.titleSuffix || null,
          description: p.description || null, photos: p.photos || []
        }, { onConflict: 'client_id' });
      });
    });
    return chain;
  }
  var mirrorT = null;
  function mirrorNormalized() {
    if (mirrorT) clearTimeout(mirrorT);
    mirrorT = setTimeout(function () {
      sb.auth.getUser().then(function (r) {
        var user = r && r.data && r.data.user;
        if (!user) return;                              /* not signed in -> nothing to mirror */
        var local = localState();
        var localCars = (local && local.cars) || [];
        var idMap = {};
        var chain = Promise.resolve();
        localCars.forEach(function (c) {
          chain = chain.then(function () { return mirrorCar(user.id, c, idMap); });
        });
        chain
          .then(function () { return mirrorPosts(user.id, (local && local.posts) || [], idMap); })
          .then(function () {}, function () {});          /* swallow: local was already saved */
      }, function () {});
    }, 1200);
  }
  /* additive second subscriber: mirror on every store change (pushState stays as-is) */
  if (window.CarBox && CarBox.subscribe) { CarBox.subscribe(mirrorNormalized); }

  /* ── read OTHER users' public data (the only path for non-local data) ── */
  window.CarBoxCloud = {
    available: true,
    /* resolve a shared garage link (garage.html?car=<local id>) to its public
       cloud data, or null if it isn't found / isn't public / the fetch fails */
    fetchPublicCar: function (clientId) {
      if (!clientId) return Promise.resolve(null);
      return sb.from('cars').select('*').eq('client_id', clientId).eq('is_public', true).maybeSingle()
        .then(function (res) {
          var row = res && res.data;
          if (!row) return null;
          return Promise.all([
            sb.from('entries').select('*').eq('car_id', row.id),
            sb.from('profiles').select('username,tag').eq('id', row.user_id).maybeSingle(),
            sb.from('posts').select('*').eq('user_id', row.user_id).order('created_at', { ascending: false })
          ]).then(function (arr) {
            var entries = (arr[0] && arr[0].data) || [];
            var prof = (arr[1] && arr[1].data) || {};
            var posts = (arr[2] && arr[2].data) || [];
            return {
              car: {
                vehicle: { name: row.name, make: row.make, model: row.model, year: row.year, trim: row.trim, specs: row.specs },
                appearance: row.appearance,
                entries: entries.map(function (e) { return { type: e.type, title: e.title, cost: e.cost, miles: e.miles, date: e.date }; }),
                likes: 0, comments: []       /* car likes/comments not mirrored yet (future step) */
              },
              profile: { name: (prof && prof.username) || 'Coilover owner', handle: (prof && prof.tag) || '' },
              posts: posts
            };
          });
        }, function () { return null; });
    },

    /* flip the current user's Discover opt-in (server-side profiles.discoverable,
       the field the discovery RLS gate reads). Best-effort. */
    setDiscoverable: function (on) {
      return sb.auth.getUser().then(function (r) {
        var u = r && r.data && r.data.user;
        if (!u) return;
        return sb.from('profiles').update({ discoverable: !!on }).eq('id', u.id);
      }).then(function () {}, function () {});
    },

    /* find OTHER users who opted into Discover, by car make/model/name or city.
       GATE: this reads the profiles table, whose "discoverable profiles read" RLS
       only returns rows where discoverable = true — so a non-opted-in user is
       never even enumerated here (enforced server-side, not just hidden). We then
       fetch only THOSE users' cars. Returns [] when signed-out/offline/none. */
    discover: function (query) {
      query = String(query || '').trim().toLowerCase();
      return sb.from('profiles').select('id,username,tag,city').eq('discoverable', true).limit(200)
        .then(function (res) {
          var profs = (res && res.data) || [];
          if (!profs.length) return [];
          var byId = {};
          var ids = profs.map(function (p) { byId[p.id] = p; return p.id; });
          return sb.from('cars').select('client_id,name,make,model,year,appearance,user_id')
            .in('user_id', ids).eq('is_public', true).limit(300)
            .then(function (cres) {
              var cars = (cres && cres.data) || [];
              var list = cars.map(function (c) {
                var p = byId[c.user_id] || {};
                return {
                  carId: c.client_id, name: c.name, make: c.make, model: c.model, year: c.year,
                  appearance: c.appearance, username: p.username || '', tag: p.tag || '', city: p.city || ''
                };
              }).filter(function (x) { return x.carId; });
              if (query) {
                list = list.filter(function (x) {
                  return [x.name, x.make, x.model, x.city, x.username].join(' ').toLowerCase().indexOf(query) >= 0;
                });
              }
              return list;
            }, function () { return []; });
        }, function () { return []; });
    }
  };

  /* ── public auth helpers (used by login.html + settings sign out) ── */
  window.CarBoxAuth = {
    available: true,
    signIn: function (email, pass) { return sb.auth.signInWithPassword({ email: email, password: pass }); },
    signUp: function (email, pass) { return sb.auth.signUp({ email: email, password: pass }); },
    resetPassword: function (email) { return sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/login.html' }); },
    /* used by login.html's "set a new password" panel, reached via the emailed
       reset link (Supabase puts the recovery session in the URL, which the
       client auto-detects — see the onAuthStateChange listener in login.html) */
    updatePassword: function (newPass) { return sb.auth.updateUser({ password: newPass }); },
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
