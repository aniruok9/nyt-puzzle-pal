(function () {
  var answerList = [];
  var clearBtn = document.getElementById('wordleClear');
  var resultsContainer = document.getElementById('wordleResults');
  var rowsContainer = document.getElementById('wordleRows');
  var conflictEl = document.getElementById('wordleConflict');

  var COLOR_CYCLE = ['grey', 'yellow', 'green'];
  var MAX_ROWS = 6;

  var state = { rows: [] };
  var rowEls = [];

  fetch('data/wordle-answers.json')
    .then(function (res) { return res.json(); })
    .then(function (data) { answerList = data; })
    .catch(function () { console.error('Failed to load Wordle answer list'); });

  function makeEmptyRow() {
    return [0, 1, 2, 3, 4].map(function () { return { letter: '', color: 'grey' }; });
  }

  function getBox(rowIdx, colIdx) {
    return rowEls[rowIdx].querySelectorAll('.wordle-box')[colIdx];
  }

  function getBtn(rowIdx, colIdx) {
    return rowEls[rowIdx].querySelectorAll('.wordle-color-btn')[colIdx];
  }

  function syncCell(rowIdx, colIdx) {
    var cell = state.rows[rowIdx][colIdx];
    var box = getBox(rowIdx, colIdx);
    var btn = getBtn(rowIdx, colIdx);
    box.value = cell.letter ? cell.letter.toUpperCase() : '';
    box.dataset.color = cell.color;
    btn.dataset.color = cell.color;
    btn.textContent = cell.color === 'green' ? '✓' : cell.color === 'yellow' ? '~' : '✕';
  }

  function isRowEmpty(rowIdx) {
    return state.rows[rowIdx].every(function (c) { return c.letter === ''; });
  }

  function createRow(rowIdx) {
    var wrap = document.createElement('div');
    var inputRow = document.createElement('div');
    inputRow.className = 'wordle-input-row';
    var btnRow = document.createElement('div');
    btnRow.className = 'wordle-btn-row';

    for (var col = 0; col < 5; col++) {
      (function (colIdx) {
        var box = document.createElement('input');
        box.type = 'text';
        box.maxLength = 1;
        box.className = 'wordle-box';
        box.dataset.color = 'grey';
        box.setAttribute('inputmode', 'text');
        box.setAttribute('autocomplete', 'off');

        box.addEventListener('input', function () {
          var val = this.value.replace(/[^a-zA-Z]/g, '');
          this.value = val.slice(-1).toUpperCase();
          state.rows[rowIdx][colIdx].letter = this.value.toLowerCase();

          if (this.value) {
            if (colIdx < 4) {
              getBox(rowIdx, colIdx + 1).focus();
            } else if (rowIdx === state.rows.length - 1 && state.rows.length < MAX_ROWS) {
              addRow();
            } else if (rowIdx < state.rows.length - 1) {
              getBox(rowIdx + 1, 0).focus();
            }
          }
          solve();
        });

        box.addEventListener('keydown', function (e) {
          if (e.key !== 'Backspace') return;
          e.preventDefault();
          if (this.value !== '') {
            this.value = '';
            state.rows[rowIdx][colIdx].letter = '';
          } else if (colIdx > 0) {
            state.rows[rowIdx][colIdx - 1].letter = '';
            var prev = getBox(rowIdx, colIdx - 1);
            prev.value = '';
            prev.focus();
          } else if (rowIdx > 0) {
            state.rows[rowIdx - 1][4].letter = '';
            var prevBox = getBox(rowIdx - 1, 4);
            prevBox.value = '';
            prevBox.focus();
            if (isRowEmpty(rowIdx) && rowIdx === state.rows.length - 1) removeRow(rowIdx);
          }
          solve();
        });

        box.addEventListener('focus', function () { this.select(); });

        var btn = document.createElement('button');
        btn.className = 'wordle-color-btn';
        btn.dataset.color = 'grey';
        btn.textContent = '✕';

        btn.addEventListener('click', function () {
          var current = state.rows[rowIdx][colIdx].color;
          var next = COLOR_CYCLE[(COLOR_CYCLE.indexOf(current) + 1) % COLOR_CYCLE.length];
          state.rows[rowIdx][colIdx].color = next;
          syncCell(rowIdx, colIdx);
          solve();
        });

        inputRow.appendChild(box);
        btnRow.appendChild(btn);
      })(col);
    }

    wrap.appendChild(inputRow);
    wrap.appendChild(btnRow);
    return wrap;
  }

  function addRow() {
    var rowIdx = state.rows.length;
    state.rows.push(makeEmptyRow());
    var el = createRow(rowIdx);
    rowEls.push(el);
    rowsContainer.appendChild(el);
    getBox(rowIdx, 0).focus();
  }

  function removeRow(rowIdx) {
    rowsContainer.removeChild(rowEls[rowIdx]);
    rowEls.splice(rowIdx, 1);
    state.rows.splice(rowIdx, 1);
  }

  // Initialize first row without stealing focus from other sections
  state.rows.push(makeEmptyRow());
  var firstEl = createRow(0);
  rowEls.push(firstEl);
  rowsContainer.appendChild(firstEl);

  clearBtn.addEventListener('click', function () {
    while (rowEls.length > 1) removeRow(rowEls.length - 1);
    state.rows[0] = makeEmptyRow();
    for (var col = 0; col < 5; col++) syncCell(0, col);
    renderConflicts([]);
    resultsContainer.innerHTML = '';
    getBox(0, 0).focus();
  });

  function detectConflicts(rows) {
    var conflicts = [];

    // Types 1 & 2: position-based conflicts
    for (var pos = 0; pos < 5; pos++) {
      var greenCells = [];
      rows.forEach(function (row, rIdx) {
        var cell = row[pos];
        if (cell.letter && cell.color === 'green') {
          greenCells.push({ letter: cell.letter, rowIdx: rIdx });
        }
      });

      // Type 1: different letters green at the same position
      var seenLetters = {};
      greenCells.forEach(function (g) { seenLetters[g.letter] = true; });
      if (Object.keys(seenLetters).length > 1) {
        var letters = Object.keys(seenLetters).map(function (l) { return l.toUpperCase(); });
        conflicts.push({
          message: 'Position ' + (pos + 1) + ': ' + letters.join(' and ') + " can't both be green",
          cells: greenCells.map(function (g) { return { rowIdx: g.rowIdx, colIdx: pos }; })
        });
      }

      // Type 2: green + grey/yellow for same letter at same position
      rows.forEach(function (row, rIdx) {
        var cell = row[pos];
        if (!cell.letter || cell.color !== 'green') return;
        rows.forEach(function (otherRow, oIdx) {
          if (oIdx === rIdx) return;
          var other = otherRow[pos];
          if (!other.letter || other.letter !== cell.letter) return;
          if (other.color !== 'grey' && other.color !== 'yellow') return;
          var pairKey = Math.min(rIdx, oIdx) + '-' + Math.max(rIdx, oIdx) + '-' + pos + '-' + cell.letter;
          if (!conflicts.some(function (c) { return c._key === pairKey; })) {
            conflicts.push({
              _key: pairKey,
              message: 'Position ' + (pos + 1) + ': ' + cell.letter.toUpperCase() +
                ' is green in row ' + (rIdx + 1) + ' but ' + other.color + ' in row ' + (oIdx + 1),
              cells: [{ rowIdx: rIdx, colIdx: pos }, { rowIdx: oIdx, colIdx: pos }]
            });
          }
        });
      });
    }

    // Type 3: letter-count conflicts
    var allLetters = {};
    rows.forEach(function (row) {
      row.forEach(function (cell) { if (cell.letter) allLetters[cell.letter] = true; });
    });

    var letter;
    for (letter in allLetters) {
      var minNeeded = 0, minRow = -1;
      var maxAllowed = Infinity, maxRow = -1;

      rows.forEach(function (row, rIdx) {
        var gy = 0, grey = 0;
        row.forEach(function (cell) {
          if (cell.letter !== letter) return;
          if (cell.color === 'green' || cell.color === 'yellow') gy++;
          else grey++;
        });
        if (gy > minNeeded) { minNeeded = gy; minRow = rIdx; }
        if (grey > 0 && gy < maxAllowed) { maxAllowed = gy; maxRow = rIdx; }
      });

      if (maxAllowed < minNeeded) {
        var cells = [];
        rows[minRow].forEach(function (cell, cIdx) {
          if (cell.letter === letter && (cell.color === 'green' || cell.color === 'yellow')) {
            cells.push({ rowIdx: minRow, colIdx: cIdx });
          }
        });
        rows[maxRow].forEach(function (cell, cIdx) {
          if (cell.letter === letter) cells.push({ rowIdx: maxRow, colIdx: cIdx });
        });
        conflicts.push({
          message: 'Letter ' + letter.toUpperCase() + ': row ' + (minRow + 1) +
            ' implies ≥' + minNeeded + ', row ' + (maxRow + 1) + ' implies exactly ' + maxAllowed,
          cells: cells
        });
      }
    }

    return conflicts;
  }

  function renderConflicts(conflicts) {
    rowEls.forEach(function (rowEl) {
      rowEl.querySelectorAll('.conflict-cell').forEach(function (el) {
        el.classList.remove('conflict-cell');
      });
    });
    if (!conflicts.length) {
      conflictEl.style.display = 'none';
      return;
    }
    conflicts.forEach(function (conflict) {
      conflict.cells.forEach(function (coord) {
        getBox(coord.rowIdx, coord.colIdx).classList.add('conflict-cell');
        getBtn(coord.rowIdx, coord.colIdx).classList.add('conflict-cell');
      });
    });
    conflictEl.innerHTML = conflicts.map(function (c) { return c.message; }).join('<br>');
    conflictEl.style.display = 'block';
  }

  function countLetter(word, letter) {
    var count = 0;
    for (var i = 0; i < word.length; i++) if (word[i] === letter) count++;
    return count;
  }

  function solve() {
    var conflicts = detectConflicts(state.rows);
    renderConflicts(conflicts);
    if (conflicts.length) { resultsContainer.innerHTML = ''; return; }

    var greens = [], yellows = [], greys = [];
    var minCount = {}, maxCount = {};

    state.rows.forEach(function (row) {
      var rowGY = {}, rowGrey = {};
      row.forEach(function (cell, pos) {
        if (!cell.letter) return;
        if (cell.color === 'green') {
          greens.push({ letter: cell.letter, position: pos });
          rowGY[cell.letter] = (rowGY[cell.letter] || 0) + 1;
        } else if (cell.color === 'yellow') {
          yellows.push({ letter: cell.letter, position: pos });
          rowGY[cell.letter] = (rowGY[cell.letter] || 0) + 1;
        } else {
          greys.push({ letter: cell.letter, position: pos });
          rowGrey[cell.letter] = (rowGrey[cell.letter] || 0) + 1;
        }
      });
      var ltr;
      for (ltr in rowGY) {
        if (rowGY[ltr] > (minCount[ltr] || 0)) minCount[ltr] = rowGY[ltr];
      }
      for (ltr in rowGrey) {
        var exact = rowGY[ltr] || 0;
        if (maxCount[ltr] === undefined || exact < maxCount[ltr]) maxCount[ltr] = exact;
      }
    });

    if (!greens.length && !yellows.length &&
        !Object.keys(minCount).length && !Object.keys(maxCount).length) {
      resultsContainer.innerHTML = '';
      return;
    }

    var results = answerList.filter(function (word) {
      var i, ltr;
      for (i = 0; i < greens.length; i++) {
        if (word[greens[i].position] !== greens[i].letter) return false;
      }
      for (i = 0; i < yellows.length; i++) {
        if (word[yellows[i].position] === yellows[i].letter) return false;
      }
      for (i = 0; i < greys.length; i++) {
        if (word[greys[i].position] === greys[i].letter) return false;
      }
      for (ltr in minCount) {
        if (countLetter(word, ltr) < minCount[ltr]) return false;
      }
      for (ltr in maxCount) {
        if (countLetter(word, ltr) > maxCount[ltr]) return false;
      }
      return true;
    });

    renderResults(results);
  }

  var RESULT_CAP = 100;

  function renderResults(results) {
    var html = '<div class="wordle-results-header">' + results.length +
      ' possible answer' + (results.length !== 1 ? 's' : '') + '</div><div>';
    results.slice(0, RESULT_CAP).forEach(function (word) {
      html += '<span class="wordle-word">' + word.toUpperCase() + '</span>';
    });
    html += '</div>';
    if (results.length > RESULT_CAP) {
      html += '<div class="wordle-results-note">showing top ' + RESULT_CAP +
        ' — add more clues to narrow down</div>';
    }
    resultsContainer.innerHTML = html;
  }
})();
