# OL FreeCell

Capacitor-based FreeCell iOS game with a date-seeded daily challenge that is
**proven solvable before it is ever shown to the player**.

## Architecture

- `web/` — Source HTML/CSS/JS (served by Capacitor WebView; `webDir` in `capacitor.config.json` points here)
  - `web/js/prng.js` — `mulberry32` PRNG + `hashSeed` (date string → seed) + date helpers
  - `web/js/cards.js` — 52-card model; FreeCell build helpers (alt-colour down, suit up)
  - `web/js/dealgen.js` — shuffles, deals 8 cascades (7/7/7/7/6/6/6/6), and
    `FreeCellSolver`: iterative DFS with transposition table + Baker-style safe
    autoplay that proves a deal is winnable
  - `web/js/game.js` — `FreeCellGame`: live rules (select/drop, supermove capacity,
    undo, hint, win/stuck, safe autoplay)
  - `web/js/storage.js` — Capacitor Preferences (iCloud-synced) with localStorage fallback;
    per-date completion records, in-progress autosave, streak/stats
  - `web/js/confetti.js` — canvas confetti burst for the win screen
  - `web/js/ui.js` — DOM rendering + pointer drag-and-drop (cards/stacks) + deal-in / hint glow
  - `web/js/app.js` — bootstrap + controller: owns the live `FreeCellGame`; no sound
  - `web/assets/cards/*.png` — 52-card deck art (shared with ol-golf / ol-bridge cardmaker)
  - `web/assets/card-back.svg` — ornate card back
- `ios/` — Capacitor iOS shell (Xcode project at `ios/App/App.xcodeproj`)
- Bundle ID: `com.darrenoakey.olFreeCell`

## The daily-solvability guarantee

`DealGen.generateDeal(seedString)` (in `dealgen.js`) is the load-bearing piece:

1. Seed = `hashSeed(dateString)` (today's `YYYY-MM-DD`, local time).
2. Shuffle the deck with `mulberry32(seed)`, deal 8 FreeCell cascades.
3. Run `FreeCellSolver`: iterative DFS over the reachable-state graph with a
   transposition table. Safe foundation autoplay (Baker rule: rank ≤ min(foundations)+2)
   is applied after every move so forced homes never need to be searched.
4. If unsolvable **or** the search budget is exhausted without a proof, reseed with
   `seed + attempt * 0x9e3779b1` and retry. Deterministic — the same date always
   produces the same deal after the same number of attempts.
5. Only a deal the solver has **positively proven** winnable is returned. A budget
   miss is treated as failure (never shown as "maybe solvable").

Practice-mode deals use the identical generator with a random seed, so every deal
in this app — daily or practice — is solvable by construction.

The same solver powers **Hint**: it re-proves solvability from the player's current
position and returns the next move on a winning line, or `null` (never a lie) if the
player has wandered into a legal-but-losing state.

## Commands

- `./run deploy [device]` — Deploy to iPhone (default: Starbuck)
- `./run build` — Build IPA for App Store
- `./run status` — Show App Store pipeline status
- All commands delegate to `~/src/app-publish/run`

## Rules implemented

Classic FreeCell (Microsoft rules):

- 8 cascades, 4 freecells, 4 suit foundations (Ace→King)
- Cascades build down by alternating colour
- Sequences may move as a unit when freecell+empty-cascade capacity allows
  (`(emptyFC+1) × 2^emptyCascades`, destination empty not counted)
- Safe foundation autoplay runs after every player move
