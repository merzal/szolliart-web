// Page chrome: mobile menu. Portfolio, viewer and inquiry come in later phases.
(function () {
  'use strict';

  var NARROW = window.matchMedia('(max-width: 779.98px)');
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('mobil-menu');
  if (!toggle || !menu) return;

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Menü bezárása' : 'Menü');
    menu.classList.toggle('is-open', open);
  }

  toggle.addEventListener('click', function () {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  // A link closes the menu; the browser then scrolls to the anchor.
  menu.addEventListener('click', function (e) {
    if (e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  // Widening the window past the breakpoint resets the menu, as in the design.
  NARROW.addEventListener('change', function () { setOpen(false); });
})();
