# PRISM SWARM Daily — redesign: "the daily scoreboard"

## Before — the audit

Fresh screenshots: `before-desktop.png`, `before-mobile.png`,
`before-game-desktop.png`, `before-game-mobile.png` (local test server,
1440px + 390px).

What was generic:

- **Splash card:** purple/blue diagonal gradient background, centred
  layout, rainbow system-ui 900 title, 🔴 emoji eyebrow, three identical
  rounded translucent stat cards, red→amber gradient PLAY pill.
- **Game title (canvas):** same gradient starfield, rainbow system-ui
  title, centred rounded translucent HOW TO PLAY card, gold strip,
  gradient DOM buttons, 🏆/💬 emoji in the overlays.
- System-ui everywhere; no display face; no hierarchy beyond size.

## After — new identity: "the daily scoreboard"

After screenshots: `after-desktop.png`, `after-mobile.png`,
`after-game-desktop.png`, `after-game-mobile.png`.

- **Palette:** near-black ink `#0b0b0e`, paper white `#f2ede3`, **one
  accent — signal amber `#ffb000`**. No gradients, no blue, no rounded
  cards, no shadows.
- **Typography (real pairing, self-hosted):** Fraunces 900 for the name
  and big display words + IBM Plex Mono 400/500/700 for every label,
  number and button. Fonts live in `src/client/fonts/` (~79 KB total)
  and are bundled into `dist/client/` by Vite — **the demo makes zero
  external requests**.
- **Splash (feed card):** left-aligned editorial layout — amber top
  rule, mono kicker with an amber square, Fraunces `PRISM SWARM`
  (SWARM in amber), a five-chip colour key (the five bullet colours,
  with the caption "match the enemy's to deal 3× damage"), then the
  stats as a ruled ledger (TODAY / BEST TODAY / STREAK as rows with
  hairline separators, not cards), a square amber PLAY button, and a
  footnote that states the actual rule: the seed is today's UTC date,
  everyone faces the same swarm, only the best score counts.
- **Game overlays:** square corners, hairline borders, mono labels;
  DAILY RUN is the amber button, PRACTICE is an outlined button,
  leaderboard panel is a square ink panel with an amber heading.
  Emoji removed everywhere (🏆 → plain LEADERBOARD, 💬 → plain SHARE,
  🔥 → plain day counts, ⏱ → plain clock).
- **Canvas menu screens (title / over / paused / wave banners):**
  Fraunces display words, IBM Plex Mono for HUD and ledger rows,
  square hairline panels, neutral-ink overlays, amber for the daily
  strip and the final score. The title is one colour now; the five
  bullet colours survive only as the key row under it — they are the
  mechanic, not the title.
- **Untouched on purpose:** the arena art (starfield, sprites,
  enemies, bullets, pickups, boss bar) — that is the game, not the
  chrome. All element IDs, button labels (minus emoji), copy, links
  and flows are unchanged; no new claims or numbers.

## Verification (all green, $0 spent)

- `npm run build` — passes; Vite emits `game.css` + the 4 woff2 files
  into `dist/client/`; font URLs resolve (HTTP 200 from the test server).
- `npm run type-check` — passes.
- `npm test` — 10/10 unit tests pass.
- `node scripts/probe.mjs` (headless Chromium, local test server) —
  **18/18 checks pass**: splash, PLAY navigation, title screen, a real
  daily run (score submitted, exactly one attempt used, leaderboard
  updated), share reports success, practice mode consumes no attempts,
  **zero console errors, zero failed requests**.
- Banned-pattern grep over `src/client/`: no `linear-gradient`, no
  emoji, no `system-ui`, no `roundRect`, no `#0000ff`.
- Fresh desktop + mobile screenshots of the splash and the game title
  after the rebuild (see above).

## What this demo is (no Surge URL)

There is **no Surge demo URL** for this entry — the demo is the Devvit
app itself (`prism-swarm-daily`, entrypoints `splash.html` + `game.html`
in `dist/client`). Nothing was uploaded to Devvit and nothing was
submitted to Reddit/Devpost. The Devvit upload situation is unchanged
from `SUBMISSION_CHECKLIST.md`: still needs a Reddit account that can
install apps, `devvit login` (browser sign-in, may hit Turnstile —
use the user's own device/network), `devvit upload`, a small public
subreddit for playtesting, and the demo post. The rebuilt `dist/`
is what `devvit upload` will ship.

## Follow-ups (not done here)

- **Demo video (`video/demo-video.mp4`) was recorded against the OLD
  UI** — the title screen and splash in it are the pre-redesign
  versions. Re-record before the 09/12 Devpost submission.
- **Pre-existing limitation, unchanged:** the canvas is a fixed
  1280×720 field stretched to the element, so on a narrow phone the
  title art squashes horizontally (see `after-game-mobile.png`). Touch
  controls work; a letterboxed layout would be a polish upgrade.
  Documented in `AGENTS.md` before this redesign.

## Files changed

- `src/client/splash.html`, `src/client/splash.css` — restructured +
  rewritten (scoreboard layout, font-face block).
- `src/client/game.html`, `src/client/game.css` (new — was inline
  `<style>`) — overlays restyled, emoji removed.
- `src/client/splash.ts`, `src/client/main.ts` — streak/share strings
  without emoji (one line each in splash.ts, two in main.ts).
- `src/client/game/config.js` — PALETTE text/muted/panel/panelEdge/
  gold → paper/muted/ink/amber; FONT → IBM Plex Mono.
- `src/client/game/render.js` — `drawText` → IBM Plex Mono,
  new `drawDisplay` (Fraunces), square `drawPanel`, title/over/
  paused/banner restyle, combo + clock bars amber, clock emoji removed.
- `src/client/game/world.js` — wave-clear floater amber.
- `src/client/fonts/` (new) — `fraunces-900.woff2`,
  `ibm-plex-mono-{400,500,700}.woff2` (OFL).
- `redesign/` (new) — `shot.mjs`, before/after screenshots,
  this write-up.
