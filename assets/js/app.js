// Page behaviour: mobile menu and portfolio. The viewer and inquiry come in later phases.
(function () {
  'use strict';

  var NARROW = window.matchMedia('(max-width: 779.98px)');
  var HEADER_OFFSET = 18; // design: sections stop 18px below the sticky header

  function headerHeight() {
    var bar = document.getElementById('fejlec');
    return (bar && bar.offsetHeight) || 74;
  }

  function scrollToEl(el) {
    if (!el) return;
    var smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - headerHeight() - HEADER_OFFSET,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }

  /* ---------------------------------------------------------------- */
  /* Mobile menu                                                      */
  /* ---------------------------------------------------------------- */
  (function menu() {
    var toggle = document.querySelector('.menu-toggle');
    var panel = document.getElementById('mobil-menu');
    if (!toggle || !panel) return;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Menü bezárása' : 'Menü');
      panel.classList.toggle('is-open', open);
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    // A link closes the menu; the browser then scrolls to the anchor.
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    // Widening the window past the breakpoint resets the menu, as in the design.
    NARROW.addEventListener('change', function () { setOpen(false); });
  })();

  /* ---------------------------------------------------------------- */
  /* Portfolio: filters, year groups, masonry, year rail              */
  /* ---------------------------------------------------------------- */
  (function portfolio() {
    var section = document.getElementById('muvek');
    var groupsEl = section && section.querySelector('[data-groups]');
    if (!groupsEl) return;

    var COL_W = 290, GAP = 22; // design: as many 290px columns as fit, 22px apart
    var meta = JSON.parse(document.getElementById('works-meta').textContent);
    var titleEl = section.querySelector('[data-works-title]');
    var countEl = section.querySelector('[data-works-count]');
    var yearChipsEl = section.querySelector('[data-year-chips]');
    var railEl = section.querySelector('[data-rail]');

    // Every work card in source order (static HTML holds all of them).
    var items = Array.prototype.map.call(groupsEl.querySelectorAll('.work'), function (li) {
      return { el: li, cat: li.getAttribute('data-cat'), year: Number(li.getAttribute('data-year')) };
    });

    var state = { cat: 'all', year: 'all' };
    var groups = []; // [{ year, el, list }]
    var activeYear = null;

    function inCat(it) { return state.cat === 'all' || it.cat === state.cat; }
    function visible() {
      return items.filter(function (it) { return inCat(it) && (state.year === 'all' || it.year === state.year); });
    }
    function yearsOf(list) {
      var ys = [];
      list.forEach(function (it) { if (ys.indexOf(it.year) < 0) ys.push(it.year); });
      return ys.sort(function (a, b) { return b - a; });
    }
    function span(list) {
      if (!list.length) return 'A jegyzék készül';
      var ys = yearsOf(list), lo = ys[ys.length - 1], hi = ys[0];
      return list.length + ' mű · ' + (lo === hi ? lo : lo + '–' + hi);
    }

    function chipHTML(attr, value, label, pressed) {
      return '<li><button class="chip" type="button" ' + attr + '="' + value + '" aria-pressed="' + pressed + '">' + label + '</button></li>';
    }

    function render() {
      var list = visible();
      var years = yearsOf(list);

      titleEl.textContent = state.cat === 'all' ? 'Portfólió' : meta.cats[state.cat];
      countEl.textContent = span(list);

      section.querySelectorAll('[data-filter-cat]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-filter-cat') === state.cat));
      });
      // Year chips list the years of the current genre only.
      yearChipsEl.innerHTML = [chipHTML('data-filter-year', 'all', 'Minden év', state.year === 'all')]
        .concat(yearsOf(items.filter(inCat)).map(function (y) {
          return chipHTML('data-filter-year', y, String(y), state.year === y);
        })).join('');

      // Rebuild the year groups, moving the existing cards (no re-render of images).
      var frag = document.createDocumentFragment();
      groups = years.map(function (y) {
        var inYear = list.filter(function (it) { return it.year === y; });
        var sec = document.createElement('section');
        sec.className = 'year-group';
        sec.id = 'ev-' + y;
        sec.setAttribute('aria-labelledby', 'ev-' + y + '-cim');
        sec.innerHTML = '<div class="year-group__head"><h3 class="year-group__year" id="ev-' + y + '-cim">' + y +
          '</h3><p class="year-group__count">' + inYear.length + ' mű</p></div><ul class="masonry"></ul>';
        var ul = sec.querySelector('.masonry');
        inYear.forEach(function (it) { ul.appendChild(it.el); });
        frag.appendChild(sec);
        return { year: y, el: sec, ul: ul };
      });
      groupsEl.replaceChildren(frag);

      railEl.innerHTML = years.map(function (y) {
        return '<li><a href="#ev-' + y + '" data-rail-year="' + y + '">' + y + '</a></li>';
      }).join('');
      railEl.hidden = years.length < 2;

      layout();
      activeYear = null;
      updateRail();
    }

    // Round-robin columns like the design (item i goes to column i % cols),
    // positioned absolutely so the DOM keeps reading order for keyboards and screen readers.
    var lastWidth = 0;
    function layout() {
      var width = groupsEl.clientWidth;
      if (!width) return;
      lastWidth = width;
      var cols = Math.max(1, Math.floor((width + GAP) / (COL_W + GAP)));
      var colW = (width - GAP * (cols - 1)) / cols;
      groups.forEach(function (g) {
        var cards = g.ul.children;
        var i, heights = [];
        g.ul.classList.add('is-laid-out');
        for (i = 0; i < cards.length; i++) cards[i].style.width = colW + 'px';
        for (i = 0; i < cols; i++) heights.push(0);
        for (i = 0; i < cards.length; i++) {
          var c = i % cols;
          cards[i].style.transform = 'translate(' + (c * (colW + GAP)) + 'px,' + heights[c] + 'px)';
          heights[c] += cards[i].offsetHeight + GAP; // the design's 22px bottom margin
        }
        g.ul.style.height = Math.max.apply(null, heights) + 'px';
      });
    }

    // Design: the active year is the last group whose top is above 200px.
    function updateRail() {
      if (!groups.length) return;
      var active = groups[0].year;
      groups.forEach(function (g) { if (g.el.getBoundingClientRect().top < 200) active = g.year; });
      if (active === activeYear) return;
      activeYear = active;
      railEl.querySelectorAll('a').forEach(function (a) {
        if (Number(a.getAttribute('data-rail-year')) === active) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }

    function setFilter(cat, year, scroll) {
      state.cat = cat;
      state.year = year;
      render();
      var hash = '#muvek' + (cat === 'all' && year === 'all' ? '' : '/' + cat + (year === 'all' ? '' : '/' + year));
      history.replaceState(null, '', hash);
      if (scroll) scrollToEl(section);
    }

    section.addEventListener('click', function (e) {
      var b = e.target.closest('[data-filter-cat], [data-filter-year]');
      if (b) {
        if (b.hasAttribute('data-filter-cat')) setFilter(b.getAttribute('data-filter-cat'), 'all', false);
        else {
          var y = b.getAttribute('data-filter-year');
          setFilter(state.cat, y === 'all' ? 'all' : Number(y), false);
        }
        return;
      }
      var r = e.target.closest('[data-rail-year]');
      if (r) {
        e.preventDefault();
        scrollToEl(document.getElementById('ev-' + r.getAttribute('data-rail-year')));
      }
    });

    // Genre cards and text links elsewhere on the page (data-genre) open a filtered portfolio.
    document.addEventListener('click', function (e) {
      var g = e.target.closest('[data-genre]');
      if (!g) return;
      e.preventDefault();
      setFilter(g.getAttribute('data-genre'), 'all', true);
    });

    // #muvek/<genre>[/<year>] restores a filter (kept in the URL by setFilter).
    function fromHash() {
      var m = /^#muvek\/([a-z]+)(?:\/(\d{4}))?$/.exec(location.hash);
      if (!m || (m[1] !== 'all' && !meta.cats[m[1]])) return false;
      var year = m[2] ? Number(m[2]) : 'all';
      state.cat = m[1];
      // A year the genre has no work in would show an empty list; fall back to every year.
      if (year !== 'all' && yearsOf(items.filter(inCat)).indexOf(year) < 0) year = 'all';
      setFilter(m[1], year, true);
      return true;
    }

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; updateRail(); });
    }, { passive: true });

    new ResizeObserver(function () {
      if (groupsEl.clientWidth !== lastWidth) layout();
    }).observe(groupsEl);
    // Title wrapping changes card heights once the web fonts arrive.
    if (document.fonts) document.fonts.ready.then(layout);

    // Pasting a filter link into an open page only changes the hash.
    window.addEventListener('hashchange', fromHash);

    if (!fromHash()) render();
  })();
})();
