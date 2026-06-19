(function () {
  var boardEl = document.getElementById('pipsBoard');
  var wrapEl = document.getElementById('pipsBoardWrap');
  var tabsEl = document.getElementById('pipsTabs');
  var dateEl = document.getElementById('pipsDate');
  var tipEl = document.getElementById('pipsTip');

  // NYT serves all three difficulties (regions, dominoes AND solutions) in one
  // public JSON per day. No CORS headers, so it goes through the proxy chain.
  var NYT_URL = 'https://www.nytimes.com/svc/pips/v1/'; // + YYYY-MM-DD.json

  // Ordered CORS proxies — same chain as connections.js (modules stay
  // independent, so each keeps its own copy). Free proxies are individually
  // flaky; try each in turn on any failure.
  var PROXIES = [
    { url: function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); } },
    { url: function (u) { return 'https://api.allorigins.win/get?url=' + encodeURIComponent(u); }, json: 'contents' },
    { url: function (u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); } },
    { url: function (u) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u); } }
  ];

  // Region colors are not in the JSON. The live game cycles this fixed
  // palette over non-"empty" regions in JSON order (verified against the
  // real board; cosmetic-only if NYT ever changes it).
  var PALETTE = [
    { badge: '#a14fc6', fill: 'rgba(161, 79, 198, 0.32)' },  // purple
    { badge: '#d9216e', fill: 'rgba(217, 33, 110, 0.28)' },  // magenta
    { badge: '#0f8e9c', fill: 'rgba(15, 142, 156, 0.28)' },  // teal
    { badge: '#e56a0b', fill: 'rgba(229, 106, 11, 0.28)' },  // orange
    { badge: '#1d4671', fill: 'rgba(29, 70, 113, 0.28)' },   // navy
    { badge: '#6f8d1f', fill: 'rgba(111, 141, 31, 0.32)' }   // green
  ];

  var GAP = 4;          // px between cells
  var MIN_CELL = 36;
  var MAX_CELL = 56;
  var TRAY_PAD = 10;    // tan margin around cells
  var TRAY_RADIUS = 16;
  var CELL_RADIUS = 8;  // convex region corners
  var BADGE = 26;
  var PIP_RATIO = 0.18; // pip diameter as a fraction of cell size

  // Pip dot positions on a 3x3 grid (0..8, row-major) per domino value
  var PIP_LAYOUT = {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  var puzzleData = null;   // { printDate, easy, medium, hard }
  var currentDiff = 'easy';
  var board = null;        // geometry for currentDiff, from buildBoard()
  var revealed = { easy: new Set(), medium: new Set(), hard: new Set() };

  // === Fetch ===

  function localDateStr(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + offsetDays);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function isValidPuzzle(data) {
    if (!data) return false;
    return ['easy', 'medium', 'hard'].every(function (diff) {
      var p = data[diff];
      return p && Array.isArray(p.regions) && Array.isArray(p.dominoes) &&
        Array.isArray(p.solution) && p.solution.length === p.dominoes.length;
    });
  }

  function fetchPuzzle() {
    tryProxy(localDateStr(0), 0, false);
  }

  function tryProxy(dateStr, i, isFallback) {
    if (i >= PROXIES.length) {
      if (!isFallback) {
        // Today's JSON may not exist yet (device clock ahead of NYT's
        // publish time) — retry the whole chain with yesterday's date.
        tryProxy(localDateStr(-1), 0, true);
      } else {
        showError("Could not load today's puzzle");
      }
      return;
    }
    var proxy = PROXIES[i];

    // Cap each attempt: a dying proxy can hang ~20s before erroring, which
    // stalls the whole chain even when a later proxy is healthy.
    var opts = {};
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      opts.signal = AbortSignal.timeout(8000);
    }

    fetch(proxy.url(NYT_URL + dateStr + '.json'), opts)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (body) {
        var raw = proxy.json ? JSON.parse(body)[proxy.json] : body;
        var data = JSON.parse(raw);
        if (!isValidPuzzle(data)) throw new Error('bad payload');
        puzzleData = data;
        renderDate(isFallback);
        selectDifficulty(currentDiff);
      })
      .catch(function () {
        tryProxy(dateStr, i + 1, isFallback); // network error, non-200, or junk page
      });
  }

  function renderDate(isStale) {
    if (!dateEl) return;
    var label = '';
    if (puzzleData && puzzleData.printDate) {
      var p = puzzleData.printDate.split('-'); // parse as local, not UTC
      var d = new Date(p[0], p[1] - 1, p[2]);
      label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    dateEl.textContent = label;
    dateEl.classList.toggle('stale', !!isStale);
  }

  function showError(message) {
    if (dateEl) {
      dateEl.textContent = '';
      dateEl.classList.remove('stale');
    }
    board = null;
    boardEl.style.width = '';
    boardEl.style.height = '';
    boardEl.innerHTML = '<div class="pips-status">' + message + '</div>';
  }

  // === Geometry ===

  function buildBoard(diffData) {
    var cells = {};        // 'r,c' -> region index
    var cellDomino = {};   // 'r,c' -> domino index
    var regionColors = []; // per region: PALETTE entry, or null for 'empty'
    var minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
    var colorIdx = 0;

    diffData.regions.forEach(function (region, ri) {
      regionColors.push(region.type === 'empty' ? null : PALETTE[colorIdx++ % PALETTE.length]);
      region.indices.forEach(function (rc) {
        cells[rc[0] + ',' + rc[1]] = ri;
        if (rc[0] < minR) minR = rc[0];
        if (rc[0] > maxR) maxR = rc[0];
        if (rc[1] < minC) minC = rc[1];
        if (rc[1] > maxC) maxC = rc[1];
      });
    });

    diffData.solution.forEach(function (pair, d) {
      cellDomino[pair[0][0] + ',' + pair[0][1]] = d;
      cellDomino[pair[1][0] + ',' + pair[1][1]] = d;
    });

    return {
      data: diffData,
      cells: cells,
      cellDomino: cellDomino,
      regionColors: regionColors,
      minR: minR,
      minC: minC,
      rows: maxR - minR + 1,
      cols: maxC - minC + 1,
      cell: 0 // px, set by renderBoard()
    };
  }

  function cellSize() {
    var avail = wrapEl.clientWidth - 2 * TRAY_PAD - (board.cols - 1) * GAP;
    return Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(avail / board.cols)));
  }

  function cellX(c) { return TRAY_PAD + (c - board.minC) * (board.cell + GAP); }
  function cellY(r) { return TRAY_PAD + (r - board.minR) * (board.cell + GAP); }

  // Which of a cell's 4 edges face outside the group defined by inGroup(r, c)
  function openSides(r, c, inGroup) {
    return {
      top: !inGroup(r - 1, c),
      right: !inGroup(r, c + 1),
      bottom: !inGroup(r + 1, c),
      left: !inGroup(r, c - 1)
    };
  }

  // Round only convex corners (both adjacent sides open)
  function cornerRadii(open, radius) {
    return (open.top && open.left ? radius : 0) + 'px ' +
      (open.top && open.right ? radius : 0) + 'px ' +
      (open.bottom && open.right ? radius : 0) + 'px ' +
      (open.bottom && open.left ? radius : 0) + 'px';
  }

  // === Rendering ===

  function renderBoard() {
    board.cell = cellSize();
    boardEl.innerHTML = '';
    boardEl.style.width = (board.cols * board.cell + (board.cols - 1) * GAP + 2 * TRAY_PAD) + 'px';
    boardEl.style.height = (board.rows * board.cell + (board.rows - 1) * GAP + 2 * TRAY_PAD) + 'px';

    var isBoardCell = function (r, c) { return board.cells[r + ',' + c] !== undefined; };

    Object.keys(board.cells).forEach(function (key) {
      var rc = key.split(',');
      var r = parseInt(rc[0]);
      var c = parseInt(rc[1]);
      renderTraySlab(r, c, isBoardCell);
      renderCell(r, c, key);
    });

    renderBadges();
    revealed[currentDiff].forEach(function (d) { addDomino(d, false); });
  }

  // Tan backing per cell, extended GAP/2 toward neighboring cells (so slabs
  // tile seamlessly) and TRAY_PAD outward on open sides. Disconnected cell
  // groups automatically form separate tray blobs.
  function renderTraySlab(r, c, isBoardCell) {
    var open = openSides(r, c, isBoardCell);
    var x = cellX(c), y = cellY(r);
    var l = x - (open.left ? TRAY_PAD : GAP / 2);
    var t = y - (open.top ? TRAY_PAD : GAP / 2);
    var rt = x + board.cell + (open.right ? TRAY_PAD : GAP / 2);
    var b = y + board.cell + (open.bottom ? TRAY_PAD : GAP / 2);

    var slab = document.createElement('div');
    slab.className = 'pips-tray';
    slab.style.left = l + 'px';
    slab.style.top = t + 'px';
    slab.style.width = (rt - l) + 'px';
    slab.style.height = (b - t) + 'px';
    slab.style.borderRadius = cornerRadii(open, TRAY_RADIUS);
    boardEl.appendChild(slab);
  }

  // Two layers per cell, sharing the same geometry (extended GAP/2 toward
  // same-region neighbors so fill/border are contiguous along the region):
  //   1. tap target (z2, below dominoes) — carries data-key; empty cells get
  //      their opaque taupe here so a placed domino hides it, like the game.
  //   2. region overlay (z4, above dominoes) — translucent tint + dashed
  //      perimeter, pointer-events:none. Drawn over dominoes so every cell
  //      stays tinted and each domino half picks up its own region's color.
  function renderCell(r, c, key) {
    var regionIdx = board.cells[key];
    var color = board.regionColors[regionIdx];
    var inRegion = function (rr, cc) { return board.cells[rr + ',' + cc] === regionIdx; };
    var open = openSides(r, c, inRegion);
    var x = cellX(c), y = cellY(r);
    var l = x - (open.left ? 0 : GAP / 2);
    var t = y - (open.top ? 0 : GAP / 2);
    var rt = x + board.cell + (open.right ? 0 : GAP / 2);
    var b = y + board.cell + (open.bottom ? 0 : GAP / 2);
    var radius = cornerRadii(open, CELL_RADIUS);

    var cell = document.createElement('div');
    cell.className = 'pips-cell' + (color ? '' : ' empty');
    cell.dataset.key = key;
    cell.style.left = l + 'px';
    cell.style.top = t + 'px';
    cell.style.width = (rt - l) + 'px';
    cell.style.height = (b - t) + 'px';
    if (!color) cell.style.borderRadius = radius;
    boardEl.appendChild(cell);

    if (!color) return;

    var overlay = document.createElement('div');
    overlay.className = 'pips-overlay';
    overlay.style.left = l + 'px';
    overlay.style.top = t + 'px';
    overlay.style.width = (rt - l) + 'px';
    overlay.style.height = (b - t) + 'px';
    overlay.style.background = color.fill;
    overlay.style.borderRadius = radius;
    ['top', 'right', 'bottom', 'left'].forEach(function (side) {
      if (open[side]) {
        overlay.style['border' + side.charAt(0).toUpperCase() + side.slice(1)] = '2px dashed ' + color.badge;
      }
    });
    boardEl.appendChild(overlay);
  }

  // Diamond badge on the bottom-right corner of each region's last cell
  function renderBadges() {
    board.data.regions.forEach(function (region, ri) {
      var color = board.regionColors[ri];
      if (!color) return;
      var last = region.indices[region.indices.length - 1];
      var badge = document.createElement('div');
      badge.className = 'pips-badge';
      badge.style.left = (cellX(last[1]) + board.cell - BADGE / 2) + 'px';
      badge.style.top = (cellY(last[0]) + board.cell - BADGE / 2) + 'px';
      badge.style.width = BADGE + 'px';
      badge.style.height = BADGE + 'px';
      badge.style.background = color.badge;

      var label = document.createElement('span');
      label.textContent = badgeLabel(region);
      badge.appendChild(label);
      boardEl.appendChild(badge);
    });
  }

  function badgeLabel(region) {
    switch (region.type) {
      case 'sum': return String(region.target);
      case 'greater': return '>' + region.target;
      case 'less': return '<' + region.target;
      case 'equals': return '=';
      default: return '';
    }
  }

  // === Dominoes ===

  function pipsHalf(value) {
    var half = document.createElement('div');
    half.className = 'pips-half';
    // Size pips in px from the cell, not as a % of the grid track: the track
    // width varies with the half's aspect ratio (which flips between H and V
    // dominoes), so a percentage made vertical pips ~58% larger than horizontal.
    var size = Math.round(board.cell * PIP_RATIO) + 'px';
    PIP_LAYOUT[value].forEach(function (pos) {
      var dot = document.createElement('div');
      dot.className = 'pips-pip';
      dot.style.gridRow = Math.floor(pos / 3) + 1;
      dot.style.gridColumn = (pos % 3) + 1;
      dot.style.width = size;
      dot.style.height = size;
      half.appendChild(dot);
    });
    return half;
  }

  function addDomino(d, animate) {
    var pair = board.data.solution[d];
    var vals = board.data.dominoes[d];
    // Solution pairs can list cells in any order — put the lesser
    // coordinate first so halves render in visual order.
    var first = pair[0], second = pair[1], firstVal = vals[0], secondVal = vals[1];
    if (first[0] > second[0] || first[1] > second[1]) {
      first = pair[1]; second = pair[0];
      firstVal = vals[1]; secondVal = vals[0];
    }
    var horizontal = first[0] === second[0];

    var el = document.createElement('div');
    el.className = 'pips-domino ' + (horizontal ? 'horizontal' : 'vertical');
    el.dataset.d = d;
    el.style.left = cellX(first[1]) + 'px';
    el.style.top = cellY(first[0]) + 'px';
    el.style.width = (horizontal ? 2 * board.cell + GAP : board.cell) + 'px';
    el.style.height = (horizontal ? board.cell : 2 * board.cell + GAP) + 'px';
    el.appendChild(pipsHalf(firstVal));
    el.appendChild(pipsHalf(secondVal));

    if (animate) {
      el.classList.add('entering');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.classList.remove('entering'); });
      });
    }
    boardEl.appendChild(el);
  }

  function toggleDomino(d) {
    var set = revealed[currentDiff];
    if (set.has(d)) {
      set.delete(d);
      var el = boardEl.querySelector('.pips-domino[data-d="' + d + '"]');
      if (el) el.remove();
    } else {
      set.add(d);
      addDomino(d, true);
      if (tipEl) tipEl.classList.add('hidden');
    }
  }

  // === Interaction ===

  boardEl.addEventListener('click', function (e) {
    if (!board) return;
    var dominoEl = e.target.closest('.pips-domino');
    if (dominoEl) {
      toggleDomino(parseInt(dominoEl.dataset.d));
      return;
    }
    var cellEl = e.target.closest('.pips-cell');
    if (!cellEl) return;
    var d = board.cellDomino[cellEl.dataset.key];
    if (d !== undefined) toggleDomino(d);
  });

  function selectDifficulty(diff) {
    currentDiff = diff;
    tabsEl.querySelectorAll('.pips-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.diff === diff);
    });
    if (!puzzleData) return;
    board = buildBoard(puzzleData[diff]);
    renderBoard();
  }

  tabsEl.addEventListener('click', function (e) {
    var tab = e.target.closest('.pips-tab');
    if (tab && tab.dataset.diff !== currentDiff) selectDifficulty(tab.dataset.diff);
  });

  // Re-render at the new cell size; revealed state lives in JS, the DOM is
  // disposable.
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (board) renderBoard();
    }, 150);
  });

  fetchPuzzle();
})();
