/* CarBoxUploads — real photo persistence via Supabase Storage.

   GUARDED: this only activates once the Supabase wire-up exists, i.e. a
   Supabase client at window.sb AND a signed-in user at window.CARBOX_USER
   (with an id). Until then CarBoxUploads.available() returns false and the
   callers keep their local behavior. We never fake cloud persistence.

   The `photos` bucket is PUBLIC-READ, so the returned URLs display without
   auth (matches the shareable public garage page). */
window.CarBoxUploads = (function () {
  var BUCKET = 'photos';

  function client() { return window.sb || null; }
  function user() { return window.CARBOX_USER || null; }
  function available() {
    var sb = client(), u = user();
    return !!(sb && sb.storage && u && u.id);
  }

  function dataURLtoBlob(d) {
    var a = d.split(','), m = (a[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
    var bin = atob(a[1]), n = bin.length, u8 = new Uint8Array(n);
    while (n--) u8[n] = bin.charCodeAt(n);
    return new Blob([u8], { type: m });
  }

  /* compress/resize client-side (max 1600px, JPEG ~0.8) -> Blob for upload */
  function compressBlob(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1600, w = img.width, h = img.height;
        if (w > max || h > max) { var s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        try {
          if (c.toBlob) c.toBlob(function (b) { cb(b); }, 'image/jpeg', 0.8);
          else cb(dataURLtoBlob(c.toDataURL('image/jpeg', 0.8)));
        } catch (e) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  /* Upload File objects to photos/${userId}/${carId}/${entryId}/... .
     Resolves to an array of { ok:true, url } | { ok:false } (per input).
     onEach(index, state, url) fires 'uploading' | 'ok' | 'fail' for UI. */
  function put(files, ctx, onEach) {
    return new Promise(function (resolve) {
      var out = new Array(files.length);
      if (!available()) { for (var k = 0; k < files.length; k++) out[k] = { ok: false }; resolve(out); return; }
      if (!files.length) { resolve(out); return; }
      var sb = client(), u = user(), done = 0;
      files.forEach(function (file, i) {
        if (onEach) onEach(i, 'uploading');
        compressBlob(file, function (blob) {
          if (!blob) { out[i] = { ok: false }; if (onEach) onEach(i, 'fail'); if (++done === files.length) resolve(out); return; }
          var path = u.id + '/' + ctx.carId + '/' + ctx.entryId + '/' + Date.now() + '_' + i + '.jpg';
          sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
            .then(function (res) {
              if (res.error) throw res.error;
              var pub = sb.storage.from(BUCKET).getPublicUrl(path);
              var url = pub && pub.data && pub.data.publicUrl;
              out[i] = { ok: true, url: url };
              if (onEach) onEach(i, 'ok', url);
              if (++done === files.length) resolve(out);
            })
            .catch(function () {
              out[i] = { ok: false };
              if (onEach) onEach(i, 'fail');
              if (++done === files.length) resolve(out);
            });
        });
      });
    });
  }

  return { available: available, put: put };
})();
