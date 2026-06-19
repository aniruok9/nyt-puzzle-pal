#!/usr/bin/env node

/**
 * Builds the Wordle solver word list: the full set of valid Wordle words,
 * ordered by English word frequency (most common first).
 *
 * Why the full valid-word list (not the original answer pool):
 *   NYT hand-curates answers now and uses words absent from the original
 *   ~2,315-word answer pool (e.g. EMOJI). Matching the solver against only
 *   that pool causes legitimate answers to return "0 possible answers".
 *   The full valid-guess list contains every legal 5-letter word, so any
 *   real NYT answer is present.
 *
 * Why frequency-ordered:
 *   The solver caps the on-screen list to the top 100 matches. Ordering by
 *   word frequency puts the most answer-like words first, so the real answer
 *   almost always appears even when the match set is capped — and the JSON
 *   order is consumed directly at runtime (no client-side sorting needed).
 *
 * Sources (unioned to form the full valid-guess universe):
 *   - Original answer pool (La): cfreshman gist (~2,315 words).
 *   - Additional allowed guesses (Ta): cfreshman gist (~10,657 words) — legal
 *     guesses that were never original answers (e.g. EMOJI).
 *   - Word frequencies: Norvig unigram counts (count_1w.txt, "word<TAB>count").
 *
 * Ordering rules:
 *   1. Keep only entries that are exactly 5 lowercase letters (a-z).
 *   2. Sort by frequency descending; words missing from the frequency data
 *      get count 0 and fall to the end, sorted alphabetically for determinism.
 *
 * Output: data/wordle-answers.json (filename kept for compatibility with
 *         js/wordle.js, which fetches this path).
 * Run:    node scripts/build-wordle-answers.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ANSWERS_URL = 'https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw';
const GUESSES_URL = 'https://gist.githubusercontent.com/cfreshman/cdcdf777450c5b5301e439061d29694c/raw';
const FREQUENCY_URL = 'https://norvig.com/ngrams/count_1w.txt';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'wordle-answers.json');

function fetch(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('HTTP ' + res.statusCode));
      }
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () { resolve(data); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  function parseWords(raw) {
    return raw
      .split(/\r?\n/)
      .map(function (w) { return w.trim().toLowerCase(); })
      .filter(function (w) { return /^[a-z]{5}$/.test(w); });
  }

  console.log('Downloading original answer pool...');
  var answers = parseWords(await fetch(ANSWERS_URL));
  console.log('  ' + answers.length + ' answer words');

  console.log('Downloading additional allowed guesses...');
  var guesses = parseWords(await fetch(GUESSES_URL));
  console.log('  ' + guesses.length + ' guess words');

  var unique = Array.from(new Set(answers.concat(guesses)));
  console.log('Union: ' + unique.length + ' valid five-letter words');

  console.log('Downloading word frequency data...');
  var rawFreq = await fetch(FREQUENCY_URL);

  var freq = {};
  rawFreq.split(/\r?\n/).forEach(function (line) {
    var parts = line.split(/\t/);
    if (parts.length < 2) return;
    var word = parts[0].trim().toLowerCase();
    if (!/^[a-z]{5}$/.test(word)) return;
    var count = parseInt(parts[1], 10);
    if (!isNaN(count) && (freq[word] === undefined || count > freq[word])) {
      freq[word] = count;
    }
  });
  console.log('Loaded frequencies for ' + Object.keys(freq).length + ' five-letter words');

  // Sort by frequency descending; unknown words (count 0) fall to the end,
  // alphabetical among themselves for deterministic output.
  unique.sort(function (a, b) {
    var fa = freq[a] || 0;
    var fb = freq[b] || 0;
    if (fa !== fb) return fb - fa;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  var withFreq = unique.filter(function (w) { return freq[w]; }).length;
  console.log(withFreq + ' words have frequency data, ' + (unique.length - withFreq) + ' appended at end');

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(unique));

  var sizeKB = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(1);
  console.log('Wrote ' + OUTPUT_PATH + ' (' + sizeKB + ' KB)');
  console.log('Top 10 by frequency: ' + unique.slice(0, 10).join(', '));
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
