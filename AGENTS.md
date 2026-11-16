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

## Known limitations

- Canvas is a fixed 1280×720 field stretched to the element: on a narrow phone the art squashes horizontally. Touch controls work; a letterboxed layout would be a polish upgrade.
- The splash card's PLAY button uses the `.devvit.net` hostname check to decide between `requestExpandedMode` and a plain navigation — if Reddit ever serves the webview from another host, the fallback navigation would run inside the feed card.
- `src/server/index.ts` `create-post` menu handler seeds a post on install; failure-safe (logs, returns 200) so a bad install never blocks the app.
