(function () {
  var wordList = [];
  var boxes = document.querySelectorAll('#spellingBee .bee-box');
  var resultsContainer = document.getElementById('beeResults');

  // Load word list
  fetch('data/spelling-bee-words.json')
    .then(function (res) { return res.json(); })
    .then(function (data) { wordList = data; })
    .catch(function () { console.error('Failed to load Spelling Bee word list'); });

  // Input handling
  boxes.forEach(function (box, i) {
    box.addEventListener('input', function () {
      var val = this.value.replace(/[^a-zA-Z]/g, '');
      this.value = val.slice(-1).toUpperCase();

      // Auto-advance to next empty box
      if (val && i < boxes.length - 1) {
        boxes[i + 1].focus();
      }

      solve();
    });

    box.addEventListener('keydown', function (e) {
      // Backspace: clear current, move to previous
      if (e.key === 'Backspace') {
        if (this.value === '' && i > 0) {
          boxes[i - 1].value = '';
          boxes[i - 1].focus();
        } else {
          this.value = '';
        }
        e.preventDefault();
        solve();
      }
    });

    box.addEventListener('focus', function () {
      this.select();
    });
  });

  function getLetters() {
    var letters = [];
    boxes.forEach(function (box) {
      var v = box.value.toLowerCase().trim();
      if (v) letters.push(v);
    });
    return letters;
  }

  function solve() {
    var letters = getLetters();
    if (letters.length < 7) {
      resultsContainer.innerHTML = '';
      return;
    }

    var centerLetter = letters[0];
    var letterSet = new Set(letters);

    var results = wordList.filter(function (word) {
      // Must contain center letter
      if (word.indexOf(centerLetter) === -1) return false;
      // Every letter in the word must be in the allowed set
      for (var i = 0; i < word.length; i++) {
        if (!letterSet.has(word[i])) return false;
      }
      return true;
    });

    // Score each word
    var scored = results.map(function (word) {
      // Check pangram: word uses all 7 letters
      var wordLetters = new Set(word.split(''));
      var pan = true;
      letterSet.forEach(function (l) {
        if (!wordLetters.has(l)) pan = false;
      });

      var points;
      if (word.length === 4) {
        points = 1;
      } else {
        points = word.length;
      }
      if (pan) points += 7;

      return { word: word, points: points, pangram: pan };
    });

    // Sort: pangrams first, then by points descending, then alphabetically
    scored.sort(function (a, b) {
      if (a.pangram !== b.pangram) return a.pangram ? -1 : 1;
      if (a.points !== b.points) return b.points - a.points;
      return a.word.localeCompare(b.word);
    });

    renderResults(scored);
  }

  function renderResults(scored) {
    var totalPoints = scored.reduce(function (sum, w) { return sum + w.points; }, 0);
    var html = '<div class="bee-results-header">' + scored.length + ' words found &middot; ' + totalPoints + ' points</div>';

    scored.forEach(function (item) {
      var cls = 'bee-word' + (item.pangram ? ' pangram' : '');
      html += '<div class="' + cls + '">'
        + '<span>' + item.word.toUpperCase() + '</span>'
        + '<span class="pts">' + item.points + ' pt' + (item.points !== 1 ? 's' : '') + '</span>'
        + '</div>';
    });

    resultsContainer.innerHTML = html;
  }
})();
