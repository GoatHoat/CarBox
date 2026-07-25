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

  /* ── one-time seed so the feed, grid, and notifications have content ──
     Several other users' posts + two of MINE (which the garage grid shows and
     which the seeded likes/comments notify me about). Idempotent. */
  function seedIfEmpty() {
    if (!window.CarBox) return;
    if (CarBox.get('posts')) return;               /* already seeded/created */
    var now = Date.now(), H = 3600000;
    var EX = ['assets/photo_exhaust_1.jpg', 'assets/photo_exhaust_2.jpg', 'assets/photo_exhaust_3.jpg'];
    function c(handle, name, text, mins, parentId, replyTo) {
      return { id: uid('c'), author: { handle: handle, name: name, mine: false }, text: text,
        parentId: parentId || null, replyTo: replyTo || null, ts: now - mins * 60000 };
    }
    var mine = me();
    var myA = { handle: mine.handle, name: mine.name };
    var posts = [
      { id: 'seed-1', mine: false, author: { handle: '@TurboTom', name: 'Turbo Tom' }, city: 'Austin',
        carLabel: '2019 Subaru WRX STI', titleSuffix: 'Full turbo-back exhaust + tune',
        description: 'Finally finished the turbo-back with a Cobb Stage 2 tune. Sounds unreal and pulls so much harder up top. Swipe for the before/after.',
        photos: [EX[0], EX[1]], likes: 214, liked: false, ts: now - 2 * H,
        comments: [ c('@LinaDrives', 'Lina', 'That note must be insane in person.', 90),
          c('@BoostedBen', 'Ben', 'What downpipe did you run?', 70),
          c('@TurboTom', 'Turbo Tom', 'Catless 3in, worth every penny', 60, null, null) ] },
      { id: 'seed-2', mine: false, author: { handle: '@LinaDrives', name: 'Lina Drives' }, city: 'Denver',
        carLabel: '2021 BMW M240i', titleSuffix: 'New wheels + a small drop',
        description: 'Went with 19s and lowering springs. Closed the wheel gap and it finally sits right.',
        photos: [EX[2]], likes: 98, liked: false, ts: now - 6 * H,
        comments: [ c('@TurboTom', 'Turbo Tom', 'Stance is perfect', 200) ] },
      { id: 'seed-3', mine: false, author: { handle: '@ApexAri', name: 'Apex Ari' }, city: 'Austin',
        carLabel: '2018 Honda Civic Type R', titleSuffix: 'Track day advice?',
        description: 'First HPDE next month. Pads and fluid are done. Anything else I should sort before I go?',
        photos: [EX[1]], likes: 41, liked: false, ts: now - 20 * H, comments: [] },
      /* MY posts (show on the garage grid; seeded activity feeds notifications) */
      { id: 'seed-mine-1', mine: true, carId: (CarBox.activeCarId && CarBox.activeCarId()) || null,
        author: myA, city: myCity(), carLabel: carLabel(), titleSuffix: 'Fresh coilovers went on today',
        description: 'Dialed in the ride height and corner balanced it. Night and day difference in the twisties.',
        photos: [EX[2], EX[0]], likes: 12, liked: false, ts: now - 26 * H,
        comments: [ c('@TurboTom', 'Turbo Tom', 'Looks mean, what brand?', 300) ] },
      { id: 'seed-mine-2', mine: true, carId: (CarBox.activeCarId && CarBox.activeCarId()) || null,
        author: myA, city: myCity(), carLabel: carLabel(), titleSuffix: 'Just want to connect with local builds',
        description: 'New to the area and looking for people to drive with on weekends.',
        photos: [EX[1]], likes: 5, liked: false, ts: now - 50 * H, comments: [] }
    ];
    CarBox.set('posts', posts);

    /* notifications about MY posts (newest first) */
    CarBox.set('notifications', [
      { id: uid('n'), type: 'comment', postId: 'seed-mine-1', commentId: posts[3].comments[0].id,
        user: { handle: '@TurboTom', name: 'Turbo Tom' }, text: 'Looks mean, what brand?', unread: true, ts: now - 300 * 60000 },
      { id: uid('n'), type: 'like', postId: 'seed-mine-1',
        user: { handle: '@LinaDrives', name: 'Lina Drives' }, unread: true, ts: now - 240 * 60000 },
      { id: uid('n'), type: 'like', postId: 'seed-mine-2',
        user: { handle: '@ApexAri', name: 'Apex Ari' }, unread: false, ts: now - 600 * 60000 }
    ]);
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
