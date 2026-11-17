// Demo video recorder v3 — PRISM SWARM Daily (Reddit's Game of the Day).
// Records four segments with Playwright video, converts each to 1280x720
// mp4, then concatenates with ffmpeg. NO burned-in captions anywhere
// (narration + an .srt sidecar carry the words instead), NO joystick on
// desktop: desktop segments drive the game with ?autoplay=1 (the autopilot:
// intercept aim, colour match, dodge, fire discipline) and desktop
// contexts run with hasTouch:false. Touch input is used ONLY in the mobile
// segment, where the joystick legitimately belongs.
//
//   node scripts/test-server.mjs 8931   (fresh server first — attempts reset)
//   node record-video.mjs
//   ffprobe video/demo-video-clean.mp4
//
// Segments (target ~54 s total):
//   A (1280x720): splash card -> PLAY -> title -> daily run, autoplay, warmup=6
//   B (390x844, touch): mobile practice, warmup=5, real touch joystick play
//   C (1280x720): boss fight, live: ?autoplay=1&wave=5&warmup=4 practice
//   D (1280x720): daily loop: ?duration=12 run to time-up, over panel,
//      leaderboard, share toast

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

async function newPage(browser, { width, height, mobile = false }) {
  const context = await browser.newContext({
    viewport: { width, height },
    // Desktop is NOT a touch device: hasTouch:false, so the virtual
    // joystick can never appear there (v2 recorded desktop with
    // hasTouch:true + CDP touch, which is how the joystick circle ended
    // up stuck on screen through the whole video).
    ...(mobile
      ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
      : { hasTouch: false }),
    recordVideo: { dir: OUT, size: { width, height } },
  });
  const page = await context.newPage();
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

async function state(page) {
  return page.evaluate(() => ({
    screen: window.__daily.screen,
    score: window.__daily.score,
    wave: window.__daily.wave,
    kills: window.__daily.kills,
    lives: window.__daily.lives,
    acc: window.__daily.accuracy,
    enemies: window.__daily.enemies,
    boss: window.__daily.boss,
    joy: getComputedStyle(document.getElementById('joy-base')).display,
  }));
}

// Touch-driven play (mobile segment only): one joystick touch engages touch
// mode (auto-aim + auto colour-match fire at the nearest enemy); slow drag
// steers the ship.
async function touchPlay(page, seconds, joyX = 95, joyY = 640) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: joyX, y: joyY, id: 1 }] });
  const moves = Math.max(1, Math.round(seconds / 1));
  for (let i = 1; i <= moves; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: joyX + Math.cos(i * 1.1) * 25, y: joyY + Math.sin(i * 1.1) * 25, id: 1 }],
    });
    await sleep((seconds * 1000) / moves);
    if ((await page.evaluate(() => window.__daily?.screen)) === 'over') break;
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function closeSegment(context, page, name) {
  const end = await state(page).catch(() => null);
  console.log(`${name} end state:`, JSON.stringify(end));
  await page.close();
  await context.close();
  const p = await page.video().path();
  const dest = `${OUT}${name}.webm`;
  await rename(p, dest);
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest]);
  console.log(`${name}: ${Number(stdout.trim()).toFixed(2)}s`);
  return { dest, end };
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const t0 = Date.now();
const mark = (label) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

// ---------- Segment A: desktop 1280x720 — splash, title, daily run ----------
let segA;
{
  const { context, page } = await newPage(browser, { width: 1280, height: 720 });
  // Splash card in a feed, then PLAY expands the game.
  await gotoSplash(page);
  await sleep(2100);
  await eclick(page, '#play');
  await page.waitForFunction(() => window.__daily !== undefined, { timeout: 10000 });
  // Fresh navigation with the staging hooks: autoplay flies, warmup=6
  // pre-plays so the run opens mid-action (score already climbing,
  // enemies on screen) instead of on an empty starfield.
  await gotoGame(page, '?autoplay=1&warmup=6&duration=30');
  await sleep(1200);
  mark('A title');
  await eclick(page, '#btn-daily');
  await sleep(13000);
  segA = await closeSegment(context, page, 'seg-a');
  if (!segA.end || segA.end.score < 500 || segA.end.kills < 5) {
    throw new Error(`segment A looks dead: ${JSON.stringify(segA.end)}`);
  }
  if (segA.end.joy !== 'none') throw new Error(`segment A: joystick visible on desktop (display=${segA.end.joy})`);
  mark('A daily run done');
}

// ---------- Segment B: mobile 390x844, touch ----------
let segB;
{
  const { context, page } = await newPage(browser, { width: 390, height: 844, mobile: true });
  await gotoGame(page, '?warmup=5');
  await eclick(page, '#btn-practice');
  await sleep(400);
  await touchPlay(page, 7, 95, 640);
  segB = await closeSegment(context, page, 'seg-b');
  if (!segB.end || segB.end.score < 200 || segB.end.kills < 3) {
    throw new Error(`segment B looks dead: ${JSON.stringify(segB.end)}`);
  }
  mark('B mobile done');
}

// ---------- Segment C: desktop 1280x720 — live boss fight ----------
let segC;
{
  const { context, page } = await newPage(browser, { width: 1280, height: 720 });
  await gotoGame(page, '?autoplay=1&wave=5&warmup=4');
  await eclick(page, '#btn-practice');
  await sleep(10000);
  segC = await closeSegment(context, page, 'seg-c');
  if (!segC.end || !segC.end.boss) throw new Error(`segment C: no boss on screen: ${JSON.stringify(segC.end)}`);
  if (segC.end.score < 500) throw new Error(`segment C looks dead: ${JSON.stringify(segC.end)}`);
  if (segC.end.joy !== 'none') throw new Error(`segment C: joystick visible on desktop (display=${segC.end.joy})`);
  mark('C boss done');
}

// ---------- Segment D: desktop 1280x720 — daily loop to time-up ----------
let segD;
{
  const { context, page } = await newPage(browser, { width: 1280, height: 720 });
  await gotoGame(page, '?autoplay=1&warmup=6&duration=12');
  await eclick(page, '#btn-daily');
  await page.waitForFunction(() => window.__daily.screen === 'over', { timeout: 20000 }).catch(() => null);
  await sleep(2500);
  const over = await state(page);
  console.log('D over screen:', JSON.stringify(over));
  await eclick(page, '#board-toggle');
  await sleep(1000);
  const shareVisible = await page.evaluate(() => {
    const b = document.getElementById('btn-share');
    return b !== null && getComputedStyle(b).display !== 'none';
  });
  if (shareVisible) {
    await eclick(page, '#btn-share');
    await sleep(1500);
    console.log('share toast:', await page.evaluate(() => document.getElementById('toast')?.textContent ?? ''));
  }
  segD = await closeSegment(context, page, 'seg-d');
  if (!segD.end || segD.end.score < 500) throw new Error(`segment D looks dead: ${JSON.stringify(segD.end)}`);
  if (segD.end.joy !== 'none') throw new Error(`segment D: joystick visible on desktop (display=${segD.end.joy})`);
  mark('D daily loop done');
}

await browser.close();
console.log(`console/page errors: ${errors.length}`, errors.slice(0, 5));

// ---------- Convert each segment to 1280x720 mp4, then concatenate ----------
async function toMp4(src, dest, mobile = false) {
  const vf = mobile
    ? 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1'
    : 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1';
  await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', vf,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', dest]);
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dest]);
  console.log(`${dest.split('/').pop()}: ${Number(stdout.trim()).toFixed(2)}s`);
}
await toMp4(segA.dest, `${OUT}seg-a.mp4`);
await toMp4(segB.dest, `${OUT}seg-b-scaled.mp4`, true);
await toMp4(segC.dest, `${OUT}seg-c.mp4`);
await toMp4(segD.dest, `${OUT}seg-d.mp4`);

const list = `${OUT}concat.txt`;
await writeFile(list, `file 'seg-a.mp4'\nfile 'seg-b-scaled.mp4'\nfile 'seg-c.mp4'\nfile 'seg-d.mp4'\n`);
await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', `${OUT}demo-video-clean.mp4`]);
const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size',
  '-show_entries', 'stream=codec_name,width,height',
  '-of', 'default=noprint_wrappers=1', `${OUT}demo-video-clean.mp4`]);
console.log(`FINAL video/demo-video-clean.mp4 (no audio yet — narration is muxed separately):\n${stdout}`);
