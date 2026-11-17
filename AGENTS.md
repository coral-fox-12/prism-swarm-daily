# AGENTS.md — prism-swarm-daily

Notes for the next session working on this entry. The build is DONE and
verified; what remains is Reddit/Devvit access, a playtest subreddit, the demo
post, the recorded video, and the Devpost submit (parent does the submit).

## How to verify (fast)

```bash
npm run build && npm run type-check && npm test   # build + tsc + 10 unit tests
node scripts/test-server.mjs 8931                  # serves dist/client + /api (in-memory)
node scripts/probe.mjs                             # headless Chromium, 18 checks, screenshots
```

`npm run probe` starts the test server itself, but the shell `&` + `pgrep -f`
cleanup once killed its own exec session — start the server detached
(`setsid nohup … &` as its own command) and run the probe separately.

## Facts that bit

- `developers.reddit.com` is blocked for `browser.open` in this sandbox. All Devvit facts were verified from the installed packages (`@devvit/web` 0.15.4, `devvit` CLI 0.15.4), the bundled `config-file.v1.json` schema, and the runtime conventions doc — installed runtime outranks docs.
- Node's type stripper resolves ESM specifiers literally, so cross-module imports use explicit `.ts` extensions (needs `allowImportingTsExtensions` in tsconfig). The vendored game modules stay `.js` and are typed `any` at the seam in `main.ts`.
- The `browser` customCondition must be set in `tsconfig.client.json`, or TS resolves `@devvit/web/client` to the server-panic stub and `requestExpandedMode` "doesn't exist".
- `requestExpandedMode(event, 'game')` only inside Devvit (hostname ends `.devvit.net`); the splash falls back to a plain navigation elsewhere.
- `devvit new` needs a code from Reddit's web flow — scaffold manually instead.
- The test server is stateful (in-memory per-process): the probe asserts attempts relatively, not absolutely, so it passes against a warm server. For a clean 3-attempts run, restart it.
- Turnstile (2026-11-17): the cloud browser cannot clear Cloudflare Turnstile (datacenter egress IP is scored). If `devvit login` or any signup hits it, do it from the user's own device/network.

## Bugs found and fixed by the probe

- A held fire button auto-restarted runs from the over/title screens and silently ate a second daily attempt. Fix: `input.js` mousedown adds an edge-triggered `ACTION_CONFIRM`; title/over screens only react to `pressed(CONFIRM)`, never to level `firing`.
- Score popups (floaters) ghosted through the translucent over-screen panel. Fix: `endGame` clears `world.floaters` and `world.flash`.
- The canvas daily strip sat under the DOM mode buttons. Fix: strip moved to y=512 (the panel ends at 490, the buttons start ~531 logical); the top-3 leaders line was dropped from the title — it lives in the leaderboard panel and on the splash card.

## Video re-record v3 (2026-11-17) — game was genuinely broken, fixed first

- **Root cause of the bad demo run (12% accuracy, 4 kills, dies wave 1):** not
  the aim — the autopilot/touch auto-aim fired a full 0.13 s stream, and a
  matched hit kills most enemies in one shot, so ~3 bullets were always in
  flight past a dead target. Fix: intercept-lead aim (solve
  |r+v·t| = bulletSpeed·t) + fire discipline (hold fire while ≥2 bullets are
  already in flight, 4 vs a boss) in `shots.js` pilotInput and the touch
  auto-aim in `main.ts`. Measured: 30 s pilot run 13% → 46% accuracy,
  19 → 32 kills, wave 3, 3–4 lives; 60 s run 70% accuracy, wave 5 (boss).
- **Empty starfield:** wave announce 3.2 s + spawn interval 1.15 s + chasers
  drifting in at 95 px/s. Now: betweenWaves 1.8 s, spawn interval 0.65 s,
  baseBudget 8, chaser speed 120, spawns enter at speed toward the player,
  first spawn 0.2 s after the announce, wave-clear pause 1.6 s.
- **Joystick on desktop:** the v2 recorder ran desktop contexts with
  `hasTouch: true` + CDP touch, so the joystick rendered. The game now only
  shows the joystick while a touch is held AND on a real touch device
  (`pointer: coarse` / `ontouchstart` / `maxTouchPoints`), and the recorder
  v3 uses `hasTouch: false` on desktop + `?autoplay=1` instead of touch.
- **Recording hooks in `main.ts` (staging only, no effect on normal play):**
  `?autoplay=1` (autopilot flies a live run), `?warmup=N` (pre-play N s with
  the autopilot, invulnerable, clock reset to 0:00, so footage opens
  mid-action), `?wave=N` (start at wave N; 5 = boss). `window.__daily` also
  exposes wave/kills/lives/enemies/boss/accuracy/time for the recorder.
- **Recorder v3 (`record-video.mjs`):** no captions burned in anywhere;
  4 segments (splash→daily, mobile touch, live boss, daily loop to time-up)
  totalling 59.23 s; narration is TTS (default voice, no --voice flag) muxed
  with ffmpeg, captions live in `video/demo-video.srt` only. Current
  `video/demo-video.mp4` (59.23 s, 1280×720, H.264+AAC) + `.srt` verified
  frame-by-frame (frames in `video/frames3/`) and per-window volumedetect.
  Bad v2 file kept as `video/demo-video-bad-captions.mp4`.

## Known limitations

- Canvas is a fixed 1280×720 field stretched to the element: on a narrow phone the art squashes horizontally. Touch controls work; a letterboxed layout would be a polish upgrade.
- The splash card's PLAY button uses the `.devvit.net` hostname check to decide between `requestExpandedMode` and a plain navigation — if Reddit ever serves the webview from another host, the fallback navigation would run inside the feed card.
- `src/server/index.ts` `create-post` menu handler seeds a post on install; failure-safe (logs, returns 200) so a bad install never blocks the app.
