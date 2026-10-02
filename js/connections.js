(function () {
  var cards = document.querySelectorAll('#connections .conn-card');
  var dateEl = document.getElementById('connDate');

  // NYT serves the full puzzle (category titles + answer cards) in one public
  // JSON per day, ordered by difficulty. The deploy workflow copies the next
  // week of them into the site (scripts/fetch-puzzles.js), so they normally
  // load from our own origin. NYT sends no CORS headers, so the fallback for a
  // missing copy (e.g. local dev) goes through proxies. Same approach as
  // pips.js (modules stay independent).
  var LOCAL_URL = 'data/puzzles/connections/'; // + YYYY-MM-DD.json
  var NYT_URL = 'https://www.nytimes.com/svc/connections/v2/'; // + YYYY-MM-DD.json

  // categories[0..3] are ordered easiest -> hardest, matching these colors.
  var COLORS = ['yellow', 'green', 'blue', 'purple'];

  // Public "Connections #N" number = days since launch (#1 was 2023-06-12).
  // The JSON `id` field is an internal id, NOT this number, so we derive it.
  var EPOCH = Date.UTC(2023, 5, 12); // 2023-06-12 = puzzle #1

  var puzzleData = null;

  // Fallback CORS proxies — same list as pips.js. Free proxies are flaky and
  // keep dying, so they're raced in parallel: the first valid response wins
  // and a dead one costs nothing while another is healthy.
  var PROXIES = [
    function (u) { return 'https://cors.eu.org/' + u; },
    function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); }
  ];

  // NYT publishes weeks ahead, so the visitor's local date always exists.
  function localDateStr() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function fetchPuzzle() {
    var file = localDateStr() + '.json';
    loadPuzzle(LOCAL_URL + file)
      .catch(function () {
        return Promise.any(PROXIES.map(function (proxy) {
          return loadPuzzle(proxy(NYT_URL + file));
        }));
      })
      .then(function (data) {
        puzzleData = data;
        renderDate();
        updateCards();
      }, function () {
        showError("Could not load today's puzzle");
      });
  }

  // Fetch url and parse it as a puzzle. Rejects on network error, timeout,
  // non-200, or a junk page (e.g. a proxy's error page).
  function loadPuzzle(url) {
    // Cap each attempt: a dying proxy can hang ~20s before erroring.
    var opts = {};
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      opts.signal = AbortSignal.timeout(8000);
    }

    return fetch(url, opts)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (body) {
        var data = parseJSON(body);
        if (!data) throw new Error('bad payload');
        return data;
      });
  }

  // Map the NYT JSON into { _meta, yellow, green, blue, purple }, or null if
  // the payload isn't a well-formed Connections puzzle.
  function parseJSON(raw) {
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    var cats = data && data.categories;
    if (!Array.isArray(cats) || cats.length !== 4) return null;

    var result = { _meta: { dateText: null, gameNum: null } };

    for (var idx = 0; idx < 4; idx++) {
      var cat = cats[idx];
      if (!cat || !cat.title || !Array.isArray(cat.cards) || cat.cards.length !== 4) {
        return null;
      }
      var words = cat.cards.map(function (c) { return c.content; });
      result[COLORS[idx]] = {
        theme: cat.title,
        answers: words.sort().join(', ')
      };
    }

    result._meta.dateText = formatDate(data.print_date);
    result._meta.gameNum = puzzleNumber(data.print_date);
    return result;
  }

  // "YYYY-MM-DD" -> "Month D, YYYY" (parsed as local, not UTC).
  function formatDate(printDate) {
    if (!printDate) return null;
    var p = printDate.split('-');
    var d = new Date(p[0], p[1] - 1, p[2]);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  // Public puzzle number from the print date (#1 = 2023-06-12).
  function puzzleNumber(printDate) {
    if (!printDate) return null;
    var p = printDate.split('-');
    var t = Date.UTC(p[0], p[1] - 1, p[2]);
    return Math.round((t - EPOCH) / 86400000) + 1;
  }

  function renderDate() {
    if (!dateEl) return;
    if (!puzzleData || !puzzleData._meta || !puzzleData._meta.dateText) {
      dateEl.textContent = '';
      return;
    }
    var meta = puzzleData._meta;
    dateEl.textContent = meta.gameNum
      ? 'Puzzle #' + meta.gameNum + ' — ' + meta.dateText
      : meta.dateText;
  }

  function updateCards() {
    cards.forEach(function (card) {
      card.dataset.state = '0';
      renderCard(card, card.dataset.color, 0);
    });
  }

  function showError(message) {
    if (dateEl) dateEl.textContent = '';
    cards.forEach(function (card) {
      card.classList.add('error');
      card.querySelector('.card-text').textContent = message;
      card.querySelector('.state-badge').textContent = '';
    });
  }

  function renderCard(card, color, state) {
    var textEl = card.querySelector('.card-text');
    var badgeEl = card.querySelector('.state-badge');

    if (!puzzleData || !puzzleData[color]) {
      textEl.textContent = 'tap to reveal';
      badgeEl.textContent = '1/3';
      return;
    }

    var data = puzzleData[color];

    switch (state) {
      case 0: // Blank
        textEl.textContent = 'tap to reveal';
        badgeEl.textContent = '1/3';
        break;
      case 1: // Theme / category
        textEl.textContent = data.theme;
        badgeEl.textContent = '2/3';
        break;
      case 2: // Answers
        textEl.textContent = data.answers;
        badgeEl.textContent = '3/3';
        break;
    }
  }

  // Tap handler — each card cycles independently (3 states)
  cards.forEach(function (card) {
    card.addEventListener('click', function () {
      if (card.classList.contains('error')) return;

      var color = card.dataset.color;
      var state = parseInt(card.dataset.state);
      var nextState = (state + 1) % 3;
      card.dataset.state = String(nextState);
      renderCard(card, color, nextState);
    });
  });

  fetchPuzzle();
})();
