/* CarBox bottom-nav pill: draggable + springy tab highlight.
   The pill snaps to the nearest tab on release, then navigates. */
(function () {
  var nav = document.querySelector('.nav');
  if (!nav) return;
  var pill = nav.querySelector('.navpill');
  var tabs = Array.prototype.slice.call(nav.querySelectorAll('.tab'));
  if (!pill || !tabs.length) return;

  var index = parseInt(nav.getAttribute('data-active'), 10) || 0;
  var SPRING = 'transform .5s cubic-bezier(.3,1.4,.4,1)';
  var dragging = false;
  var suppressClick = false;
  var pointerId = null;
  var startX = 0;
  var startPillX = 0;

  function pillW() { return pill.getBoundingClientRect().width; }
  function currentX() {
    var t = getComputedStyle(pill).transform;
    if (!t || t === 'none') return 0;
    var m = t.match(/matrix\(([^)]+)\)/);
    return m ? parseFloat(m[1].split(',')[4]) : 0;
  }
  function setX(x, animate) {
    pill.style.transition = animate ? SPRING : 'none';
    pill.style.transform = 'translateX(' + x + 'px)';
  }
  function navdir(i) {
    try { sessionStorage.setItem('carbox.navdir', i > index ? 'left' : 'right'); } catch (e) {}
  }
  function go(i) {
    i = Math.max(0, Math.min(tabs.length - 1, i));
    setX(i * pillW(), true);
    if (i === index) return;
    navdir(i);
    var href = tabs[i].getAttribute('href');
    var done = false;
    var leave = function () { if (!done) { done = true; location.href = href; } };
    pill.addEventListener('transitionend', leave, { once: true });
    setTimeout(leave, 550); /* fallback if transitionend never fires */
  }
  /* drag release: the finger's momentum carries into the settle */
  function goWithVelocity(i, vel) {
    i = Math.max(0, Math.min(tabs.length - 1, i));
    if (!window.UI || !UI.spring || UI.reduced()) { go(i); return; }
    var target = i * pillW();
    pill.style.transition = 'none';
    UI.spring({
      from: currentX(), to: target, velocity: vel,
      stiffness: 340, damping: 26,
      onUpdate: function (v) { pill.style.transform = 'translateX(' + v + 'px)'; },
      onDone: function () {
        if (i !== index) { navdir(i); location.href = tabs[i].getAttribute('href'); }
      }
    });
  }

  nav.addEventListener('pointerdown', function (e) {
    pointerId = e.pointerId;
    startX = e.clientX;
    startPillX = currentX();
    dragging = false;
    if (nav.setPointerCapture) nav.setPointerCapture(e.pointerId);
  });

  var lastMoveX = 0, lastMoveT = 0, velX = 0;
  nav.addEventListener('pointermove', function (e) {
    if (pointerId !== e.pointerId) return;
    var dx = e.clientX - startX;
    if (!dragging && Math.abs(dx) > 6) { dragging = true; lastMoveX = e.clientX; lastMoveT = e.timeStamp; }
    if (dragging) {
      var dt = e.timeStamp - lastMoveT;
      if (dt > 0) velX = (e.clientX - lastMoveX) / dt * 1000; /* px per second */
      lastMoveX = e.clientX; lastMoveT = e.timeStamp;
      var max = pillW() * (tabs.length - 1);
      setX(Math.max(0, Math.min(max, startPillX + dx)), false);
    }
  });

  function release(e) {
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    if (dragging) {
      dragging = false;
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 0);
      /* flicks project forward: fast releases land on the next tab over */
      var proj = currentX() + velX * 0.08;
      goWithVelocity(Math.round(proj / pillW()), velX);
      velX = 0;
    }
  }
  nav.addEventListener('pointerup', release);
  nav.addEventListener('pointercancel', function (e) {
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    if (dragging) { dragging = false; setX(index * pillW(), true); }
  });

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function (e) {
      e.preventDefault();
      if (suppressClick) return;
      go(i);
    });
  });
})();
