// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The five prism colours. A shot that matches its target's colour hits three times as hard. */
export const COLORS = [
  { key: 'crimson', name: 'Crimson', css: '#ff4d6d', glow: '#ff8fa3', dark: '#7a1030' },
  { key: 'azure', name: 'Azure', css: '#38bdf8', glow: '#a5e3ff', dark: '#0b3d5c' },
  { key: 'verdant', name: 'Verdant', css: '#4ade80', glow: '#b7f7cd', dark: '#0d4d24' },
  { key: 'magenta', name: 'Magenta', css: '#e879f9', glow: '#f5c2ff', dark: '#571a63' },
  { key: 'amber', name: 'Amber', css: '#fbbf24', glow: '#fde68a', dark: '#6b4305' },
];

export const PLAYER = {
  radius: 16,
  accel: 2600,
  maxSpeed: 380,
  drag: 4.2,
  fireInterval: 0.13,
  bulletSpeed: 780,
  bulletRadius: 5,
  lives: 3,
  maxLives: 5,
  invulnerable: 1.6,
  colorSwitchCooldown: 0.22,
  pickupRadius: 26,
};

export const BULLET = { radius: 5, life: 1.4 };

/** Enemy types: hp, speed, radius, score, colour index and behaviour. */
export const ENEMIES = {
  chaser: { hp: 3, speed: 95, radius: 18, score: 50, color: 0, cost: 1, behaviour: 'chase' },
  weaver: { hp: 2, speed: 125, radius: 15, score: 80, color: 1, cost: 2, behaviour: 'weave' },
  splitter: { hp: 6, speed: 58, radius: 26, score: 120, color: 2, cost: 3, behaviour: 'split' },
  sniper: { hp: 4, speed: 80, radius: 16, score: 150, color: 3, cost: 3, behaviour: 'snipe' },
  dasher: { hp: 3, speed: 105, radius: 15, score: 120, color: 4, cost: 2, behaviour: 'dash' },
  mini: { hp: 1, speed: 175, radius: 10, score: 25, color: 2, cost: 0, behaviour: 'chase' },
};

/** The boss that closes every fifth wave. */
export const BOSS = {
  hp: 240,
  hpPerWave: 22,
  radius: 62,
  speed: 52,
  score: 2000,
  burstInterval: 2.6,
  minionInterval: 5,
};

/** Wave budget in cost points, and how fast the queue drains. */
export const WAVE = {
  baseBudget: 6,
  budgetPerWave: 4,
  spawnInterval: 1.15,
  spawnIntervalMin: 0.35,
  clearBonus: 100,
  betweenWaves: 3.2,
};

export const PICKUPS = {
  shield: { weight: 3, label: 'AEGIS SHIELD', color: '#7dd3fc' },
  overdrive: { weight: 3, label: 'OVERDRIVE', color: '#fb923c' },
  bomb: { weight: 2, label: 'NOVA BOMB', color: '#f8fafc' },
  magnet: { weight: 2, label: 'MAGNET', color: '#c084fc' },
  heart: { weight: 1, label: '+1 HULL', color: '#f472b6' },
};

export const COMBO = {
  window: 4,
  perKill: 0.125,
  maxMultiplier: 4,
  matchDamage: 3,
  mismatchDamage: 1,
};

export const PALETTE = {
  backdrop: '#070812',
  nebulaA: '#131a3a',
  nebulaB: '#2a1040',
  grid: 'rgba(120, 140, 255, 0.05)',
  text: '#eef2ff',
  muted: '#93a0c4',
  panel: 'rgba(10, 14, 34, 0.82)',
  panelEdge: 'rgba(140, 160, 255, 0.35)',
  danger: '#ff5470',
  gold: '#ffd166',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'prism-swarm.best';

/** The daily game: one seed per day, short timed runs, a few attempts. */
export const DAILY = {
  /** Seconds per daily run: bite-sized, about two minutes. */
  durationSeconds: 120,
  /** Daily runs per player (server-enforced on Devvit). */
  attemptsPerDay: 3,
};

/** Local fallback storage keys for the standalone build (Devvit uses Redis). */
export const DAILY_STORE_KEY = 'prism-swarm-daily:v1';
