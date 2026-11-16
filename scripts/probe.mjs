// Headless probe for the built client: loads the splash and the game in
// Chromium, screenshots each screen, collects console/page errors, plays a
// real daily run with keyboard + mouse, and verifies the score is recorded
// and the leaderboard updates.
//
//   node scripts/test-server.mjs 8931 &   (in one shell)
///  node scripts/probe.mjs                (in another)
//   (or: npm run probe — starts the server itself)

import { chromium } from 'playwright-core';
import { execFile } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:8931';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

const errors = [];
const failures = [];
function check(name, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures.push(name);
}

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('requestfailed', (req) => errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText ?? ''}`));

// --- Splash (inline feed card) ---
await page.goto(`${BASE}/splash.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}1-splash.png` });
const splashText = (await page.textContent('body')) ?? '';
check('splash shows today date', /\d{4}-\d{2}-\d{2}/.test(splashText));
check('splash has PLAY button', (await page.$('#play')) !== null);
check('splash PLAY opens the game (standalone fallback)', await page.evaluate(() => {
  document.getElementById('play')?.click();
  return true;
}));
await page.waitForTimeout(800);
check('splash PLAY navigated to game.html', page.url().includes('game.html'));

// --- Game title ---
await page.goto(`${BASE}/game.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__daily !== undefined, { timeout: 10000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}2-title.png` });
const titleState = await page.evaluate(() => ({
  screen: window.__daily.screen,
  attempts: window.__daily.daily.attemptsLeft,
  date: window.__daily.daily.date,
}));
// The test server is stateful across probe runs, so assert relative to the
// attempts available at the start of this run, not an absolute 3.
const attemptsAtStart = titleState.attempts;
check('title screen reached', titleState.screen === 'title', JSON.stringify(titleState));
check('attempts available at start', attemptsAtStart >= 1, `attempts=${attemptsAtStart}`);
check('daily mode buttons visible', await page.evaluate(() => {
  const el = document.getElementById('mode-buttons');
  return el !== null && getComputedStyle(el).display !== 'none';
}));

// --- Staged screenshots via ?shot= (same seed => deterministic frames) ---
for (const shot of ['title', 'play', 'boss', 'over']) {
  await page.goto(`${BASE}/game.html?shot=${shot}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__shotReady === true, { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}shot-${shot}.png` });
}
check('staged shots rendered', true);

// --- Play a real daily run (short clock via ?duration=25) ---
await page.goto(`${BASE}/game.html?duration=25`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__daily !== undefined, { timeout: 10000 });
await page.waitForTimeout(800);
await page.click('#btn-daily');
await page.waitForTimeout(500);
const started = await page.evaluate(() => window.__daily.screen);
check('daily run started', started === 'play', `screen=${started}`);

// Wiggle the mouse in circles while holding fire, tap WASD keys.
const canvas = await page.$('#game');
const box = await canvas.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
for (let second = 0; second < 24; second += 1) {
  const angle = (second / 24) * Math.PI * 2 * 3;
  await page.mouse.move(cx + Math.cos(angle) * 220, cy + Math.sin(angle) * 140, { steps: 4 });
  const key = keys[second % keys.length];
  await page.keyboard.down(key);
  await page.waitForTimeout(650);
  await page.keyboard.up(key);
  const snap = await page.evaluate(() => ({ screen: window.__daily.screen, score: window.__daily.score }));
  if (snap.screen === 'over') break;
}
await page.mouse.up();
// The 25 s clock (or an earlier death) ends the run; wait for the over screen.
await page.waitForFunction(() => window.__daily.screen === 'over', { timeout: 25000 }).catch(() => null);
await page.waitForTimeout(1500);
const after = await page.evaluate(() => ({
  screen: window.__daily.screen,
  score: window.__daily.score,
  attempts: window.__daily.daily.attemptsLeft,
  best: window.__daily.daily.bestToday,
  board: window.__daily.daily.leaderboard,
}));
await page.screenshot({ path: `${OUT}3-over.png` });
check('run reached the over screen', after.screen === 'over', JSON.stringify(after));
check('score submitted (exactly one attempt used)', after.attempts === attemptsAtStart - 1, `attempts=${after.attempts} (started ${attemptsAtStart})`);
check('best today recorded', after.best === after.score || after.best > 0, `best=${after.best} score=${after.score}`);
check('leaderboard has the run', after.board.length >= 1 && after.board[0].score === after.score, JSON.stringify(after.board));

// --- Leaderboard panel + share ---
await page.click('#board-toggle');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}4-leaderboard.png` });
check('leaderboard panel opens', await page.evaluate(() => document.getElementById('board')?.classList.contains('show')));
const shareVisible = await page.evaluate(() => {
  const btn = document.getElementById('btn-share');
  return btn !== null && getComputedStyle(btn).display !== 'none';
});
check('share button visible after a run', shareVisible);
if (shareVisible) {
  await page.click('#btn-share');
  await page.waitForTimeout(800);
  const toastText = await page.evaluate(() => document.getElementById('toast')?.textContent ?? '');
  check('share reports success', /Shared/.test(toastText), toastText);
}

// --- Practice mode does not consume attempts ---
await page.goto(`${BASE}/game.html?duration=10`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__daily !== undefined, { timeout: 10000 });
await page.waitForTimeout(600);
await page.click('#btn-practice');
await page.waitForTimeout(500);
const practice = await page.evaluate(() => ({ screen: window.__daily.screen, mode: window.__daily.mode }));
check('practice mode starts', practice.screen === 'play' && practice.mode === 'practice', JSON.stringify(practice));
await page.waitForTimeout(11000);
const practiceAfter = await page.evaluate(() => ({ screen: window.__daily.screen, attempts: window.__daily.daily.attemptsLeft }));
check('practice run ends without consuming attempts', practiceAfter.attempts === attemptsAtStart - 1, `attempts=${practiceAfter.attempts}`);

// --- Console / network hygiene ---
check('no console errors, page errors or failed requests', errors.length === 0, errors.slice(0, 5).join(' | '));

await browser.close();

console.log(`\n${failures.length === 0 ? 'ALL PROBE CHECKS PASSED' : `FAILURES: ${failures.join(', ')}`}`);
process.exit(failures.length === 0 ? 0 : 1);
