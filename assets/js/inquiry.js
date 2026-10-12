// Inquiry dialog: general or about one work (opened from the viewer).
// Sending is simulated for now (decision C2); swap sendInquiry() for the real
// delivery (PHP or a form service) once hosting is decided. The UI stays the same.
(function () {
  'use strict';

  var dataEl = document.getElementById('works-data');
  var BY_SLUG = {};
  if (dataEl) JSON.parse(dataEl.textContent).works.forEach(function (w) { BY_SLUG[w.slug] = w; });

  var MIN_FILL_MS = 3000;   // faster than this is almost certainly a bot

  /**
   * Delivers one inquiry. Must resolve on success and reject on failure.
   * TODO(C2b, later task): replace the simulation with the real delivery.
   * @param {{name: string, email: string, message: string, work: object|null, page: string}} payload
   * @returns {Promise<void>}
   */
  function sendInquiry(payload) {
    void payload;
    return new Promise(function (resolve) { setTimeout(resolve, 600); });
  }

  var ICON_CHECK = '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.4 2.4 2.3 4.6-5"/></svg>';

  /* ---------------------------------------------------------------- */
  /* DOM                                                              */
  /* ---------------------------------------------------------------- */
  var root = document.createElement('div');
  root.className = 'inquiry';
  root.hidden = true;
  root.setAttribute('data-inquiry-dialog', '');
  root.innerHTML =
    '<div class="inquiry__backdrop" data-dismiss></div>' +
    '<div class="inquiry__panel" role="dialog" aria-modal="true" aria-labelledby="inquiry-title">' +
      '<form class="inquiry__form" data-form novalidate>' +
        '<div>' +
          '<p class="kicker">Érdeklődés</p>' +
          '<h2 class="inquiry__title" id="inquiry-title" data-title></h2>' +
          '<p class="inquiry__line" data-line></p>' +
        '</div>' +
        '<hr class="inquiry__rule">' +
        '<div class="inquiry__field">' +
          '<label for="inq-name">Neved</label>' +
          '<input id="inq-name" name="name" type="text" autocomplete="name" placeholder="Név" required aria-describedby="inq-name-err">' +
          '<p class="inquiry__error" id="inq-name-err" data-err="name" hidden>Add meg a neved.</p>' +
        '</div>' +
        '<div class="inquiry__field">' +
          '<label for="inq-mail">E-mail</label>' +
          '<input id="inq-mail" name="email" type="email" autocomplete="email" inputmode="email" placeholder="nev@pelda.hu" required aria-describedby="inq-mail-err">' +
          '<p class="inquiry__error" id="inq-mail-err" data-err="email" hidden>Adj meg egy érvényes e-mail címet.</p>' +
        '</div>' +
        '<div class="inquiry__field">' +
          '<label for="inq-msg">Üzenet</label>' +
          '<textarea id="inq-msg" name="message" rows="4"></textarea>' +
        '</div>' +
        // Honeypot (C3): invisible to people, tempting to bots.
        '<div class="inquiry__hp" aria-hidden="true">' +
          '<label for="inq-web">Weboldal</label>' +
          '<input id="inq-web" name="website" type="text" tabindex="-1" autocomplete="off">' +
        '</div>' +
        '<button class="inquiry__send" type="submit" data-send>Elküldöm</button>' +
        '<p class="inquiry__status" data-status role="alert" hidden></p>' +
        '<p class="inquiry__note">A mű adatait automatikusan mellékeljük. Válasz e-mailben érkezik.</p>' +
      '</form>' +
      '<div class="inquiry__sent" data-sent hidden>' +
        '<span class="inquiry__check">' + ICON_CHECK + '</span>' +
        '<h2 class="inquiry__sent-title" tabindex="-1" data-sent-title>Megérkezett</h2>' +
        '<p class="inquiry__sent-text">Köszönöm az érdeklődést. Néhány napon belül válaszolok a megadott e-mail címre.</p>' +
        '<button class="inquiry__done" type="button" data-dismiss>Bezárom</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(root);

  var $ = function (k) { return root.querySelector('[data-' + k + ']'); };
  var form = $('form'), sent = $('sent'), send = $('send'), status = $('status');
  var f = { name: form.elements.name, email: form.elements.email, message: form.elements.message, website: form.elements.website };

  var work = null, openedAt = 0, opener = null, sending = false, isOpen = false;
  var hidden = [];

  /* ---------------------------------------------------------------- */
  /* Validation                                                       */
  /* ---------------------------------------------------------------- */
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function problems() {
    var p = [];
    if (!f.name.value.trim()) p.push('name');
    if (!EMAIL.test(f.email.value.trim())) p.push('email');
    return p;
  }
  // Design: the send button looks inactive until name and e-mail are filled in.
  function updateReady() { send.classList.toggle('is-idle', problems().length > 0); }
  function showErrors(p) {
    ['name', 'email'].forEach(function (k) {
      var bad = p.indexOf(k) >= 0;
      f[k].setAttribute('aria-invalid', String(bad));
      root.querySelector('[data-err="' + k + '"]').hidden = !bad;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Open / close                                                     */
  /* ---------------------------------------------------------------- */
  // `from` is the button that opened the dialog; focus returns there (Safari does not focus clicked buttons).
  function open(slug, from) {
    work = slug ? BY_SLUG[slug] || null : null;
    opener = from || document.activeElement;

    $('title').textContent = work ? '„' + work.title + '”' : 'Írj néhány sort';
    $('line').textContent = work ? work.size + ' · ' + work.year : 'Szöllősi Gábor · Mélykút';
    // Name and e-mail are kept between openings (as in the design); the message starts fresh.
    f.message.value = work
      ? 'Érdeklődöm a „' + work.title + '” című mű iránt. Kérlek, írd meg az árát és az elérhetőségét.'
      : 'Érdeklődöm a művek iránt. Kérlek, keress meg a részletekkel.';
    f.website.value = '';
    showErrors([]);
    status.hidden = true;
    form.hidden = false;
    sent.hidden = true;
    sending = false;
    send.disabled = false;
    send.textContent = 'Elküldöm';
    updateReady();
    openedAt = Date.now();

    if (!isOpen) {
      isOpen = true;
      root.hidden = false;
      document.documentElement.classList.add('inquiry-lock');
      // Everything else, including an open viewer, becomes inert.
      hidden = Array.prototype.filter.call(document.body.children, function (n) { return n !== root && !n.inert; });
      hidden.forEach(function (n) { n.inert = true; });
    }
    (f.name.value.trim() ? (EMAIL.test(f.email.value.trim()) ? f.message : f.email) : f.name).focus();
  }

  function close() {
    if (!isOpen) return;
    // Design: the dialog unmounts at once (no exit animation).
    isOpen = false;
    root.hidden = true;
    document.documentElement.classList.remove('inquiry-lock');
    hidden.forEach(function (n) { n.inert = false; });
    hidden = [];
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------------- */
  /* Submit                                                           */
  /* ---------------------------------------------------------------- */
  function done() {
    form.hidden = true;
    sent.hidden = false;
    $('sent-title').focus();
  }

  form.addEventListener('input', function (e) {
    updateReady();
    // Clear an error as soon as the field is fixed.
    if (e.target === f.name || e.target === f.email) {
      var p = problems();
      ['name', 'email'].forEach(function (k) {
        if (p.indexOf(k) < 0) {
          f[k].setAttribute('aria-invalid', 'false');
          root.querySelector('[data-err="' + k + '"]').hidden = true;
        }
      });
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    var p = problems();
    showErrors(p);
    if (p.length) { f[p[0]].focus(); return; }

    // Bots: pretend it worked and send nothing.
    if (f.website.value || Date.now() - openedAt < MIN_FILL_MS) { done(); return; }

    sending = true;
    send.disabled = true;
    send.textContent = 'Küldés…';
    status.hidden = true;
    sendInquiry({
      name: f.name.value.trim(),
      email: f.email.value.trim(),
      message: f.message.value.trim(),
      work: work && { slug: work.slug, title: work.title, size: work.size, year: work.year, url: location.origin + location.pathname + '#mu/' + work.slug },
      page: location.href,
    }).then(done, function () {
      sending = false;
      send.disabled = false;
      send.textContent = 'Elküldöm';
      status.textContent = 'Nem sikerült elküldeni. Próbáld újra kicsit később, vagy írj nekem Facebookon.';
      status.hidden = false;
    });
  });

  root.addEventListener('click', function (e) {
    if (e.target.closest('[data-dismiss]')) close();
  });

  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (e.key === 'Tab') {
      var items = Array.prototype.filter.call(root.querySelectorAll('input:not([tabindex="-1"]), textarea, button, [tabindex="-1"][data-sent-title]'),
        function (n) { return !n.closest('[hidden]') && !n.disabled && n.tabIndex >= 0; });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);

  /* Triggers: [data-inquiry] buttons/links, and the viewer's "Érdeklődés" (inquiry:open). */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-inquiry]');
    if (!t) return;
    e.preventDefault();
    open(null, t);
  });
  document.addEventListener('inquiry:open', function (e) { open(e.detail && e.detail.slug, e.detail && e.detail.from); });
})();
