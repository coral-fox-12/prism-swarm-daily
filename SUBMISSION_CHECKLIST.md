# Submission checklist — Reddit's Game of the Day

Hackathon: **Reddit's Game of the Day** ($35,000) — https://redditgameofday2026.devpost.com/
Deadline: **09:00 VN Tue 09/12/2026** (Dec 8, 2026, 6:00 PM PT).
Judging Dec 9–16 PT; winners ~Dec 17, 2026, 3:00 PM PT.
Prizes: Best Daily Game $15,000 · Best Ported Daily Game $6,000 ·
Honorable Mentions $1,000 × 10 · Devvit Helpers $500 × 6 · Feedback $200 × 5.
One prize per project. Criteria (equal weight): Delightful UX, Polish,
Reddity, Daily Content.

## Build — DONE ✅

- [x] Game built: PRISM SWARM ported to a daily game (daily seed, 120 s runs, 3 attempts/day, streaks, daily leaderboard, practice mode, share-to-Reddit)
- [x] Devvit Web app scaffolded (`devvit.json`, `src/client`, `src/server`, `src/shared`) — `@devvit/web` 0.15.4
- [x] `npm run build` passes (Vite → `dist/client` + `dist/server/index.cjs`)
- [x] `npm run type-check` passes (client + server)
- [x] `npm test` passes — 10 unit tests for the daily rules
- [x] Headless-Chromium probe passes — 18 checks: splash, title, a real daily run, score submit (exactly one attempt used), leaderboard, share, practice mode, zero console errors
- [x] Screenshots in `screenshots/` (splash, title, gameplay, boss, game-over, leaderboard)
- [x] Detailed `README.md` in the app root (required by the rules)
- [x] Demo video script in `DEMO_VIDEO_SCRIPT.md` (under 60 s)

## Still to do — in order

### 1. Devpost account (parent is handling)

- [ ] The agent's **separate** Devpost account is created (do NOT use the user's personal Devpost account — it is reserved for the Kiroween credit request).
- [ ] Prize contact email on the account must route to **oscar.ngo98@gmail.com**.

### 2. Reddit + Devvit access

- [ ] A Reddit account that can install apps (the account that will own the app).
- [ ] `devvit login` with that account (CLI auth — needs a browser sign-in; cannot be done headlessly from this sandbox if it hits a bot check).
- [ ] `devvit upload` from this folder — uploads the build. (App does NOT need to be published to qualify.)
- [ ] A **public subreddit with fewer than 200 members** for testing (create one or use an existing small one; it must stay free of charge until judging ends).

### 3. Playtest + demo post

- [ ] `devvit playtest` in that subreddit; install the app; use the menu item **"Create Daily Game Post"** (or create a post from the app) to make the demo post.
- [ ] Play the game from the post as a real user: confirm the splash card renders in the feed, PLAY expands the game, a daily run submits, the leaderboard fills, Share posts a comment.
- [ ] Copy the **app listing link**: `developers.reddit.com/apps/prism-swarm-daily`
- [ ] Copy the **demo post link** (the Reddit post running the game).

### 4. Demo video (under 60 seconds)

- [x] Record per [DEMO_VIDEO_SCRIPT.md](DEMO_VIDEO_SCRIPT.md) (~55 s: hook, daily idea, how it plays, daily loop, practice/mobile, close). Done 2026-11-17: `video/demo-video.mp4`, **50.03 s**, 1280×720 H.264, silent + burned-in English captions, 0 console errors. Real daily run scored 206 (rank #1, streak 1 day), share toast confirmed. Record script: `record-video.mjs` (re-runnable; needs the local test server on 8931).
- [ ] Upload to YouTube / Vimeo / Facebook / Youku and copy the link.

### 5. Submit on Devpost (parent does this — do NOT submit from this session)

- [ ] Project title, tagline, text description (what it is, why it's a daily game, the port story — see README).
- [ ] App listing link (`developers.reddit.com/apps/prism-swarm-daily`).
- [ ] Demo post link.
- [ ] Demo video link (optional but recommended; under 1 minute).
- [ ] Public repo link (optional — this project is not yet on a public host; add the link if the parent publishes it).
- [ ] Optional feedback survey link (if the team runs one).
- [ ] Submit before **09:00 VN Tue 09/12/2026**.

## Eligibility notes (verified against the rules)

- Vietnam is **not** in the excluded-countries list (Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea, Syria, OFAC-designated). ✅
- A pre-existing project must be **significantly updated after Nov 11, 2026** with an explanation. This port was newly created during the submission period from the original game, and the README documents exactly what changed — it qualifies as newly created, and the port story is stated in the submission text. ✅
- The app does **not** need to be published in the Reddit app directory to qualify. ✅
- Winners provide an affidavit (and a W-8BEN for non-US winners); prizes are delivered within 60 days of completed forms. The user (Ngo Minh Phuong) is the prize recipient; all prize mail must reach oscar.ngo98@gmail.com. ✅

## Risks / known limitations

- **Devvit upload needs a Reddit account + CLI login** — the one step that cannot be done from this sandbox without a browser sign-in.
- **Cloudflare Turnstile blocks** (2026-11-17): the cloud browser cannot clear Turnstile on Groq/Cloudflare signups because the datacenter egress IP is scored. If `devvit login` or any signup hits Turnstile, do it from the user's own device/network.
- **Mobile layout:** the canvas is a fixed 1280×720 field stretched to the element, so on a narrow phone the art squashes horizontally. Touch controls work (joystick + auto-aim/auto-fire), but a proper letterboxed layout would be a polish upgrade.
- **Practice runs never touch the server** by design; a practice score is never submitted.
