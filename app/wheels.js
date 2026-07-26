/* CarBox — Garage-only spinning wheels.
   Overlays a circular "window" over each wheel hub and rotates a copy of the
   car sprite INSIDE that window, so the rim/spokes spin in place while the
   static black tire ring around it hides the rotating disk's edge. Canvas-free
   (reuses the sprite asset as a background-image — wheels are never recoloured,
   so the raw file's wheel pixels match every tint), so it works on file:// and
   in the Expo WebView with no toDataURL/taint concerns.

   Hub centres + rim radii are in NATURAL sprite pixels, measured per body style
   from the source art and verified visually. Everything renders as % of the
   sprite box, so it scales with the displayed image.

   Public: CarBoxWheels.mount(imgEl) — attach to the Garage hero <img>. Rebuilds
   itself every time the image's src changes (tint / car switch / preset change). */
window.CarBoxWheels = (function () {
  'use strict';

  /* preset id -> { w, h (natural px), wheels:[{x,y,r} front, rear] } */
  var GEOM = {
    body_suv:      { w: 872, h: 340, wheels: [{ x: 170, y: 261, r: 54 }, { x: 688, y: 266, r: 54 }] },
    body_suvcoupe: { w: 875, h: 330, wheels: [{ x: 161, y: 236, r: 50 }, { x: 703, y: 235, r: 50 }] },
    body_coupe2:   { w: 885, h: 278, wheels: [{ x: 163, y: 201, r: 54 }, { x: 730, y: 207, r: 54 }] },
    body_coupe4:   { w: 868, h: 265, wheels: [{ x: 157, y: 184, r: 50 }, { x: 693, y: 196, r: 50 }] },
    body_sedan:    { w: 874, h: 284, wheels: [{ x: 147, y: 200, r: 50 }, { x: 687, y: 216, r: 50 }] },
    sprite_chiron: { w: 1001, h: 265, wheels: [{ x: 212, y: 177, r: 58 }, { x: 836, y: 193, r: 58 }] }
  };

  var styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    var s = document.createElement('style');
    s.id = 'cb-wheels-style';
    s.textContent =
      '.i-spritewrap{position:relative;display:inline-block;line-height:0}' +
      /* keep the cross-page car morph on the image itself */
      '.cb-wheels{position:absolute;inset:0;pointer-events:none;overflow:visible}' +
      '.cb-wheel{position:absolute;border-radius:50%;overflow:hidden;' +
        '-webkit-mask:radial-gradient(circle at 50% 50%,#000 76%,rgba(0,0,0,0) 100%);' +
                'mask:radial-gradient(circle at 50% 50%,#000 76%,rgba(0,0,0,0) 100%)}' +
      '.cb-wheel-spin{position:absolute;background-repeat:no-repeat;background-size:100% 100%;' +
        'image-rendering:pixelated;' +
        'animation:cb-spin var(--cb-wheel-dur,.5s) linear infinite;' +
        'will-change:transform;backface-visibility:hidden}' +
      /* BOTH keyframes must use rotate() so the browser interpolates the ANGLE,
         not the (identical) start/end matrices -> a real full turn. Car faces
         left, so wheels roll counter-clockwise. */
      '@keyframes cb-spin{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}' +
      /* respect reduced motion: never stops, but rolls gently instead of a blur */
      '@media (prefers-reduced-motion:reduce){.cb-wheel-spin{animation-duration:var(--cb-wheel-dur-rm,3.6s)}}';
    document.head.appendChild(s);
  }

  function presetOf() {
    try {
      var car = window.CarBox && CarBox.get('car');
      if (car && car.presetId) return car.presetId;
    } catch (e) {}
    return 'sprite_chiron';   /* demo / pre-onboarding default */
  }

  function build(img) {
    var wrap = img.parentNode;
    if (!wrap || !wrap.classList.contains('i-spritewrap')) return;
    var layer = wrap.querySelector('.cb-wheels');
    if (!layer) return;
    layer.textContent = '';

    var g = GEOM[presetOf()];
    if (!g || !img.naturalWidth) return;               /* unknown preset -> no wheels, no breakage */
    var src = 'assets/' + presetOf() + '.png';

    g.wheels.forEach(function (wheel) {
      var d = 2 * wheel.r;
      var win = document.createElement('div');
      win.className = 'cb-wheel';
      win.style.left   = ((wheel.x - wheel.r) / g.w * 100) + '%';
      win.style.top    = ((wheel.y - wheel.r) / g.h * 100) + '%';
      win.style.width  = (d / g.w * 100) + '%';
      win.style.height = (d / g.h * 100) + '%';

      var spin = document.createElement('div');
      spin.className = 'cb-wheel-spin';
      /* the spin element == the full sprite, positioned so the hub sits at the
         window centre; rotated about the hub. */
      spin.style.width  = (g.w / d * 100) + '%';
      spin.style.height = (g.h / d * 100) + '%';
      spin.style.left   = (-(wheel.x - wheel.r) / d * 100) + '%';
      spin.style.top    = (-(wheel.y - wheel.r) / d * 100) + '%';
      spin.style.backgroundImage = 'url("' + src + '")';
      spin.style.transformOrigin = (wheel.x / g.w * 100) + '% ' + (wheel.y / g.h * 100) + '%';

      win.appendChild(spin);
      layer.appendChild(win);
    });
  }

  function mount(img) {
    if (!img) return;
    injectStyle();
    if (!img.dataset.cbWheels) {
      img.dataset.cbWheels = '1';
      /* every tint / car switch re-sets img.src -> rebuild on each load */
      img.addEventListener('load', function () { build(img); });
    }
    if (img.complete && img.naturalWidth) build(img);
  }

  return { mount: mount, GEOM: GEOM };
})();
