# NYT Puzzle Pal

A fast, mobile-first web app for solving **The New York Times daily word puzzles**: Spelling Bee, Wordle, and Connections.

**Live:** https://aniruok9.github.io/nyt-puzzle-pal/

---

## Features

- 🐝 **Spelling Bee** — Solver that filters words by available letters and calculates points
- 📖 **Wordle** — Intelligent filter with color-coded constraints (green, yellow, grey) and duplicate letter handling
- 🔗 **Connections** — Fetches today's puzzle hints and answers, with tap-to-reveal gameplay
- 📱 **Mobile-first design** — Swipe left/right to navigate between games
- ⚡ **No build step** — Pure HTML, CSS, and vanilla JavaScript
- 🎯 **Offline-capable** — Word lists are bundled; Connections fetches on load

---

## Tech Stack

- **Vanilla HTML, CSS, JavaScript** — no frameworks or dependencies
- **Static hosting** — GitHub Pages deployment
- **CORS proxy** — `api.codetabs.com` for fetching Connections data

---

## Project Structure

```
nyt-puzzle-pal/
├── index.html                          # Single-page app with 3 game sections
├── css/
│   ├── shared.css                      # Navigation, swipe animations, resets
│   ├── spelling-bee.css                # Spelling Bee styling
│   ├── wordle.css                      # Wordle styling
│   └── connections.css                 # Connections styling
├── js/
│   ├── swipe.js                        # Touch-based swipe navigation
│   ├── spelling-bee.js                 # Spelling Bee solver + UI logic
│   ├── wordle.js                       # Wordle filter + UI logic
│   └── connections.js                  # Connections fetch, parse, tap-reveal
├── data/
│   ├── spelling-bee-words.json         # ~200KB English word list (4+ letters)
│   └── wordle-answers.json             # ~12,972 valid Wordle words, frequency-ranked
└── scripts/
    ├── build-spelling-bee-words.js     # (Dev) Builds the Spelling Bee word list
    └── build-wordle-answers.js         # (Dev) Builds the frequency-ranked Wordle word list
```

---

## How to Use

### Spelling Bee
1. Enter the 7 letters (including the center letter)
2. The solver automatically filters valid words
3. Points are calculated: 4-letter words = 1pt, 5+ = 1pt per letter, pangrams = +7pt bonus
4. Pangrams appear first, sorted by score

### Wordle
1. Type the 5 letters you've guessed
2. Tap the color button under each letter to mark it:
   - **Grey** — not in the word
   - **Yellow** — in the word, wrong position
   - **Green** — correct position
3. The filter automatically updates to show only candidates matching all constraints
4. Supports duplicate letters with proper logic

### Connections
1. The app automatically fetches today's puzzle on load
2. Tap each colored card to reveal:
   - **Blank** → Hint → Theme → Answer (then back to Blank)
3. Each card cycles independently; no interaction with others

---

## Mobile-First Design

- Minimum touch targets: 44px
- Swipe left/right to navigate between games
- Nav dots at the top indicate current game and position
- Sticky input areas stay in view while scrolling results
- No hover interactions — fully touch-optimized

---

## Deployment

This repo uses a **two-remote workflow** to keep development files private while deploying a clean build publicly.

| Remote | Repo | Purpose |
|--------|------|---------|
| `private` | `aniruok9/nyt-puzzle-pal-private` | Source of truth — contains all files including dev docs |
| `origin` | `aniruok9/nyt-puzzle-pal` | Public GitHub Pages deployment — no dev files |

### Publishing

```bash
# 1. Version everything (including private dev files)
git push private master

# 2. Publish filtered build to GitHub Pages
./deploy.sh
```

`deploy.sh` strips `CLAUDE.md`, `docs/`, and itself before force-pushing to the public repo. Changes go live at https://aniruok9.github.io/nyt-puzzle-pal/ automatically via GitHub Pages.

---

## Getting Started (Development)

1. Clone the repository:
   ```bash
   git clone https://github.com/aniruok9/nyt-puzzle-pal.git
   cd nyt-puzzle-pal
   ```

2. No build step needed. Open `index.html` in a browser or serve locally:
   ```bash
   python3 -m http.server 8000
   ```

3. Navigate to `http://localhost:8000`

---

## Architecture

Each game is **self-contained**:
- Own `<section>` in `index.html`
- Own CSS file
- Own JavaScript module (no cross-game dependencies)

This modular design makes it easy to add new games (e.g., Pips) without affecting existing ones. Shared code (swipe navigation, nav dots) lives in `shared.css` and `swipe.js`.

---

## Data Sources

- **Spelling Bee & Wordle** — Static JSON word lists shipped with the app
- **Connections** — Fetched client-side from the official NYT JSON endpoint (via CORS proxy) at `nytimes.com/svc/connections/v2/YYYY-MM-DD.json`

---

## Performance

- Spelling Bee word list filtering: <50ms on modern devices
- Wordle filtering: instant
- Connections fetch + parse: single HTTP request, instant parsing
- Total bundle: <300KB

---

## License

This project is for personal use with The New York Times puzzles. All puzzle content, names, and branding are property of The New York Times Company.
