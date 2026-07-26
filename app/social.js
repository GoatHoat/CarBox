/* Coilover social ("For You") — data layer + shared bits for the feed, the compose
   flow, post detail, comments/replies, and the notifications they generate.

   LOCAL-ONLY for now (like the rest of the app): everything lives in the Coilover
   store under the top-level `posts` and `notifications` keys and persists to
   localStorage. A real cross-user feed needs a backend — every place that would
   become a network call is marked `BACKEND:` so the swap is mechanical. Nothing
   here is wired to Supabase yet; it is fully built and usable on-device.

   Requires state.js (window.CarBox) + ui.js (window.UI) loaded first. */
window.Social = (function () {
  var MAX_PHOTOS = 5;
  var MAX_DESC_WORDS = 80;

  /* ── who "I" am (from the Coilover profile) ── */
  function me() {
    var p = (window.CarBox && CarBox.get('profile')) || {};
    return { handle: p.handle || '@you', name: p.name || 'You', mine: true };
  }
  /* the locked car prefix a new post's title must start with: "Year Make Model" */
  function carLabel() {
    var v = (window.CarBox && CarBox.get('vehicle')) || {};
    var parts = [v.year, v.make, v.model].filter(function (x) { return x != null && x !== ''; });
    return parts.join(' ') || (v.name || 'My car');
  }

  /* ── store access ── */
  function allPosts() { return (window.CarBox && CarBox.get('posts')) || []; }
  function savePosts(list) { CarBox.set('posts', list); }
  function feed() { return allPosts(); }                 /* newest first (kept in order) */
  function myPosts() { return allPosts().filter(function (p) { return p.mine; }); }
  function getPost(id) {
    var l = allPosts();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function uid(prefix) { return (prefix || 'p') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ── posting ──
     draft = { titleSuffix, description, photos:[dataUrl|url] }. The stored title
     is "<carLabel> : <titleSuffix>" so the feed can show it verbatim. */
  function addPost(draft) {
    var m = me();
    var post = {
      id: uid('post'),
      mine: true,
      carId: (window.CarBox && CarBox.activeCarId && CarBox.activeCarId()) || null,
      author: { handle: m.handle, name: m.name },
      carLabel: carLabel(),
      city: myCity(),
      titleSuffix: (draft.titleSuffix || '').trim(),
      description: (draft.description || '').trim(),
      photos: (draft.photos || []).slice(0, MAX_PHOTOS),
      likes: 0, liked: false,
      comments: [],
      ts: Date.now()
    };
    var list = allPosts();
    list.unshift(post);          /* BACKEND: POST /posts, then prepend the returned row */
    savePosts(list);
    return post.id;
  }
  function fullTitle(post) {
    return post.carLabel + (post.titleSuffix ? ' : ' + post.titleSuffix : ' :');
  }

  function toggleLike(id) {
    var list = allPosts(), changed = false;
    list.forEach(function (p) {
      if (p.id !== id) return;
      p.liked = !p.liked;
      p.likes = Math.max(0, (p.likes || 0) + (p.liked ? 1 : -1));
      changed = true;
      /* BACKEND: POST/DELETE /posts/:id/like. For someone else's post a like
         would notify THEM; our local notifications only cover MY posts (below). */
    });
    if (changed) savePosts(list);
    return getPost(id);
  }

  /* add a comment (parentId set = a reply). Returns the new comment id. */
  function addComment(id, text, parentId, replyToHandle) {
    text = (text || '').trim();
    if (!text) return null;
    var m = me();
    var c = {
      id: uid('c'), author: { handle: m.handle, name: m.name, mine: true },
      text: text, parentId: parentId || null, replyTo: replyToHandle || null, ts: Date.now()
    };
    var list = allPosts();
    list.forEach(function (p) { if (p.id === id) p.comments.push(c); });
    savePosts(list);              /* BACKEND: POST /posts/:id/comments */
    return c.id;
  }
  /* comments arranged as top-level threads with their replies, oldest first */
  function threads(post) {
    var tops = [], byId = {};
    (post.comments || []).forEach(function (c) { byId[c.id] = c; });
    (post.comments || []).forEach(function (c) { if (!c.parentId) tops.push({ c: c, replies: [] }); });
    var map = {};
    tops.forEach(function (t) { map[t.c.id] = t; });
    (post.comments || []).forEach(function (c) {
      if (c.parentId && map[c.parentId]) map[c.parentId].replies.push(c);
    });
    return tops;
  }
  function commentCount(post) { return (post.comments || []).length; }

  /* ── notifications (who liked / commented on MY posts) ──
     One top-level list, newest first. Tap → jump to the post (+ comment). */
  function notifs() { return (window.CarBox && CarBox.get('notifications')) || []; }
  function saveNotifs(list) { CarBox.set('notifications', list); }
  function addNotif(n) {
    var list = notifs();
    n.id = n.id || uid('n'); n.unread = true; n.ts = n.ts || Date.now();
    list.unshift(n);
    saveNotifs(list);
  }
  function markNotifsRead() {
    var list = notifs(); var changed = false;
    list.forEach(function (n) { if (n.unread) { n.unread = false; changed = true; } });
    if (changed) saveNotifs(list);
  }
  function unreadCount() { return notifs().filter(function (n) { return n.unread; }).length; }

  /* ── search + filters ──────────────────────────────────────────────────────
     All client-side over the local feed for now. BACKEND: these become query
     params on GET /posts (full-text q, make, mod, and a geo "near me" radius). */
  var MODS = [
    { id: 'intake', label: 'Intake', kw: ['intake', 'cold air', 'cai'] },
    { id: 'exhaust', label: 'Exhaust', kw: ['exhaust', 'turbo-back', 'turbo back', 'cat-back', 'catback', 'downpipe', 'muffler'] },
    { id: 'tune', label: 'Tune', kw: ['tune', 'ecu', 'stage', 'flash', 'dyno'] },
    { id: 'forced-induction', label: 'Turbo / SC', kw: ['turbo', 'supercharg', 'boost', 'intercooler'] },
    { id: 'suspension', label: 'Suspension', kw: ['coilover', 'suspension', 'lowering', 'spring', 'sway', 'drop'] },
    { id: 'wheels', label: 'Wheels & tires', kw: ['wheel', 'tire', 'rim', 'tyre'] },
    { id: 'brakes', label: 'Brakes', kw: ['brake', 'pad', 'rotor', 'caliper'] },
    { id: 'looks', label: 'Looks', kw: ['wrap', 'paint', 'tint', 'wing', 'aero', 'stance', 'body'] }
  ];
  function postText(p) {
    return ((p.carLabel || '') + ' ' + (p.titleSuffix || '') + ' ' + (p.description || '') + ' ' +
      ((p.author && ((p.author.name || '') + ' ' + (p.author.handle || ''))) || '')).toLowerCase();
  }
  function makeOf(p) { var t = (p.carLabel || '').trim().split(/\s+/); return (/^\d{4}$/.test(t[0]) ? t[1] : t[0]) || ''; }
  function makes() {
    var seen = {}, out = [];
    feed().forEach(function (p) { var m = makeOf(p); if (m && !seen[m.toLowerCase()]) { seen[m.toLowerCase()] = 1; out.push(m); } });
    return out.sort();
  }
  function matchMod(p, modId) {
    var m = null; MODS.forEach(function (x) { if (x.id === modId) m = x; });
    if (!m) return true;
    var t = postText(p);
    for (var i = 0; i < m.kw.length; i++) if (t.indexOf(m.kw[i]) >= 0) return true;
    return false;
  }
  /* demo location: real geo needs the backend. Posts carry a `city`; "near me"
     matches the user's city (falls back to a demo default). */
  function myCity() {
    var prof = (window.CarBox && CarBox.get('profile')) || {};
    return (prof.city || 'Austin');
  }
  /* apply q + {make, mod, nearMe} to a list of posts */
  function search(list, q, filters) {
    filters = filters || {};
    q = (q || '').trim().toLowerCase();
    var city = myCity().toLowerCase();
    return list.filter(function (p) {
      if (q && postText(p).indexOf(q) < 0) return false;
      if (filters.make && makeOf(p).toLowerCase() !== filters.make.toLowerCase()) return false;
      if (filters.mod && !matchMod(p, filters.mod)) return false;
      if (filters.nearMe && String(p.city || '').toLowerCase() !== city) return false;
      return true;
    });
  }

  /* ── time-ago ── */
  function ago(ts) {
    var s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60); if (m < 60) return m + 'm';
    var h = Math.floor(m / 60); if (h < 24) return h + 'h';
    var d = Math.floor(h / 24); if (d < 7) return d + 'd';
    return Math.floor(d / 7) + 'w';
  }

  /* ── image compression for uploads (max 1400px, JPEG) → data URL ──
     BACKEND: swap for an upload to object storage and store the returned URL. */
  function compress(file, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var max = 1400, w = img.width, h = img.height;
        if (w > max || h > max) { var r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        try { cb(cv.toDataURL('image/jpeg', 0.82)); } catch (err) { cb(e.target.result); }
      };
      img.onerror = function () { cb(e.target.result); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* ── pixel icons: the user's own heart art (outline → solid on like) + a
     matching pixel comment. Black PNGs on transparent; dark mode inverts them
     via CSS (.pxheart/.pxcomment). ── */
  var ICON = {
    heart: function (filled) {
      return '<img class="pxheart' + (filled ? ' on' : '') + '" src="assets/' +
        (filled ? 'icon_heart_solid.png' : 'icon_heart.png') + '" alt="' + (filled ? 'Liked' : 'Like') + '">';
    },
    comment: function () {
      return '<img class="pxcomment" src="assets/icon_comment_px.png" alt="Comment">';
    },
    person: function () {
      return '<img class="pxperson" src="assets/nav_person.png" alt="">';
    },
    dots: function () {
      return '<svg class="pxdots" viewBox="0 0 24 24" aria-hidden="true">' +
        '<circle cx="5" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>' +
        '<circle cx="19" cy="12" r="2.2" fill="currentColor"/></svg>';
    },
    plus: function () {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4 H13 V11 H20 V13 H13 V20 H11 V13 H4 V11 H11 Z" ' +
        'fill="currentColor" shape-rendering="crispEdges"/></svg>';
    }
  };

  /* an avatar chip (black circle + optional initial), matching the app's style */
  function avatar(user, size) {
    var s = size || 34;
    var initial = ((user && (user.name || user.handle) || '?').replace(/[@\s]/g, '').charAt(0) || '?').toUpperCase();
    var el = document.createElement('span');
    el.className = 'sv-avatar';
    el.style.width = el.style.height = s + 'px';
    el.style.fontSize = Math.round(s * 0.42) + 'px';
    el.textContent = initial;
    return el;
  }

  /* ── retroactive cleanup: strips the fake TurboTom/LinaDrives/ApexAri seed
     posts (and their notifications) that an OLDER build already wrote into
     someone's localStorage before fake seeding was removed. Fixing the
     seeder alone doesn't touch data it already persisted on a device — this
     is what actually removes it. Exact-id match only, so it can never touch
     a real post/notification. Safe to run every load (no-op once clean). */
  var FAKE_SEED_IDS = { 'seed-1': 1, 'seed-2': 1, 'seed-3': 1, 'seed-mine-1': 1, 'seed-mine-2': 1 };
  function purgeFakeSeed() {
    var posts = CarBox.get('posts');
    if (Array.isArray(posts)) {
      var cleanPosts = posts.filter(function (p) { return !FAKE_SEED_IDS[p.id]; });
      if (cleanPosts.length !== posts.length) CarBox.set('posts', cleanPosts);
    }
    var notifs = CarBox.get('notifications');
    if (Array.isArray(notifs)) {
      var cleanNotifs = notifs.filter(function (n) { return !FAKE_SEED_IDS[n.postId]; });
      if (cleanNotifs.length !== notifs.length) CarBox.set('notifications', cleanNotifs);
    }
  }

  /* ── first-run init: no fake users/posts — the feed starts genuinely empty
     until the person actually posts something. Only marks `posts` as
     initialized (so this doesn't re-run every load); never touches
     `notifications` (that would clobber real ones). Idempotent. */
  function seedIfEmpty() {
    if (!window.CarBox) return;
    purgeFakeSeed();
    if (CarBox.get('posts')) return;               /* already initialized */
    CarBox.set('posts', []);
  }

  return {
    MAX_PHOTOS: MAX_PHOTOS, MAX_DESC_WORDS: MAX_DESC_WORDS,
    me: me, carLabel: carLabel,
    feed: feed, myPosts: myPosts, getPost: getPost, fullTitle: fullTitle,
    addPost: addPost, toggleLike: toggleLike, addComment: addComment,
    threads: threads, commentCount: commentCount,
    MODS: MODS, makes: makes, search: search, myCity: myCity,
    notifs: notifs, addNotif: addNotif, markNotifsRead: markNotifsRead, unreadCount: unreadCount,
    ago: ago, compress: compress, ICON: ICON, avatar: avatar, seedIfEmpty: seedIfEmpty
  };
})();
