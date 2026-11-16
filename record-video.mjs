// Demo video recorder v2 — PRISM SWARM Daily (Reddit's Game of the Day).
// Records three segments with Playwright video, then concatenates with ffmpeg:
//   seg A (1280x720): hook -> splash/PLAY -> boss -> daily loop -> practice
//   seg B (390x844, touch): mobile practice gameplay
//   seg C (1280x720): close — title, DAILY RUN, gameplay burst, freeze on logo
// Total target ~45 s (hard limit: under 60 s). Silent + burned-in captions.
//
// Lessons from v1 (92.8 s — too long, score 0):
// - `waitUntil: 'networkidle'` and `page.click()` are slow here (~2-3 s per
//   navigation, ~1.8 s per button click). Use domcontentloaded + JS .click().
// - Mouse-wiggle play scores 0: enemies take ~3 s to arrive and fast aim
//   sweeps miss. Touch mode auto-aims at the nearest enemy with colour
//   matching (verified: score 206 after 5 s), so gameplay is driven with
//   CDP touch events (joystick hold + slow drag) instead of the mouse.
//
//   node scripts/test-server.mjs 8931   (fresh server first — attempts reset)
//   node record-video.mjs
//   ffprobe video/demo-video.mp4

import { chromium } from 'playwright-core';
import { execFile } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const BASE = process.env.VIDEO_BASE ?? 'http://127.0.0.1:8931';
const ROOT = new URL('./', import.meta.url).pathname;
const OUT = `${ROOT}video/`;
await mkdir(OUT, { recursive: true });

const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

// Caption bar injected on every navigation of the recorded page.
const CAPTION_INIT = `
window.__setCaption = (text) => {
  let bar = document.getElementById('__vidcap');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = '__vidcap';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;'
      + 'background:rgba(8,8,20,0.78);color:#fff;text-align:center;'
      + 'font:700 21px/1.35 system-ui,sans-serif;letter-spacing:.06em;'
      + 'padding:9px 12px;pointer-events:none;text-transform:uppercase;';
    document.documentElement.appendChild(bar);
  }
  bar.textContent = text;
};
`;

async function newPage(browser, { width, height, mobile = false }) {
  const context = await browser.newContext({
    viewport: { width, height },
    ...(mobile ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { hasTouch: true }),
    recordVideo: { dir: OUT, size: { width, height } },
  });
  const page = await context.newPage();
  await page.addInitScript(CAPTION_INIT);
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  return { context, page };
}

// Fast navigation: domcontentloaded + the game's own ready flag.
async function gotoGame(page, query = '') {
  await page.goto(`${BASE}/game.html${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__daily !== undefined, { timeout: 10000 });
}

async function gotoSplash(page) {
  await page.goto(`${BASE}/splash.html`, { waitUntil: 'domcontentloaded' });
  await sleep(400);
}

// JS .click() — Playwright's actionability wait on the pulsing buttons costs ~2 s.
async function eclick(page, sel) {
  await page.evaluate((s) => document.querySelector(s)?.click(), sel);
}

async function setCaption(page, text) {
  await page.evaluate((t) => window.__setCaption(t), text);
}

// Touch-driven play: one joystick touch engages touch mode (auto-aim +
// auto colour-match fire at the nearest enemy); slow drag steers the ship.
async function touchPlay(page, seconds, joyX = 200, joyY = 600) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joyX, y: joyY, id: 1 }] });
  const moves = Math.max(1, Math.round(seconds / 1.5));
  for (let i = 1; i <= moves; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: joyX + Math.cos(i * 1.1) * 30, y: joyY + Math.sin(i * 1.1) * 30, id: 1 }],
    });
    await sleep((seconds * 1000) / moves);
    if ((await page.evaluate(() => window.__daily?.screen)) === 'over') break;
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function closeSegment(context, page, name) {
  await page.close();
  await context.close();
  const p = await page.video().path();
  const dest = `${OUT}${name}.webm`;
  await rename(p, dest);
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest]);
  console.log(`${name}: ${Number(stdout.trim()).toFixed(2)}s`);
  return dest;
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const t0 = Date.now();
const mark = (label) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

// ---------- Segment A: desktop 1280x720 ----------
{
  const { context, page } = await newPage(browser, { width: 1280, height: 720 });
  // Hook — live daily run, auto-aim scoring.
  await gotoGame(page, '?duration=30');
  await eclick(page, '#btn-daily');
  await setCaption(page, 'One swarm · One day · Three tries');
  mark('A hook: daily run started');
  await touchPlay(page, 5);
  console.log('hook score:', await page.evaluate(() => window.__daily.score));
  // Splash card -> PLAY expands the game.
  await gotoSplash(page);
  await setCaption(page, 'Same seed for everyone · 2-minute runs · 3 attempts');
  await sleep(1500);
  await eclick(page, '#play');
  await page.waitForFunction(() => window.__daily !== undefined, { timeout: 10000 });
  await sleep(1200);
  mark('A splash -> title');
  // Boss — staged deterministic scene (live play cannot reach wave 5 in seconds).
  await page.goto(`${BASE}/game.html?shot=boss`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__shotReady === true, { timeout: 15000 }).catch(() => null);
  await setCaption(page, 'Match the colour = 3× damage · Boss every 5th wave');
  await sleep(2500);
  mark('A boss scene');
  // Daily loop — 10 s clock drains, over panel, leaderboard, share.
  await gotoGame(page, '?duration=10');
  await eclick(page, '#btn-daily');
  await setCaption(page, 'Daily leaderboard · Streaks · Share your score');
  await touchPlay(page, 9);
  await page.waitForFunction(() => window.__daily.screen === 'over', { timeout: 8000 }).catch(() => null);
  await sleep(1000);
  const over = await page.evaluate(() => ({ screen: window.__daily.screen, score: window.__daily.score }));
  console.log('over screen:', JSON.stringify(over));
  await eclick(page, '#board-toggle');
  await sleep(700);
  const shareVisible = await page.evaluate(() => {
    const b = document.getElementById('btn-share');
    return b !== null && getComputedStyle(b).display !== 'none';
  });
  if (shareVisible) {
    await eclick(page, '#btn-share');
    await sleep(800);
    console.log('share toast:', await page.evaluate(() => document.getElementById('toast')?.textContent ?? ''));
  }
  mark('A daily loop done');
  // Practice mode (free play).
  await gotoGame(page, '?duration=10');
  await eclick(page, '#btn-practice');
  await setCaption(page, 'Practice is free · Touch-ready');
  await touchPlay(page, 3);
  await closeSegment(context, page, 'seg-a');
}

// ---------- Segment B: mobile 390x844, touch ----------
{
  const { context, page } = await newPage(browser, { width: 390, height: 844, mobile: true });
  await gotoGame(page, '?duration=30');
  await setCaption(page, 'Practice is free · Touch-ready');
  await eclick(page, '#btn-practice');
  await sleep(400);
  await touchPlay(page, 4, 95, 640);
  mark('B mobile done');
  await closeSegment(context, page, 'seg-b');
}

// ---------- Segment C: close — title, burst, freeze ----------
{
  const { context, page } = await newPage(browser, { width: 1280, height: 720 });
  await gotoGame(page, '');
  await setCaption(page, 'Prism Swarm Daily · A 2-minute reason to come back');
  await sleep(1500);
  await eclick(page, '#btn-daily');
  await touchPlay(page, 2.5);
  await page.goto(`${BASE}/game.html?shot=title`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__shotReady === true, { timeout: 15000 }).catch(() => null);
  await setCaption(page, 'Prism Swarm Daily · A 2-minute reason to come back');
  await sleep(1500);
  mark('C close done');
  await closeSegment(context, page, 'seg-c');
}

await browser.close();
console.log(`console/page errors: ${errors.length}`, errors.slice(0, 5));

// ---------- Concatenate with ffmpeg ----------
const list = `${OUT}concat.txt`;
await writeFile(
  list,
  `file 'seg-a.webm'\nfile 'seg-b-scaled.mp4'\nfile 'seg-c.webm'\n`,
);
await run('ffmpeg', ['-y', '-v', 'error', '-i', `${OUT}seg-b.webm`, '-vf',
  'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', `${OUT}seg-b-scaled.mp4`]);
await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', `${OUT}demo-video.mp4`]);
const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size',
  '-of', 'default=noprint_wrappers=1', `${OUT}demo-video.mp4`]);
console.log(`FINAL video/demo-video.mp4:\n${stdout}`);
