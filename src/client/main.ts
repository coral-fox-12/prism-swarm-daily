// PRISM SWARM: Daily — the expanded game view.
//
// A port of PRISM SWARM (make.fun best-game-01) into a bite-sized daily game:
// one seed per day for everyone, 120-second runs, 3 attempts a day, a
// streak for coming back, and a daily leaderboard. Practice mode is free
// play with a random seed and no timer, so judges can play without limits.
//
// The game itself is the proven PRISM SWARM simulation (fixed 1/60 s steps,
// seeded RNG, colour-match x3 damage, combo, waves, boss every 5th wave).
// The daily layer only decides the seed, the clock, and where the score goes:
// the Devvit server (Redis) when reachable, localStorage otherwise.
//
// ?seed=N fixes the spawn pattern. ?duration=N overrides the daily clock
// (test hook). ?shot=title|play|boss|over stages that scene for screenshots.
// ?autoplay=1 steers a live run with the autopilot (demo recording).
// ?warmup=N pre-plays N seconds with the autopilot, invulnerable, then resets
// the clock, so a recording starts mid-action instead of on an empty field.
// ?wave=N starts the run at wave N (boss: ?wave=5). All three are staging
// hooks for recording; they change nothing for a normal player.

import { BEST_KEY, DAILY, PLAYER, STEP } from './game/config.js';
import { createRandom } from './game/random.js';
import { createWorld, EVENT_HIT, EVENT_OVER, EVENT_PICKUP, EVENT_WAVE_CLEAR } from './game/world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './game/input.js';
import { createAudio } from './game/audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './game/render.js';
import { pilotInput, stageShot } from './game/shots.js';
import { fetchDaily, postScore, postShare } from './api.js';
import { loadLocalDaily, recordLocalRun } from './daily.js';
import { seedFromDate, utcDateString, type DailyState } from '../shared/api.ts';

const MAX_FRAME = 0.25;

declare global {
  interface Window {
    __shotReady?: boolean;
  }
}

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const durationParam = Number.parseInt(params.get('duration') ?? '', 10);
const autoplayParam = params.get('autoplay') === '1';
const warmupParam = Math.max(0, Number.parseInt(params.get('warmup') ?? '', 10) || 0);
const waveParam = Number.parseInt(params.get('wave') ?? '', 10);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const status = document.getElementById('status') as HTMLParagraphElement;
const modeButtons = document.getElementById('mode-buttons') as HTMLDivElement;
const btnDaily = document.getElementById('btn-daily') as HTMLButtonElement;
const btnPractice = document.getElementById('btn-practice') as HTMLButtonElement;
const board = document.getElementById('board') as HTMLDivElement;
const boardDate = document.getElementById('board-date') as HTMLParagraphElement;
const boardList = document.getElementById('board-list') as HTMLOListElement;
const boardEmpty = document.getElementById('board-empty') as HTMLParagraphElement;
const boardToggle = document.getElementById('board-toggle') as HTMLButtonElement;
const btnShare = document.getElementById('btn-share') as HTMLButtonElement;
const toast = document.getElementById('toast') as HTMLDivElement;
const joyBase = document.getElementById('joy-base') as HTMLDivElement;
const joyKnob = document.getElementById('joy-knob') as HTMLDivElement;

let toastTimer = 0;
function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4000);
}

function readBest(): number {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value: number): void {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

/** Daily state, from the server when reachable, local storage otherwise. */
async function loadDaily(): Promise<DailyState> {
  const server = await fetchDaily();
  if (server) return server;
  const local = loadLocalDaily(new Date());
  local.seed = seedFromDate(local.date);
  return local;
}

function renderBoard(daily: DailyState): void {
  boardDate.textContent = `${daily.date} · ${daily.leaderboard.length} ${daily.leaderboard.length === 1 ? 'player' : 'players'} · your best ${daily.bestToday.toLocaleString('en-US')}`;
  boardList.innerHTML = '';
  boardEmpty.style.display = daily.leaderboard.length === 0 ? 'block' : 'none';
  for (const row of daily.leaderboard) {
    const item = document.createElement('li');
    if (row.you) item.className = 'you';
    const name = document.createElement('span');
    name.textContent = `#${row.rank} ${row.username}${row.you ? ' (you)' : ''}`;
    const score = document.createElement('span');
    score.textContent = row.score.toLocaleString('en-US');
    item.append(name, score);
    boardList.append(item);
  }
}

boardToggle.addEventListener('click', () => {
  board.classList.toggle('show');
  if (board.classList.contains('show')) renderBoard(dailyState);
});

let dailyState: DailyState = loadLocalDaily(new Date());
dailyState.seed = seedFromDate(dailyState.date);
let world: any = createWorld(createRandom(dailyState.seed));
let screen: string = SCREEN_TITLE;
let best = readBest();
let mode: 'daily' | 'practice' | null = null;
let durationSeconds = DAILY.durationSeconds;
let dailyResult: { rank: number; streak: number; score: number } | null = null;
let submittedScore: number | null = null;

const renderer: any = createRenderer(canvas);
const audio: any = createAudio();
const input: any = createInput(canvas);

function uiForDraw(): Record<string, unknown> {
  const ui: Record<string, unknown> = { best, muted: audio.muted };
  if (screen === SCREEN_TITLE) {
    ui.daily = {
      date: dailyState.date,
      attemptsLeft: dailyState.attemptsLeft,
      bestToday: dailyState.bestToday,
      streak: dailyState.streak,
      leaderboard: dailyState.leaderboard,
    };
  }
  if (screen === SCREEN_PLAY && mode === 'daily') {
    ui.timeLeft = Math.max(0, durationSeconds - world.state.time);
    ui.timeTotal = durationSeconds;
  }
  if (screen === SCREEN_OVER && dailyResult) ui.dailyResult = dailyResult;
  return ui;
}

function refreshDailyButton(): void {
  const left = dailyState.attemptsLeft;
  btnDaily.textContent = left > 0 ? `▶ DAILY RUN — ${left} ${left === 1 ? 'ATTEMPT' : 'ATTEMPTS'} LEFT` : '▶ DAILY RUN — NO ATTEMPTS LEFT TODAY';
  btnDaily.disabled = left <= 0;
}

function showModeButtons(show: boolean): void {
  modeButtons.classList.toggle('show', show);
  if (show) refreshDailyButton();
}

function announce(message: string): void {
  status.textContent = message;
}

function startRun(nextMode: 'daily' | 'practice'): void {
  if (nextMode === 'daily') {
    if (dailyState.attemptsLeft <= 0) {
      showToast('No attempts left today — come back tomorrow, or play Practice.');
      return;
    }
    durationSeconds = Number.isInteger(durationParam) && durationParam > 0 ? durationParam : DAILY.durationSeconds;
    world = createWorld(createRandom(dailyState.seed));
  } else {
    const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
    durationSeconds = Number.POSITIVE_INFINITY;
    world = createWorld(createRandom(seed));
  }
  mode = nextMode;
  dailyResult = null;
  submittedScore = null;
  btnShare.style.display = 'none';
  board.classList.remove('show');
  world.reset();
  world.attract = false;
  if (Number.isInteger(waveParam) && waveParam > 1) {
    world.state.wave = waveParam - 1;
    world.nextWave();
  }
  if (warmupParam > 0) {
    // Stage a busy field for demo recording: pre-play with the autopilot
    // while invulnerable, then reset the clock so the run starts at 0:00
    // mid-action instead of on an empty field.
    world.attract = true;
    for (let i = 0; i < warmupParam * 60; i += 1) {
      const target = world.nearestEnemy(world.player.x, world.player.y);
      world.step(STEP, pilotInput(world, 1, target), null);
    }
    world.attract = false;
    world.state.time = 0;
  }
  screen = SCREEN_PLAY;
  audio.ensure();
  audio.startMusic();
  audio.click();
  showModeButtons(false);
  announce(
    nextMode === 'daily'
      ? `Daily run. ${durationSeconds} seconds on the clock, ${dailyState.attemptsLeft} attempts left today. Match your shot colour to the enemy.`
      : 'Practice. No clock, no leaderboard — just the swarm.',
  );
}

async function endGame(reason: 'over' | 'time'): Promise<void> {
  screen = SCREEN_OVER;
  // Freeze the play field: a score popup still floating when the run ends
  // would ghost through the translucent over-screen panel.
  world.floaters.length = 0;
  world.flash = 0;
  if (world.state.score > best) {
    best = world.state.score;
    saveBest(best);
  }
  audio.gameOver();
  audio.stopMusic();
  if (mode === 'daily') {
    const score = world.state.score;
    submittedScore = score;
    const request = { date: dailyState.date, score, kills: world.state.kills, wave: world.state.wave };
    const server = await postScore(request);
    if (server && server.status === 'ok') {
      dailyState.bestToday = server.bestToday;
      dailyState.streak = server.streak;
      dailyState.attemptsLeft = server.attemptsLeft;
      dailyState.leaderboard = server.leaderboard;
      dailyResult = { rank: server.rank, streak: server.streak, score };
      if (!server.accepted) showToast(server.message ?? 'Score already recorded.');
    } else {
      const local = recordLocalRun(dailyState.date, score);
      dailyState.bestToday = local.bestToday;
      dailyState.streak = local.streak;
      dailyState.attemptsLeft = local.attemptsLeft;
      dailyState.leaderboard = local.leaderboard;
      dailyResult = { rank: local.rank, streak: local.streak, score };
    }
    renderBoard(dailyState);
    btnShare.style.display = 'block';
    btnShare.disabled = false;
    btnShare.textContent = 'SHARE MY SCORE ON REDDIT';
    refreshDailyButton();
  }
  announce(
    reason === 'time'
      ? `Time! Daily score ${world.state.score}. Best today ${dailyState.bestToday}. Press R to go back.`
      : `Game over. Score ${world.state.score}. Best ${best}. Press R to go back.`,
  );
}

btnDaily.addEventListener('click', () => startRun('daily'));
btnPractice.addEventListener('click', () => startRun('practice'));

btnShare.addEventListener('click', async () => {
  if (submittedScore === null || !dailyResult) return;
  btnShare.disabled = true;
  btnShare.textContent = 'SHARING…';
  const result = await postShare({ score: submittedScore, rank: dailyResult.rank });
  if (result && result.status === 'ok') {
    showToast(result.commentUrl ? `Shared! ${result.commentUrl}` : 'Shared on Reddit!');
    btnShare.textContent = '✓ SHARED';
  } else {
    showToast(result?.message ?? 'Sharing needs Reddit — your score is still on the board.');
    btnShare.textContent = 'SHARE MY SCORE ON REDDIT';
    btnShare.disabled = false;
  }
});

function runShot(name: string): void {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint(): void {
    renderer.draw(world, scene.screen, { best: scene.best, muted: false, daily: name === 'title' ? {
      date: dailyState.date,
      attemptsLeft: dailyState.attemptsLeft,
      bestToday: dailyState.bestToday,
      streak: dailyState.streak,
      leaderboard: dailyState.leaderboard,
    } : undefined });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame(): void {
  let accumulator = 0;
  let last = performance.now();

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    input.update();

    // Touch play: auto-fire at the nearest enemy, auto-matching its colour.
    // Aim solves the intercept (see pilotInput) and holds fire while enough
    // bullets are already on their way — a full stream used to waste ~3
    // shots in flight past each dead target, which is why touch runs
    // measured ~12% accuracy.
    if (screen === SCREEN_PLAY && input.touchMode) {
      const target = world.nearestEnemy(world.player.x, world.player.y);
      if (target) {
        const rx = target.x - world.player.x;
        const ry = target.y - world.player.y;
        const vx = target.vx - world.player.vx * 0.4;
        const vy = target.vy - world.player.vy * 0.4;
        const s = PLAYER.bulletSpeed;
        const a = vx * vx + vy * vy - s * s;
        const b = 2 * (rx * vx + ry * vy);
        const c = rx * rx + ry * ry;
        let lead = Math.min(Math.hypot(rx, ry) / s, 0.9);
        const disc = b * b - 4 * a * c;
        if (disc >= 0 && a !== 0) {
          const root = (-b - Math.sqrt(disc)) / (2 * a);
          const root2 = (-b + Math.sqrt(disc)) / (2 * a);
          const best = [root, root2].filter((t) => t > 0).sort((p, q) => p - q)[0];
          if (best !== undefined) lead = Math.min(best, 0.9);
        }
        input.aimX = target.x + target.vx * lead;
        input.aimY = target.y + target.vy * lead;
        input.aimSeen = true;
        input.firing = world.bullets.length < (target.isBoss ? 4 : 2);
        input.autoColor = world.player.colorCd <= 0 && target.color !== world.player.color ? target.color : -1;
      } else {
        input.firing = false;
        input.autoColor = -1;
      }
    } else {
      input.autoColor = -1;
    }

    // Virtual joystick visuals — only while a touch is actually held AND on
    // a real touch device (coarse pointer). On desktop the joystick must
    // never appear: the old recorder ran desktop segments with touch
    // enabled, so a joystick circle sat stuck on screen through the video.
    const touchCapable = window.matchMedia('(pointer: coarse)').matches
      || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (input.touch && touchCapable) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / canvas.width;
      const scaleY = rect.height / canvas.height;
      joyBase.style.display = 'block';
      joyKnob.style.display = 'block';
      joyBase.style.left = `${rect.left + input.touch.ox * scaleX - 55}px`;
      joyBase.style.top = `${rect.top + input.touch.oy * scaleY - 55}px`;
      joyKnob.style.left = `${rect.left + input.touch.x * scaleX - 24}px`;
      joyKnob.style.top = `${rect.top + input.touch.y * scaleY - 24}px`;
    } else {
      joyBase.style.display = 'none';
      joyKnob.style.display = 'none';
    }

    if (input.pressed(ACTION_MUTE)) {
      audio.setMuted(!audio.muted);
    }

    if (screen === SCREEN_TITLE) {
      showModeButtons(true);
      // Click / Enter / Space starts a daily run — but only a FRESH press:
      // a fire button held through the previous run's end must not
      // immediately start (and spend) another attempt.
      if (input.pressed(ACTION_CONFIRM)) {
        startRun('daily');
      } else {
        // The title plays over a live demo: the ship flies itself, cannot die.
        accumulator += elapsed;
        while (accumulator >= STEP) {
          accumulator -= STEP;
          const target = world.nearestEnemy(world.player.x, world.player.y);
          world.step(STEP, pilotInput(world, 1, target), null);
        }
      }
    } else if (screen === SCREEN_PLAY) {
      if (input.pressed(ACTION_PAUSE)) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else {
        accumulator += elapsed;
        while (accumulator >= STEP) {
          accumulator -= STEP;
          // ?autoplay=1: the autopilot flies the run (demo recording) —
          // it aims with intercept lead, matches colours and dodges.
          const stepInput = autoplayParam
            ? pilotInput(world, 1, world.nearestEnemy(world.player.x, world.player.y))
            : input;
          const events = world.step(STEP, stepInput, audio);
          if (events & EVENT_HIT) announce(`Hit! ${world.state.lives} lives left.`);
          if (events & EVENT_WAVE_CLEAR) announce(`Wave ${world.state.wave} clear.`);
          if (events & EVENT_PICKUP) announce('Pickup!');
          if (events & EVENT_OVER) {
            void endGame('over');
            break;
          }
          if (mode === 'daily' && world.state.time >= durationSeconds) {
            void endGame('time');
            break;
          }
        }
      }
    } else if (screen === SCREEN_PAUSED) {
      if (input.pressed(ACTION_PAUSE)) {
        screen = SCREEN_PLAY;
        last = performance.now();
        announce('Playing.');
      } else if (input.pressed(ACTION_RESTART)) {
        startRun(mode ?? 'daily');
      }
    } else if (screen === SCREEN_OVER) {
      // A fresh press (click / Enter / Space / R) goes back to the title —
      // a held fire button must not skip the over screen instantly.
      if (input.pressed(ACTION_RESTART) || input.pressed(ACTION_CONFIRM)) {
        screen = SCREEN_TITLE;
        mode = null;
        world.reset();
        world.attract = true;
        showModeButtons(true);
        announce('Back to the daily board.');
      }
    }

    renderer.draw(world, screen, uiForDraw());
    input.endFrame();
  }

  // The title screen plays behind a live demo until the player starts.
  world.reset();
  world.attract = true;
  showModeButtons(true);
  requestAnimationFrame(frame);
}

// Probe handle for the headless tests (score, attempts, screen, daily state).
(window as unknown as { __daily: unknown }).__daily = {
  get screen() {
    return screen;
  },
  get mode() {
    return mode;
  },
  get score() {
    return world.state.score;
  },
  get wave() {
    return world.state.wave;
  },
  get kills() {
    return world.state.kills;
  },
  get lives() {
    return world.state.lives;
  },
  get enemies() {
    return world.enemies.length + world.spawnQueue.length;
  },
  get boss() {
    return world.boss !== null;
  },
  get accuracy() {
    return world.state.shotsFired > 0
      ? Math.round((world.state.shotsHit / world.state.shotsFired) * 100)
      : 0;
  },
  get time() {
    return world.state.time;
  },
  get daily() {
    return dailyState;
  },
};

void loadDaily().then((daily) => {
  dailyState = daily;
  world = createWorld(createRandom(dailyState.seed));
  world.reset();
  world.attract = true;
  refreshDailyButton();
  renderBoard(dailyState);
});

if (shot) runShot(shot);
else runGame();
