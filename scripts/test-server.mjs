// Standalone test server for the built client: serves dist/client and
// implements the same /api/* contract in memory, so the headless probe can
// exercise the full daily loop (fetch daily -> play -> submit -> leaderboard)
// without Devvit. Node standard library only.
//
//   node scripts/test-server.mjs [port]   (default 8931)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist/client', import.meta.url)));
const port = Number(process.argv[2] ?? 8931);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

// In-memory copy of the server rules (same caps: 3 attempts/day, score cap).
const ATTEMPTS_PER_DAY = 3;
const MAX_SCORE = 100000;
const today = new Date().toISOString().slice(0, 10);
let seed = 0x811c9dc5;
for (const ch of today) {
  seed ^= ch.charCodeAt(0);
  seed = Math.imul(seed, 0x01000193);
}
seed >>>= 0;

const users = new Map(); // userId -> { attemptsUsed, best, streak, lastPlayed }
const board = new Map(); // userId -> best score
const names = new Map(); // userId -> username
const ME = 'probe-user';
names.set(ME, 'probe-user');

function state() {
  const u = users.get(ME) ?? { attemptsUsed: 0, best: 0, streak: 0, lastPlayed: '' };
  const rows = [...board.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, score], i) => ({ username: names.get(id) ?? 'player', score, rank: i + 1, you: id === ME }));
  return {
    status: 'ok',
    date: today,
    seed,
    durationSeconds: 120,
    attemptsLeft: Math.max(0, ATTEMPTS_PER_DAY - u.attemptsUsed),
    bestToday: u.best,
    streak: u.streak,
    leaderboard: rows,
    loggedIn: true,
    standalone: false,
  };
}

function readBody(req) {
  return new Promise((resolveBody) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolveBody(JSON.parse(data || '{}'));
      } catch {
        resolveBody({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const json = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  if (url.pathname === '/api/daily' && req.method === 'GET') return json(200, state());
  if (url.pathname === '/api/score' && req.method === 'POST') {
    const body = await readBody(req);
    const u = users.get(ME) ?? { attemptsUsed: 0, best: 0, streak: 0, lastPlayed: '' };
    if (body.date !== today || typeof body.score !== 'number' || body.score < 0 || body.score > MAX_SCORE) {
      return json(200, { status: 'error', accepted: false, bestToday: u.best, rank: 0, streak: u.streak, attemptsLeft: Math.max(0, ATTEMPTS_PER_DAY - u.attemptsUsed), leaderboard: state().leaderboard, message: 'Score rejected.' });
    }
    if (u.attemptsUsed >= ATTEMPTS_PER_DAY) {
      return json(200, { status: 'ok', accepted: false, bestToday: u.best, rank: 0, streak: u.streak, attemptsLeft: 0, leaderboard: state().leaderboard, message: 'No attempts left today.' });
    }
    u.attemptsUsed += 1;
    u.best = Math.max(u.best, Math.floor(body.score));
    if (u.lastPlayed !== today) {
      const y = new Date(`${today}T00:00:00Z`);
      y.setUTCDate(y.getUTCDate() - 1);
      u.streak = u.lastPlayed === y.toISOString().slice(0, 10) ? u.streak + 1 : 1;
      u.lastPlayed = today;
    }
    users.set(ME, u);
    const prev = board.get(ME) ?? 0;
    if (u.best > prev) board.set(ME, u.best);
    const s = state();
    return json(200, { status: 'ok', accepted: true, bestToday: u.best, rank: s.leaderboard.find((r) => r.you)?.rank ?? 0, streak: u.streak, attemptsLeft: s.attemptsLeft, leaderboard: s.leaderboard });
  }
  if (url.pathname === '/api/share' && req.method === 'POST') {
    return json(200, { status: 'ok', commentUrl: 'https://www.reddit.com/r/test/comments/fake' });
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'splash.html';
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end();
  if (!existsSync(file)) return res.writeHead(404).end('not found');
  const data = await readFile(file);
  res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
  res.end(data);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`test server on http://127.0.0.1:${port} (today ${today}, seed ${seed})`);
});
