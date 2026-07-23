/* CarBoxPDF — client-side "vehicle history" PDF export for resale (Pro feature).
   100% on-device, NO API key: uses the locally bundled jsPDF (vendor/jspdf.umd.min.js).
   Embeds entry photos (data URLs or public Supabase URLs) and lays the log out
   like a maintenance/build record. Empty logs still export the car summary. */
window.CarBoxPDF = (function () {
  var BROWN = [97, 81, 66];       /* #615142 brand accent */
  var INK = [20, 18, 16];
  var MUT = [130, 122, 114];

  function loadImg(src) {
    return new Promise(function (resolve) {
      if (!src) { resolve(null); return; }
      var img = new Image();
      img.crossOrigin = 'anonymous';   /* Supabase public bucket sends CORS; lets canvas export */
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth || 1; c.height = img.naturalHeight || 1;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve({ data: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height });
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  /* the active car's sprite, tinted with its appearance, as a data URL */
  function spriteData(car) {
    return new Promise(function (resolve) {
      var ap = car.appearance || { presetId: 'body_suv', hue: null, shade: 1 };
      if (!(window.UI && UI.tintSprite)) { resolve(null); return; }
      UI.tintSprite('assets/' + ap.presetId + '.png', ap.hue, ap.shade, function (url) { loadImg(url).then(resolve); });
    });
  }

  var CHIP = { mod: 'MOD', maint: 'MAINTENANCE', repair: 'REPAIR', cosmetic: 'COSMETIC' };

  async function exportActiveCar() {
    var ctor = window.jspdf && window.jspdf.jsPDF;
    if (!ctor) { if (window.UI) UI.toast('PDF tool not available'); return; }
    if (window.UI) UI.toast('Building your history PDF…');

    var car = CarBox.activeCar();
    var v = car.vehicle || {};
    var prof = CarBox.get('profile') || {};
    var totals = CarBox.totals();
    var entries = (car.entries || []).slice();

    /* preload all images (sprite + entry photos) before drawing */
    var sprite = await spriteData(car);
    var photoMap = {};
    for (var i = 0; i < entries.length; i++) {
      var ph = (entries[i].photos || []).slice(0, 3);
      photoMap[i] = [];
      for (var j = 0; j < ph.length; j++) { photoMap[i].push(await loadImg(ph[j])); }
    }

    var doc = new ctor({ unit: 'pt', format: 'a4' });
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();
    var M = 42, y = M;

    function ensure(space) { if (y + space > H - M) { doc.addPage(); y = M; } }
    function rule() { doc.setDrawColor(220, 216, 210); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 14; }

    /* ── header: CarBox wordmark + generated date ── */
    doc.setFont('times', 'bold'); doc.setFontSize(26); doc.setTextColor(BROWN[0], BROWN[1], BROWN[2]);
    doc.text('CarBox', M, y + 6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(MUT[0], MUT[1], MUT[2]);
    doc.text('Vehicle history report', M, y + 22);
    var today = new Date();
    var dstr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text('Generated ' + dstr, W - M, y + 6, { align: 'right' });
    y += 34; rule();

    /* ── car headline + sprite ── */
    if (sprite) {
      var iw = 150, ih = iw * (sprite.h / sprite.w);
      if (ih > 90) { ih = 90; iw = ih * (sprite.w / sprite.h); }
      try { doc.addImage(sprite.data, 'JPEG', W - M - iw, y, iw, ih); } catch (e) {}
    }
    doc.setFont('times', 'bold'); doc.setFontSize(22); doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(String(v.name || 'Vehicle'), M, y + 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(MUT[0], MUT[1], MUT[2]);
    var sub = [v.year, [v.make, v.model].filter(Boolean).join(' '), v.trim].filter(Boolean).join('  ·  ');
    doc.text(sub, M, y + 36);
    doc.text('Owner: ' + (prof.name || '') + (prof.handle ? '  ' + prof.handle : ''), M, y + 52);
    doc.text('Odometer: ' + CarBox.fmtMiles(v.mileage || 0), M, y + 68);
    y += 92; ensure(0);

    /* ── specs ── */
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text('Specifications', M, y); y += 6; rule();
    var SPECS = [['Engine', 'engine'], ['Horsepower', 'horsepower'], ['Torque', 'torque'],
      ['Transmission', 'transmission'], ['Drivetrain', 'drivetrain'], ['0-60 mph', 'accel']];
    var s = v.specs || {}, colW = (W - 2 * M) / 2;
    doc.setFontSize(10);
    SPECS.forEach(function (r, idx) {
      var col = idx % 2, row = Math.floor(idx / 2);
      var x = M + col * colW, ry = y + row * 18;
      doc.setFont('helvetica', 'bold'); doc.setTextColor(MUT[0], MUT[1], MUT[2]);
      doc.text(r[0] + ':', x, ry);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(INK[0], INK[1], INK[2]);
      var val = (s[r[1]] && String(s[r[1]]).trim()) || '—';
      doc.text(doc.splitTextToSize(val, colW - 74), x + 74, ry);
    });
    y += 3 * 18 + 8;

    /* ── totals ── */
    ensure(40);
    doc.setFillColor(246, 243, 240); doc.roundedRect(M, y, W - 2 * M, 34, 8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(CarBox.fmtMoney(totals.invested), M + 16, y + 22);
    doc.text(String(totals.count), M + (W - 2 * M) / 2 + 16, y + 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(MUT[0], MUT[1], MUT[2]);
    doc.text('Total invested', M + 16, y + 10);
    doc.text('Log entries', M + (W - 2 * M) / 2 + 16, y + 10);
    y += 48;

    /* ── timeline ── */
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text('Build & maintenance history', M, y); y += 6; rule();

    if (!entries.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(MUT[0], MUT[1], MUT[2]);
      doc.text('No entries logged yet.', M, y + 6); y += 20;
    }

    entries.forEach(function (e, i) {
      ensure(70);
      var meta = [];
      if (e.date) meta.push(e.date);
      if (e.miles > 0) meta.push(CarBox.fmtMiles(e.miles));
      meta.push(CHIP[e.type] || 'MOD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(BROWN[0], BROWN[1], BROWN[2]);
      doc.text(meta.join('   ·   ').toUpperCase(), M, y);
      y += 14;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(doc.splitTextToSize(e.title || 'Entry', W - 2 * M - 90), M, y);
      if (e.cost > 0) { doc.text(CarBox.fmtMoney(e.cost), W - M, y, { align: 'right' }); }
      y += 15;
      if (e.notes) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(70, 64, 58);
        var lines = doc.splitTextToSize(e.notes, W - 2 * M);
        ensure(lines.length * 12 + 6);
        doc.text(lines, M, y); y += lines.length * 12 + 2;
      }
      var ps = [];
      if (e.part) ps.push('Part: ' + e.part);
      if (e.shop) ps.push('Shop: ' + e.shop);
      if (ps.length) {
        doc.setFontSize(9); doc.setTextColor(MUT[0], MUT[1], MUT[2]);
        doc.text(ps.join('    '), M, y); y += 12;
      }
      var pics = (photoMap[i] || []).filter(Boolean);
      if (pics.length) {
        var pw = 108, gap = 8, ph2 = 78;
        ensure(ph2 + 8);
        var px = M;
        pics.forEach(function (p) {
          try { doc.addImage(p.data, 'JPEG', px, y, pw, ph2); } catch (e2) {}
          px += pw + gap;
        });
        y += ph2 + 6;
      }
      y += 8;
      doc.setDrawColor(235, 231, 226); doc.setLineWidth(0.6); doc.line(M, y, W - M, y); y += 12;
    });

    /* footer on every page */
    var pages = doc.internal.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(MUT[0], MUT[1], MUT[2]);
      doc.text('Generated by CarBox · ' + dstr, M, H - 20);
      doc.text(p + ' / ' + pages, W - M, H - 20, { align: 'right' });
    }

    var fname = ('CarBox_' + (v.name || 'car') + '_history').replace(/[^a-z0-9_]+/gi, '_') + '.pdf';
    var caption = (v.name || 'Car') + ' history · ' + entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies');
    present(doc, fname, caption);
  }

  function inApp() { return !!(window.ReactNativeWebView && window.ReactNativeWebView.postMessage); }

  /* Save/share the PDF.
     - Native (Expo WebView): hand the base64 PDF to the shell, which writes it to
       a file and opens the native share sheet (expo-file-system + expo-sharing).
       We must NOT navigate the WebView to a blob: URL — WKWebView would replace
       the whole app with a PDF viewer the user can't back out of.
     - Web browser: Web Share with a file, else a normal download link. */
  function downloadOrShare(blob, fname) {
    if (inApp()) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'savePdf', name: fname, dataUrl: reader.result }));
          if (window.UI) UI.toast('Opening share sheet…');
        } catch (e) { if (window.UI) UI.toast('Could not export the PDF'); }
      };
      reader.onerror = function () { if (window.UI) UI.toast('Could not export the PDF'); };
      reader.readAsDataURL(blob);
      return;
    }
    try {
      if (navigator.canShare) {
        var file = new File([blob], fname, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'CarBox history' }).catch(function () {}); return; }
      }
    } catch (e) {}
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fname; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); try { URL.revokeObjectURL(a.href); } catch (e) {} }, 1500);
  }

  /* preview sheet with a Back button + a Download / Share button */
  function present(doc, fname, caption) {
    var blob = doc.output('blob');
    var url = URL.createObjectURL(blob);
    if (!(window.UI && UI.sheet)) { downloadOrShare(blob, fname); return; }
    var PRIMARY = 'width:100%;margin-top:12px;background:var(--brown-warm);color:#FBF8F4;border:none;' +
      'border-radius:999px;cursor:pointer;padding:12px 0;font-family:\'League Spartan\',sans-serif;font-weight:600;font-size:16px;box-shadow:var(--shadow)';
    var GHOST = 'width:100%;margin-top:6px;background:transparent;color:var(--tx,#141210);border:none;cursor:pointer;' +
      'padding:11px 0;font-family:\'League Spartan\',sans-serif;font-weight:600;font-size:15px';
    var sh = UI.sheet({
      title: 'Vehicle history',
      label: 'Vehicle history PDF',
      build: function (body) {
        var note = document.createElement('div');
        note.className = 'sheet-note'; note.style.marginTop = '0';
        note.textContent = caption + ' — ready to save.';
        body.appendChild(note);
        if (!inApp()) {
          /* live preview only in a real browser (WKWebView PDF-in-iframe is unreliable) */
          var frame = document.createElement('iframe');
          frame.src = url; frame.title = 'PDF preview';
          frame.style.cssText = 'width:100%;height:44vh;border:none;border-radius:12px;background:#fff;margin-top:10px;box-shadow:var(--shadow)';
          body.appendChild(frame);
        } else {
          var card = document.createElement('div');
          card.style.cssText = 'margin-top:12px;padding:26px 16px;text-align:center;border-radius:16px;' +
            'background:var(--surface,#F5F3F4);box-shadow:var(--shadow);color:var(--mut,#8D8579);' +
            'font-family:\'League Spartan\',sans-serif;font-weight:600;font-size:14.5px;line-height:1.4';
          card.textContent = 'Your PDF is ready. Tap Save & Share to send it to Files, Mail, AirDrop, or print.';
          body.appendChild(card);
        }
        var dl = document.createElement('button');
        dl.textContent = inApp() ? 'Save & Share PDF' : (('share' in navigator) ? 'Download / Share PDF' : 'Download PDF');
        dl.style.cssText = PRIMARY;
        dl.addEventListener('click', function () { downloadOrShare(blob, fname); });
        body.appendChild(dl);
        var back = document.createElement('button');
        back.textContent = 'Back'; back.style.cssText = GHOST;
        back.addEventListener('click', function () { sh.close(); });
        body.appendChild(back);
      },
      onClose: function () { try { URL.revokeObjectURL(url); } catch (e) {} }
    });
  }

  return { exportActiveCar: exportActiveCar };
})();
