// Artwork viewer: full-screen sheet with paging, swipe, info sheet, year rail,
// zoom (capped at the image's native resolution, decision B4), pinch and
// double tap (E3), several views per work (A5) and deep links #mu/<slug> (E1).
(function () {
  'use strict';

  var dataEl = document.getElementById('works-data');
  if (!dataEl) return;
  var DATA = JSON.parse(dataEl.textContent);
  var BY_SLUG = {};
  DATA.works.forEach(function (w) { BY_SLUG[w.slug] = w; });
  (DATA.parts || []).forEach(function (p) { BY_SLUG[p.slug] = p; });
  // A composition's panels page among themselves, under the composition's title.
  function partsOf(slug) { return DATA.parts.filter(function (p) { return p.partOf === slug; }); }

  var NARROW = window.matchMedia('(max-width: 779.98px)');
  var CLOSE_MS = 300; // design: sheetDown .3s
  var SWIPE_PX = 50, TAP_PX = 8, DOUBLE_TAP_MS = 300, WHEEL_STEP = 1.12;

  var ICON = {
    close: '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    prev: '<svg class="icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    down: '<svg class="icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    next: '<svg class="icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    mail: '<svg class="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/></svg>',
  };

  function two(n) { return (n < 10 ? '0' : '') + n; }
  // Design: entry points outside the grid page through the work's whole genre, newest first.
  function catSorted(cat) {
    return DATA.works.filter(function (w) { return w.cat === cat; }).sort(function (a, b) { return b.year - a.year; });
  }

  /* ---------------------------------------------------------------- */
  /* DOM                                                              */
  /* ---------------------------------------------------------------- */
  var root = document.createElement('div');
  root.className = 'viewer';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'viewer-title');
  root.innerHTML =
    '<div class="viewer__stage" data-stage><div class="viewer__zoom" data-zoom><img class="viewer__img" data-img alt=""></div></div>' +
    '<div class="viewer__zoom-layer" data-layer hidden><p class="viewer__zoom-hint" data-zoom-hint aria-live="polite"></p></div>' +
    '<div class="viewer__top">' +
      '<p class="viewer__scope" data-scope></p>' +
      '<button class="viewer__close" type="button" data-close aria-label="Bezárás" title="Bezárás (Esc)">' + ICON.close + '</button>' +
    '</div>' +
    '<ul class="viewer__rail" data-rail aria-label="Ugrás évre"></ul>' +
    '<div class="viewer__bottom">' +
      // Same caption as the grid card (title, size · medium, notes, status), always open.
      '<div class="viewer__info" data-info>' +
        '<p class="viewer__title" id="viewer-title" data-title></p>' +
        '<p class="viewer__line" data-line></p>' +
        '<button class="viewer__more-toggle" type="button" data-more-toggle aria-expanded="false" aria-controls="viewer-more" hidden>' +
          'További részletek' + ICON.down + '</button>' +
        '<div class="viewer__more" id="viewer-more" data-more hidden></div>' +
        '<div class="viewer__notes" data-note></div>' +
        '<p class="viewer__status" data-status></p>' +
      '</div>' +
      '<div class="viewer__views" data-views role="group" aria-label="A mű nézetei"></div>' +
      '<div class="viewer__controls">' +
        '<button class="viewer__nav" type="button" data-prev aria-label="Előző mű" title="Előző (←)">' + ICON.prev + '</button>' +
        '<p class="viewer__counter" data-counter></p>' +
        '<button class="viewer__nav" type="button" data-next aria-label="Következő mű" title="Következő (→)">' + ICON.next + '</button>' +
        '<button class="viewer__inquire" type="button" data-inquire>' + ICON.mail + '<span>Érdeklődés</span></button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(root);

  var $ = function (k) { return root.querySelector('[data-' + k + ']'); };
  var el = {
    stage: $('stage'), zoom: $('zoom'), img: $('img'), layer: $('layer'), zoomHint: $('zoom-hint'),
    scope: $('scope'), close: $('close'), rail: $('rail'),
    title: $('title'), line: $('line'), moreToggle: $('more-toggle'), more: $('more'), status: $('status'),
    note: $('note'), views: $('views'), prev: $('prev'),
    counter: $('counter'), next: $('next'), inquire: $('inquire'),
  };

  /* ---------------------------------------------------------------- */
  /* State                                                            */
  /* ---------------------------------------------------------------- */
  var list = [], idx = 0, view = 0, scope = '', isOpen = false;
  var viaHistory = false; // opened by a hash navigation, so Back (or close) pops it
  var pending = null;     // list context from a grid click, picked up by the hash route
  var opener = null, closeTimer = null;
  // Page scroll at open. While the viewer is up (and while it closes), the page is held there:
  // closing goes back in history, and returning to an entry such as #tartalom would otherwise
  // scroll the page to that anchor behind the sliding sheet.
  var pageY = 0, holdScroll = false;
  var activator = null;  // the #mu/ link that was clicked (Safari does not focus links on click)
  var z = { on: false, s: 1, x: 0, y: 0, max: 1, fitW: 0, fitH: 0, boxW: 0, boxH: 0 };

  function current() { return list[idx]; }
  function image() { var w = current(); return w.images[Math.min(view, w.images.length - 1)]; }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                        */
  /* ---------------------------------------------------------------- */
  function render() {
    var w = current(), im = image(), multi = w.images.length > 1;

    el.img.src = im[0];
    el.img.width = im[1];
    el.img.height = im[2];
    el.img.alt = w.title + (multi ? ' – ' + (view + 1) + '. nézet' : '');

    el.scope.textContent = scope;
    el.title.textContent = w.title;
    el.title.classList.toggle('is-long', !!w.partOf && w.title.length > 40);
    el.line.textContent = (w.sizeLast ? [w.medium, w.size] : [w.size, w.medium]).filter(Boolean).join(' · ');
    el.line.hidden = !el.line.textContent;
    // Optional longer text (e.g. a production's credits), folded until asked for.
    el.moreToggle.hidden = !w.more;
    el.moreToggle.setAttribute('aria-expanded', 'false');
    el.more.hidden = true;
    el.more.textContent = '';
    if (w.more) {
      [w.more.title].concat(w.more.lines).forEach(function (t, i) {
        var p = document.createElement('p');
        if (i === 0) p.className = 'viewer__more-title';
        p.textContent = t;
        el.more.appendChild(p);
      });
    }
    el.note.textContent = '';
    w.notes.forEach(function (n) {
      var box = document.createElement('div'), label = document.createElement('p'), text = document.createElement('p');
      box.className = 'viewer__note';
      label.className = 'viewer__note-label';
      label.textContent = (n.label || 'Megjegyzés') + ':';
      if (n.url) {
        var a = document.createElement('a');
        a.className = 'text-link';
        a.href = n.url;
        if (n.url.charAt(0) !== '#') { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        a.textContent = n.text;
        text.appendChild(a);
      } else text.textContent = n.text;
      box.appendChild(label);
      box.appendChild(text);
      el.note.appendChild(box);
    });
    el.note.hidden = !w.notes.length;
    el.status.textContent = w.status;
    el.status.hidden = !w.status;
    el.inquire.hidden = !!w.status;
    el.counter.textContent = two(idx + 1) + ' / ' + two(list.length || 1);

    // Extra views of the same work (A5).
    el.views.hidden = !multi;
    el.views.innerHTML = multi ? w.images.map(function (_, i) {
      return '<button type="button" class="viewer__dot" data-view="' + i + '" aria-label="' + (i + 1) + '. nézet"' +
        (i === view ? ' aria-current="true"' : '') + '></button>';
    }).join('') : '';

    // Year rail: the years of the current list, in list order.
    var years = [];
    list.forEach(function (x) { if (years.indexOf(x.year) < 0) years.push(x.year); });
    el.rail.hidden = years.length < 2;
    el.rail.innerHTML = years.map(function (y) {
      return '<li><button type="button" data-year="' + y + '"' + (y === w.year ? ' aria-current="true"' : '') + '>' +
        '<span>' + y + '</span><span class="viewer__tick" aria-hidden="true"></span></button></li>';
    }).join('');

    renderZoom();
    preloadNeighbours();
  }

  function preloadNeighbours() {
    [idx - 1, idx + 1].forEach(function (i) {
      var w = list[(i + list.length) % list.length];
      if (w) new Image().src = w.images[0][0];
    });
  }

  /* ---------------------------------------------------------------- */
  /* Zoom (B4: never beyond the image's own pixels)                   */
  /* ---------------------------------------------------------------- */
  function measure() {
    var im = image(), box = el.stage.getBoundingClientRect();
    var fit = Math.min(box.width / im[1], box.height / im[2]);
    z.boxW = box.width; z.boxH = box.height;
    z.fitW = im[1] * fit; z.fitH = im[2] * fit;
    z.max = Math.max(1, 1 / fit); // scale at which one image pixel fills one CSS pixel
  }

  function clamp(s, x, y) {
    var mx = Math.max(0, (z.fitW * s - z.boxW) / 2), my = Math.max(0, (z.fitH * s - z.boxH) / 2);
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  }

  function setZoom(s, x, y, animate) {
    s = Math.max(1, Math.min(z.max, s));
    var c = s === 1 ? { x: 0, y: 0 } : clamp(s, x, y);
    z.s = s; z.x = c.x; z.y = c.y;
    el.zoom.classList.toggle('is-panning', !animate);
    renderZoom();
  }

  function renderZoom() {
    el.zoom.style.transform = 'translate(' + z.x + 'px,' + z.y + 'px) scale(' + z.s + ')';
    root.classList.toggle('is-zoom', z.on);
    el.layer.hidden = !z.on;
    el.layer.style.cursor = z.s > 1 ? 'grab' : 'zoom-out';
    var back = (NARROW.matches ? 'koppints' : 'kattints') + ' a visszatéréshez';
    if (z.max <= 1.01) el.zoomHint.textContent = back.charAt(0).toUpperCase() + back.slice(1);
    else if (z.s > 1) el.zoomHint.textContent = Math.round(z.s * 100) + '% · ' + back;
    else el.zoomHint.textContent = (NARROW.matches ? 'Két ujjal nagyítható' : 'Görgetéssel nagyítható') + ' · ' + back;
  }

  function enterZoom() {
    z.on = true;
    renderZoom();          // stage switches to full bleed first…
    measure();             // …then the cap is measured on the final box
    setZoom(1, 0, 0, true);
    el.layer.focus();
  }

  function exitZoom() {
    z.on = false;
    z.s = 1; z.x = 0; z.y = 0;
    renderZoom();
    el.stage.focus();
  }

  /* ---------------------------------------------------------------- */
  /* Paging                                                           */
  /* ---------------------------------------------------------------- */
  function show(i, v) {
    idx = (i + list.length) % list.length;
    view = v || 0;
    z.s = 1; z.x = 0; z.y = 0;
    if (z.on) measure();   // before render, so the zoom hint uses the new image's cap
    render();
    history.replaceState(history.state, '', '#mu/' + current().slug);
  }
  function step(d) { if (list.length) show(idx + d); }

  /* ---------------------------------------------------------------- */
  /* Open / close                                                     */
  /* ---------------------------------------------------------------- */
  var background = function () { return document.querySelectorAll('body > a, body > header, body > main, body > footer'); };

  function open(w, ctxList, ctxScope, fromHistory) {
    clearTimeout(closeTimer);
    if (w.openParts) w = partsOf(w.slug)[0]; // e.g. a stage set: its card opens the set's images
    if (w.partOf) { ctxList = partsOf(w.partOf); ctxScope = BY_SLUG[w.partOf].title; }
    else if (!ctxList || ctxList.indexOf(w) < 0) { ctxList = catSorted(w.cat); ctxScope = DATA.cats[w.cat]; }
    list = ctxList; scope = ctxScope || '';
    viaHistory = fromHistory;
    idx = list.indexOf(w); view = 0;
    z.on = false; z.s = 1; z.x = 0; z.y = 0;
    render();
    if (w.slug !== (location.hash.match(/^#mu\/(.+)$/) || [])[1]) history.replaceState(history.state, '', '#mu/' + w.slug);
    if (!isOpen) {
      opener = activator || document.activeElement;
      activator = null;
      pageY = window.scrollY;
      holdScroll = true;
      isOpen = true;
      root.hidden = false;
      root.classList.remove('is-closing');
      root.classList.add('is-open');
      document.documentElement.classList.add('viewer-lock');
      background().forEach(function (n) { n.inert = true; });
      el.close.focus();
    }
  }

  function restoreScroll() {
    if (window.scrollY !== pageY) window.scrollTo({ top: pageY, behavior: 'instant' });
  }
  window.addEventListener('scroll', function () { if (holdScroll) restoreScroll(); });

  function finishClose() {
    isOpen = false;
    restoreScroll();
    root.classList.remove('is-open');
    root.classList.add('is-closing');
    background().forEach(function (n) { n.inert = false; });
    closeTimer = setTimeout(function () {
      root.hidden = true;
      root.classList.remove('is-closing');
      document.documentElement.classList.remove('viewer-lock');
      restoreScroll();
      // Release a frame later: a history-driven anchor scroll can land just after the unlock.
      requestAnimationFrame(function () { requestAnimationFrame(function () { holdScroll = false; }); });
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    }, CLOSE_MS);
  }

  // UI close: pop our history entry if we pushed one, otherwise just drop the hash.
  function close() {
    if (!isOpen) return;
    if (viaHistory) { history.back(); return; } // hashchange → finishClose
    history.replaceState(history.state, '', location.pathname + location.search);
    finishClose();
  }

  /* ---------------------------------------------------------------- */
  /* Routing: #mu/<slug>                                              */
  /* ---------------------------------------------------------------- */
  function route(fromHistory) {
    var m = /^#mu\/([a-z0-9-]+)$/.exec(location.hash);
    var w = m && BY_SLUG[m[1]];
    if (!w) { if (isOpen) finishClose(); return; }
    if (isOpen && list.indexOf(w) >= 0) { show(list.indexOf(w)); return; }
    var ctx = pending && pending.slug === w.slug ? pending : null;
    pending = null;
    open(w, ctx && ctx.list, ctx && ctx.scope, fromHistory);
  }

  window.addEventListener('hashchange', function () { route(true); });

  // Any #mu/ link (grid, hero, text) becomes the element focus returns to on close.
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="#mu/"]');
    if (link) activator = link;
  }, true);

  // Grid cards: remember the filtered list (in on-screen order) before the hash changes.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('.work__link');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    var slugs = Array.prototype.map.call(document.querySelectorAll('[data-groups] .work__link'), function (x) {
      return x.getAttribute('href').slice(4);
    });
    var cat = document.querySelector('[data-filter-cat][aria-pressed="true"]');
    var year = document.querySelector('[data-filter-year][aria-pressed="true"]');
    var catId = cat ? cat.getAttribute('data-filter-cat') : 'all';
    var yearVal = year ? year.getAttribute('data-filter-year') : 'all';
    pending = {
      slug: a.getAttribute('href').slice(4),
      list: slugs.map(function (s) { return BY_SLUG[s]; }),
      scope: (catId === 'all' ? 'Teljes portfólió' : DATA.cats[catId]) + (yearVal === 'all' ? '' : ' · ' + yearVal),
    };
    // Re-clicking the work that is already in the URL fires no hashchange.
    if (location.hash === a.getAttribute('href')) { e.preventDefault(); route(false); }
  });

  /* ---------------------------------------------------------------- */
  /* Controls                                                         */
  /* ---------------------------------------------------------------- */
  el.close.addEventListener('click', close);
  el.prev.addEventListener('click', function () { step(-1); });
  el.moreToggle.addEventListener('click', function () {
    var open = el.more.hidden;
    el.more.hidden = !open;
    el.moreToggle.setAttribute('aria-expanded', String(open));
  });
  el.next.addEventListener('click', function () { step(1); });
  el.inquire.addEventListener('click', function () {
    document.dispatchEvent(new CustomEvent('inquiry:open', { detail: { slug: current().partOf || current().slug, from: el.inquire } }));
  });
  el.views.addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]');
    if (b) show(idx, Number(b.getAttribute('data-view')));
  });
  el.rail.addEventListener('click', function (e) {
    var b = e.target.closest('[data-year]');
    if (!b) return;
    var y = Number(b.getAttribute('data-year'));
    show(list.findIndex(function (w) { return w.year === y; }));
  });

  document.addEventListener('keydown', function (e) {
    if (!isOpen || document.querySelector('[data-inquiry-dialog]:not([hidden])')) return;
    if (e.key === 'Escape') { e.preventDefault(); if (z.on) exitZoom(); else close(); }
    else if (z.on && (e.key === '+' || e.key === '=')) setZoom(z.s * WHEEL_STEP * WHEEL_STEP, z.x, z.y, true);
    else if (z.on && e.key === '-') setZoom(z.s / (WHEEL_STEP * WHEEL_STEP), z.x, z.y, true);
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'Tab') trapFocus(e);
  });

  function trapFocus(e) {
    var f = Array.prototype.filter.call(
      root.querySelectorAll('button, [tabindex="0"]'),
      function (n) { return n.offsetParent !== null && !n.closest('[hidden]'); });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* Stage (normal mode): tap → zoom mode, horizontal swipe → page. */
  var tap = null;
  el.stage.tabIndex = -1;
  el.stage.addEventListener('pointerdown', function (e) { tap = { x: e.clientX, y: e.clientY }; });
  el.stage.addEventListener('pointerup', function (e) {
    if (!tap || z.on) return;
    var dx = e.clientX - tap.x, dy = e.clientY - tap.y;
    tap = null;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) + Math.abs(dy) < TAP_PX) enterZoom();
  });

  /* Zoom layer: drag to pan, pinch, wheel, double tap; a swipe at 1× pages; a plain tap/click goes back. */
  var pointers = {}, gesture = null, moved = false, lastTap = 0, tapTimer = null;
  el.layer.tabIndex = -1;

  function pts() { return Object.keys(pointers).map(function (k) { return pointers[k]; }); }

  el.layer.addEventListener('pointerdown', function (e) {
    try { el.layer.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var p = pts();
    moved = false;
    if (p.length === 2) {
      gesture = {
        pinch: true, dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y),
        mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2, s: z.s, x: z.x, y: z.y,
      };
    } else {
      gesture = { pinch: false, sx: e.clientX, sy: e.clientY, x: z.x, y: z.y };
    }
  });

  el.layer.addEventListener('pointermove', function (e) {
    if (!pointers[e.pointerId] || !gesture) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var p = pts();
    if (gesture.pinch && p.length === 2) {
      var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      var mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2;
      moved = true;
      setZoom(gesture.s * d / gesture.dist, gesture.x + mx - gesture.mx, gesture.y + my - gesture.my, false);
    } else if (!gesture.pinch && z.s > 1) {
      var dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      setZoom(z.s, gesture.x + dx, gesture.y + dy, false);
    }
  });

  function endPointer(e) {
    delete pointers[e.pointerId];
    if (pts().length) return; // keep going until the last finger lifts
    var wasGesture = gesture;
    gesture = null;
    el.zoom.classList.remove('is-panning');
    if (!wasGesture || moved || e.type === 'pointercancel') return;

    var dx = e.clientX - wasGesture.sx, dy = e.clientY - wasGesture.sy;
    if (!wasGesture.pinch && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
      clearTimeout(tapTimer);
      lastTap = 0;
      step(dx < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(dx) + Math.abs(dy) >= TAP_PX) return; // a drag at 1× is not a tap

    if (e.pointerType === 'touch') {
      // Double tap toggles 1× and 2× (capped); a single tap returns after a short wait.
      var now = Date.now();
      if (now - lastTap < DOUBLE_TAP_MS) {
        clearTimeout(tapTimer);
        lastTap = 0;
        setZoom(z.s > 1 ? 1 : Math.min(2, z.max), 0, 0, true);
      } else {
        lastTap = now;
        tapTimer = setTimeout(exitZoom, DOUBLE_TAP_MS);
      }
    } else {
      exitZoom();
    }
  }
  el.layer.addEventListener('pointerup', endPointer);
  el.layer.addEventListener('pointercancel', endPointer);

  el.layer.addEventListener('wheel', function (e) {
    e.preventDefault();
    setZoom(e.deltaY < 0 ? z.s * WHEEL_STEP : z.s / WHEEL_STEP, z.x, z.y, true);
  }, { passive: false });

  window.addEventListener('resize', function () {
    if (!isOpen) return;
    if (z.on) { measure(); setZoom(z.s, z.x, z.y, false); }
    render();
  });

  // A shared link (#mu/<slug>) opens the viewer on load; closing it then just drops the hash.
  route(false);
})();
