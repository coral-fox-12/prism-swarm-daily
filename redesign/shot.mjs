// Before/after screenshot helper for the PRISM SWARM redesign audit.
// Usage: node redesign/shot.cjs [prefix]  (default prefix "before")
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:8931';
const OUT = new URL('./', import.meta.url).pathname;
const prefix = process.argv[2] ?? 'before';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/home/hatch/.cache/ms-playwright/chromium-1148/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function shot(page, url, path, waitFor) {
  await page.goto(url, { waitUntil: 'networkidle' });
  if (waitFor) await page.waitForFunction(waitFor, { timeout: 10000 }).catch(() => null);
  await page.waitForTimeout(1200);
  await page.screenshot({ path });
  console.log('saved', path);
}

// Splash card
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await shot(desktop, `${BASE}/splash.html`, `${OUT}${prefix}-desktop.png`);
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await shot(mobile, `${BASE}/splash.html`, `${OUT}${prefix}-mobile.png`);

// Game title screen (canvas)
await shot(desktop, `${BASE}/game.html`, `${OUT}${prefix}-game-desktop.png`, () => window.__daily !== undefined);
await shot(mobile, `${BASE}/game.html`, `${OUT}${prefix}-game-mobile.png`, () => window.__daily !== undefined);

await browser.close();
