# Demo video script — PRISM SWARM Daily

**Constraint: under 60 seconds.** The judges are not required to watch
beyond 1 minute, so the whole video is 55 seconds, no intro logo, no outro
slate — the game is the first frame. Record the screen at 1280×720 with the
game's own audio (or a short music bed under the voiceover). Captions burned
in, because many judges watch muted.

Total: **~55 s**. Shots are listed with the exact footage to capture and the
voiceover line to read over it. Record the game footage first (use
`?shot=` scenes and a live run), then record the voiceover to picture.

## 0:00–0:06 — The hook (6 s)

- **Footage:** live gameplay, mid-run — ship weaving through a dense swarm, colour-matched shots landing, combo climbing to ×4.00, a splitter bursting. Start mid-action, no title screen.
- **Voiceover:** "One swarm. One day. Three tries. Prism Swarm Daily."
- **Caption:** ONE SWARM · ONE DAY · THREE TRIES

## 0:06–0:14 — The daily idea (8 s)

- **Footage:** the splash card in a Reddit feed (PLAY TODAY'S SWARM, today's date, best today, streak), click PLAY, the game expanding to full screen.
- **Voiceover:** "Every morning Reddit gets the same swarm — same seed, same enemies, for everyone. Two minutes, three attempts, best score wins the day."
- **Caption:** SAME SEED FOR EVERYONE · 2-MINUTE RUNS · 3 ATTEMPTS

## 0:14–0:26 — How it plays (12 s)

- **Footage:** quick cuts, each 3–4 s:
  1. Ship switching colour (Q/E) and a matching hit flashing 3× damage.
  2. A wrong-colour hit chipping for 1, then the correct colour melting the same enemy.
  3. The Prism Keeper boss bar (wave 5) and the boss's colour wheel.
- **Voiceover:** "Match your bullet colour to the enemy and you deal triple damage. Wrong colour, and you barely scratch it. A boss guards every fifth wave."
- **Caption:** MATCH THE COLOUR = 3× DAMAGE · BOSS EVERY 5TH WAVE

## 0:26–0:36 — The daily loop (10 s)

- **Footage:** the timer bar draining to zero, the game-over panel (FINAL SCORE, TODAY'S RANK #1, STREAK 1 day 🔥), then the leaderboard panel opening with the top 10 and the Share button; the share toast "Shared!".
- **Voiceover:** "When the clock runs out, your best score hits today's leaderboard — and one tap shares it as a comment on the post, so the whole subreddit can see who beat the swarm."
- **Caption:** DAILY LEADERBOARD · STREAKS · SHARE YOUR SCORE

## 0:36–0:46 — Practice + mobile (10 s)

- **Footage:** 4 s of PRACTICE mode (free play, no clock), then 6 s of the touch layout — left thumb on the virtual joystick, right thumb aiming, auto-fire picking off a chaser.
- **Voiceover:** "Not ready to spend an attempt? Practice is free, with a random seed. And on mobile it's thumb-friendly — joystick on the left, aim on the right, auto-fire does the rest."
- **Caption:** PRACTICE IS FREE · TOUCH-READY

## 0:46–0:55 — The close (9 s)

- **Footage:** title screen (daily strip: TODAY, attempts left, best today), the DAILY RUN button pulsing, one last 3-second burst of gameplay, freeze on the logo.
- **Voiceover:** "Prism Swarm Daily — a two-minute reason to come back to Reddit every day."
- **Caption:** PRISM SWARM DAILY · A 2-MINUTE REASON TO COME BACK

## Recording notes

- **Game footage:** use the local test server (`node scripts/test-server.mjs 8931`) and the `?shot=` scenes for the staged frames (`title`, `play`, `boss`, `over`); record a real daily run with `?duration=25` so the timer, the game-over panel and the rank all appear quickly.
- **Feed shot:** screen-record the splash card from `http://127.0.0.1:8931/splash.html` (it renders the same card Reddit shows inline); if the live Reddit post exists by recording day, use that instead.
- **Audio:** capture the game's WebAudio (it is all synthesized, no licensed music). Keep the voiceover dry and close-mic'd; duck the game audio under it.
- **Do not include:** the Devvit upload terminal, the Devpost form, or any talking head — the rules cap the video at 1 minute and the game is the pitch.
- **Export:** 1280×720, H.264, ≤ 55 s, upload to YouTube (unlisted is fine) and paste the link in the Devpost submission.
