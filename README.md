# PRISM SWARM — Daily

**A bite-sized daily arena game for Reddit, built with Devvit Web.**

Every day, everyone on Reddit gets the same swarm: one seed, one day, three
tries. Survive 2 minutes, match your bullet colour to the enemy's, and climb
the daily leaderboard. Tomorrow the swarm resets and the race starts over.

- **Hackathon:** [Reddit's Game of the Day](https://redditgameofday2026.devpost.com/) — Best Daily Game / Best Ported Daily Game
- **App:** `prism-swarm-daily` (Devvit Web)
- **Status:** built and tested locally; **not yet uploaded to Reddit** (see [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) for the remaining steps)

## The game

You pilot a lone ship in a neon arena. Five bullet colours — crimson, azure,
verdant, magenta, amber — and every enemy wears one of them. Hit an enemy with
its **matching colour and you deal 3× damage** and build your combo (up to
×4); hit it with the wrong colour and you chip it for 1. Five enemy kinds
(chaser, weaver, splitter, sniper, dasher), a **Prism Keeper boss every 5th
wave**, and pickups: shield, overdrive, nova bomb, magnet, heart.

## The daily mechanic

| Rule | Detail |
|---|---|
| One seed per day | The UTC date (`YYYY-MM-DD`) is hashed (FNV-1a) into a 32-bit seed, so **every player faces the exact same swarm** on a given day. |
| 2-minute runs | Each daily run lasts **120 seconds**; the clock ends the run even if you are still flying. |
| 3 attempts a day | You get **3 scored attempts per day**. Your best score is the one that counts. |
| Daily leaderboard | Top 10 for today, stored in Redis, best-score-per-player. |
| Streaks | Play on consecutive days to grow your streak (shown with 🔥). |
| Practice mode | Free play with a random seed, no clock, no attempts spent — so judges and new players can learn the game without burning a try. |
| Share your score | After a run, **Share** posts your score as a comment on the game's Reddit post (as you, via `runAs: 'USER'`). |

Logged-out viewers can still see the splash card and play practice; only
logged-in players submit scores. If the server is ever unreachable the game
falls back to a local (per-browser) daily store, so the game never hard-fails
on the feed.

## How to play

- **Move:** WASD / arrow keys (or the left-half virtual joystick on touch)
- **Aim + fire:** mouse — hold to fire (or the right half of the screen on touch; touch auto-aims at the nearest enemy and auto-fires)
- **Switch colour:** Q / E, mouse wheel, or keys 1–5
- **Pause:** P / Esc — **Mute:** M — **Restart a run:** R
- **Tip:** watch the colour ring around your ship and the dots above the enemies — matching is everything.

## What this is a port of — and what changed

PRISM SWARM started as a standalone Canvas 2D arena game (the
[make.fun](https://make.fun) "best game" entry, Nov 2026). This Devvit port
was **newly created during the hackathon submission period** (Nov 11 –
Dec 8, 2026) from that game. The port is not a re-skin; the daily game is a
different game built on the same engine:

- **Daily seed + timed runs** — the original was endless; this version has one shared seed per day and a 120-second clock.
- **Attempts, streaks, leaderboard** — a server-side rules module (Redis sorted sets + hashes) enforces 3 attempts/day, best-only scores, a 100,000-point cap, and streaks; the original had a local best score only.
- **Share-to-Reddit** — score comments posted as the player, plus a daily leaderboard panel in-game.
- **Feed-first UX** — an inline splash card (renders instantly, fills in today's numbers lazily) that expands into the full game; the original was a single full-page app.
- **Touch controls** — virtual joystick + auto-aim/auto-fire, which the original did not have.
- **Devvit Web architecture** — `devvit.json` entrypoints, an Express server under `createServer`, Redis-backed state; the original was a static page.

The core engine (world, rendering, audio, input) is carried over from the
original and is unchanged in behaviour.

## Tech

- **Client:** TypeScript + plain Canvas 2D (no framework), built with Vite via `@devvit/start`
- **Server:** Express on `@devvit/web/server` (`createServer` + `getServerPort`), Redis for daily state
- **Shared:** a typed API contract in `src/shared/` (Node-free, Devvit-free)
- **Versions:** `@devvit/web` 0.15.4, `devvit` CLI 0.15.4, Node 24

## Layout

```
devvit.json                 App config: entrypoints, server, permissions, menu, trigger
src/shared/api.ts           Types + date/seed helpers (shared by client and server)
src/server/
  index.ts                  Express routes: /api/daily, /api/score, /api/share,
                            /internal/menu/create-post, /internal/triggers/app-install
  rules.ts                  Pure daily rules (attempts, caps, streaks, leaderboard)
src/client/
  splash.html|ts|css        Inline feed card (default entrypoint)
  game.html                 Full game page (game entrypoint)
  main.ts                   Daily boot, run lifecycle, score submit, leaderboard UI
  daily.ts                  localStorage fallback when the API is unreachable
  api.ts                    fetch wrapper (5 s timeout, null on failure)
  game/                     The PRISM SWARM engine (config, world, render, input, audio, shots)
scripts/
  test-server.mjs           Standalone server for local testing (same /api contract, in-memory)
  probe.mjs                 Headless-Chromium probe: plays a real run, checks the score lands
tests/server-rules.test.mjs Unit tests for the daily rules (node --test)
screenshots/                Probe screenshots (splash, title, gameplay, game-over, leaderboard)
```

## Run it locally

```bash
npm install
npm run build        # vite build -> dist/client + dist/server/index.cjs
npm run type-check   # tsc --noEmit (client + server)
npm test             # node --test tests/server-rules.test.mjs (10 tests)

# Playable in a browser:
node scripts/test-server.mjs 8931   # serves dist/client + the /api contract
node scripts/probe.mjs              # headless Chromium: splash, title, a real
                                    # daily run, score submit, leaderboard, share
```

Open http://127.0.0.1:8931/splash.html for the feed card or
http://127.0.0.1:8931/game.html for the game. `?duration=N` shortens the
daily clock (for testing); `?shot=title|play|boss|over` renders deterministic
screenshot scenes.

## Deploy to Reddit (what remains)

```bash
devvit upload    # uploads the build (needs a Reddit account + `devvit login`)
devvit playtest  # playtest in a subreddit
devvit publish   # list the app (not required to qualify)
```

Then create a post from the app's menu item in a **public subreddit with
fewer than 200 members**, and link that post in the Devpost submission. Full
checklist: [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md).

## License

MIT — see [LICENSE](LICENSE).
