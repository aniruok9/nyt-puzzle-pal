#!/usr/bin/env node

/**
 * Downloads the SCOWL (Spell Checker Oriented Word Lists) en_US-large word list
 * and filters it to valid Spelling Bee words.
 *
 * Source: https://github.com/en-wl/wordlist-diff/blob/rel-2026.02.25/en_US-large.txt
 * SCOWL project: http://wordlist.aspell.net/
 *
 * Filtering rules:
 *   1. Remove words with 3 or fewer letters (Spelling Bee requires 4+)
 *   2. Remove words with apostrophes (e.g. "don't")
 *   3. Remove words with accented/non-ASCII letters (e.g. "naive" with accent)
 *   4. Remove proper nouns (uppercase letters filtered out by lowercase-only regex)
 *
 * Result: ~125K common English words as a flat JSON array, sorted alphabetically.
 *
 * Output: data/spelling-bee-words.json
 * Run:    node scripts/build-spelling-bee-words.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const WORD_LIST_URL = 'https://raw.githubusercontent.com/en-wl/wordlist-diff/rel-2026.02.25/en_US-large.txt';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'spelling-bee-words.json');

function fetch(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function (res) {
      // Follow redirects
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
  console.log('Downloading SCOWL en_US-large word list...');
  var raw = await fetch(WORD_LIST_URL);

  var totalLines = raw.split('\n').length;
  console.log('Downloaded ' + totalLines + ' lines');

  var words = raw
    .split(/\r?\n/)
    .map(function (w) { return w.trim(); })
    .filter(function (w) {
      if (w.length < 4) return false;       // Rule 1: 4+ letters only
      if (!/^[a-z]+$/.test(w)) return false; // Rules 2-4: lowercase alpha only
      return true;
    });

  var unique = Array.from(new Set(words)).sort();

  console.log('Filtered to ' + unique.length + ' words');

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(unique));

  var sizeKB = (fs.statSync(OUTPUT_PATH).size / 1024).toFixed(1);
  console.log('Wrote ' + OUTPUT_PATH + ' (' + sizeKB + ' KB)');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
