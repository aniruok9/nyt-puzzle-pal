#!/usr/bin/env node

/**
 * Downloads the official NYT Connections and Pips puzzle JSON for a window of
 * dates into data/puzzles/, so the site serves them from its own origin
 * instead of fetching through third-party CORS proxies at page load.
 *
 * Why server-side:
 *   NYT's endpoints send no CORS headers, so a browser can't read them
 *   directly. Node isn't a browser, so CORS doesn't apply here.
 *
 * Why a window, not just today:
 *   Visitors load the puzzle for their *local* date, which spans UTC
 *   yesterday..tomorrow across time zones. NYT publishes ahead (as of
 *   2026-10: Connections ~2 weeks, Pips ~6 weeks), so fetching a week ahead
 *   also means a late or missed scheduled run doesn't leave the site without
 *   today's puzzle.
 *
 * Failure policy:
 *   UTC yesterday..tomorrow are required — some visitor needs each of them
 *   right now. Later dates may 404 if NYT hasn't published that far. Anything
 *   else (network error, bad payload, a required date missing) exits non-zero
 *   so .github/workflows/deploy.yml skips the scheduled deploy, keeping the
 *   previous deployment's puzzles live, and GitHub flags the failed run.
 *
 * Output: data/puzzles/{connections,pips}/YYYY-MM-DD.json — raw NYT JSON.
 *         Gitignored; generated at deploy time by the workflow.
 * Run:    node scripts/fetch-puzzles.js   (also handy for local dev)
 */

const fs = require('fs');
const path = require('path');

const GAMES = [
  {
    name: 'connections',
    url: 'https://www.nytimes.com/svc/connections/v2/',
    isValid: (d) => Array.isArray(d.categories) && d.categories.length === 4,
  },
  {
    name: 'pips',
    url: 'https://www.nytimes.com/svc/pips/v1/',
    isValid: (d) => ['easy', 'medium', 'hard'].every((k) => d[k] && Array.isArray(d[k].solution)),
  },
];

const FIRST_DAY = -1;    // offsets from today in UTC
const LAST_DAY = 7;
const REQUIRED_UNTIL = 1; // yesterday..tomorrow covers every visitor's local date
const ATTEMPTS = 3;

const OUT_DIR = path.join(__dirname, '..', 'data', 'puzzles');

function utcDateStr(offsetDays) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Returns the response body, or null if NYT hasn't published this date (404).
// Retries transient failures; throws once attempts run out or on a bad payload.
async function fetchPuzzle(game, date) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(game.url + date + '.json', { signal: AbortSignal.timeout(15000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      if (!game.isValid(JSON.parse(body))) throw new Error('unexpected payload shape');
      return body;
    } catch (err) {
      if (attempt === ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function main() {
  let failed = false;

  for (const game of GAMES) {
    const dir = path.join(OUT_DIR, game.name);
    fs.mkdirSync(dir, { recursive: true });

    for (let offset = FIRST_DAY; offset <= LAST_DAY; offset++) {
      const date = utcDateStr(offset);
      const required = offset <= REQUIRED_UNTIL;
      try {
        const body = await fetchPuzzle(game, date);
        if (body === null) {
          console.log(`${game.name} ${date}: not published yet${required ? ' (REQUIRED)' : ''}`);
          if (required) failed = true;
          continue;
        }
        fs.writeFileSync(path.join(dir, date + '.json'), body);
        console.log(`${game.name} ${date}: ok`);
      } catch (err) {
        console.error(`${game.name} ${date}: FAILED — ${err.message}`);
        failed = true;
      }
    }
  }

  if (failed) {
    console.error('Some puzzles could not be fetched.');
    process.exitCode = 1;
  }
}

main();
