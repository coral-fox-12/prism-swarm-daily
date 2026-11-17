// The game state and its rules: the player, the enemies, the bullets, the waves, the
// combo and the pickups. Pure simulation on a fixed step; drawing lives in render.js.

import { BOSS, BULLET, COLORS, COMBO, ENEMIES, FIELD, PICKUPS, PLAYER, WAVE } from './config.js';
import { randomAngle, weightedPick } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_PICKUP = 8;
export const EVENT_BOSS = 16;
export const EVENT_KILL = 32;

const PICKUP_TABLE = Object.entries(PICKUPS).map(([kind, def]) => ({ kind, weight: def.weight }));
const TAU = Math.PI * 2;

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function makePlayer() {
  return {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    color: 0,
    fireCd: 0,
    colorCd: 0,
    shield: false,
    overdriveTime: 0,
    magnetTime: 0,
    invuln: 0,
    thrust: 0,
  };
}

export function createWorld(random) {
  const world = {
    random,
    state: null,
    player: makePlayer(),
    bullets: [],
    enemyBullets: [],
    enemies: [],
    particles: [],
    pickups: [],
    floaters: [],
    boss: null,
    spawnQueue: [],
    spawnTimer: 0,
    waveTimer: 0,
    waveState: 'announce',
    shake: 0,
    flash: 0,
    attract: false,
  };

  function freshState() {
    return {
      time: 0,
      wave: 0,
      score: 0,
      combo: 0,
      comboTimer: 0,
      multiplier: 1,
      lives: PLAYER.lives,
      kills: 0,
      shotsFired: 0,
      shotsHit: 0,
      bestCombo: 0,
    };
  }

  world.state = freshState();

  /** A brand-new run: empty field, full hull, wave one announcing. */
  world.reset = function reset() {
    world.state = freshState();
    world.player = makePlayer();
    world.bullets = [];
    world.enemyBullets = [];
    world.enemies = [];
    world.particles = [];
    world.pickups = [];
    world.floaters = [];
    world.boss = null;
    world.spawnQueue = [];
    world.spawnTimer = 0;
    world.waveTimer = 1.6;
    world.waveState = 'announce';
    world.shake = 0;
    world.flash = 0;
    world.attract = false;
    world.nextWave();
  };

  /** Build the spawn queue of `wave` from its budget of cost points. */
  function buildQueue(wave) {
    const queue = [];
    if (wave % 5 === 0) {
      queue.push('boss');
      for (let i = 0; i < 4; i += 1) queue.push('chaser');
      return queue;
    }
    let budget = WAVE.baseBudget + wave * WAVE.budgetPerWave;
    const pool = ['chaser'];
    if (wave >= 2) pool.push('weaver');
    if (wave >= 3) pool.push('dasher', 'splitter');
    if (wave >= 4) pool.push('sniper');
    while (budget > 0) {
      const type = pool[Math.floor(random() * pool.length)];
      const cost = ENEMIES[type].cost;
      if (cost > budget && queue.length > 0) break;
      queue.push(type);
      budget -= cost;
    }
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    return queue;
  }

  world.nextWave = function nextWave() {
    world.state.wave += 1;
    world.spawnQueue = buildQueue(world.state.wave);
    world.spawnTimer = 0.2;
    world.waveTimer = WAVE.betweenWaves;
    world.waveState = 'announce';
  };

  function edgePoint(minPlayerDistance) {
    for (let tries = 0; tries < 12; tries += 1) {
      const side = Math.floor(random() * 4);
      let x = 0;
      let y = 0;
      if (side === 0) { x = random() * FIELD.width; y = -30; }
      if (side === 1) { x = FIELD.width + 30; y = random() * FIELD.height; }
      if (side === 2) { x = random() * FIELD.width; y = FIELD.height + 30; }
      if (side === 3) { x = -30; y = random() * FIELD.height; }
      if (distance(x, y, world.player.x, world.player.y) >= minPlayerDistance) return { x, y };
    }
    return { x: -30, y: random() * FIELD.height };
  }

  function makeEnemy(type, x, y) {
    const def = ENEMIES[type];
    const speedScale = Math.min(1.6, 1 + world.state.wave * 0.03);
    const hpBonus = type === 'mini' ? 0 : Math.floor(world.state.wave / 6);
    return {
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      angle: 0,
      hp: def.hp + hpBonus,
      maxHp: def.hp + hpBonus,
      radius: def.radius,
      speed: def.speed * speedScale,
      score: def.score,
      color: def.color,
      behaviour: def.behaviour,
      t: random() * 10,
      state: 'stalk',
      stateT: 0,
      shootCd: 1 + random() * 1.5,
      dashX: 0,
      dashY: 0,
      flash: 0,
      isBoss: false,
    };
  }

  world.spawnEnemy = function spawnEnemy(type, x, y) {
    if (type === 'boss') {
      const point = { x: FIELD.width / 2, y: -90 };
      const boss = makeEnemy('chaser', point.x, point.y);
      boss.isBoss = true;
      boss.type = 'boss';
      boss.hp = BOSS.hp + world.state.wave * BOSS.hpPerWave;
      boss.maxHp = boss.hp;
      boss.radius = BOSS.radius;
      boss.speed = BOSS.speed;
      boss.score = BOSS.score;
      boss.color = 0;
      boss.burstCd = BOSS.burstInterval;
      boss.minionCd = BOSS.minionInterval;
      boss.colorT = 0;
      world.boss = boss;
      world.enemies.push(boss);
      return boss;
    }
    const enemy = makeEnemy(type, x, y);
    // Enter at speed, already heading for the player: a fresh spawn used to
    // drift in from the edge at a crawl, leaving the field empty for seconds.
    const dx = world.player.x - x;
    const dy = world.player.y - y;
    const dist = Math.hypot(dx, dy) || 1;
    enemy.vx = (dx / dist) * enemy.speed;
    enemy.vy = (dy / dist) * enemy.speed;
    world.enemies.push(enemy);
    return enemy;
  };

  world.explode = function explode(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const angle = randomAngle(random);
      const velocity = (0.3 + random() * 0.7) * (speed || 260);
      world.particles.push({
        x, y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 0.35 + random() * 0.5,
        maxLife: 0.85,
        size: 2 + random() * 3.5,
        color,
      });
    }
  };

  function addFloater(x, y, text, color) {
    world.floaters.push({ x, y, text, color, life: 1 });
  }

  function addScore(amount, x, y) {
    const gained = Math.round(amount * world.state.multiplier);
    world.state.score += gained;
    if (x !== undefined) addFloater(x, y, `+${gained}`, '#ffffff');
    return gained;
  }

  function dropPickup(x, y, forceKind) {
    const kind = forceKind || weightedPick(random, PICKUP_TABLE).kind;
    const angle = randomAngle(random);
    world.pickups.push({
      kind,
      x, y,
      vx: Math.cos(angle) * 40,
      vy: Math.sin(angle) * 40,
      t: 0,
    });
  }

  function killEnemy(enemy, index, audio, match) {
    world.state.kills += 1;
    addScore(enemy.score, enemy.x, enemy.y);
    world.explode(enemy.x, enemy.y, COLORS[enemy.color].css, enemy.isBoss ? 60 : 18, enemy.isBoss ? 420 : 260);
    if (audio) audio.explode(enemy.isBoss);
    if (enemy.isBoss) {
      world.boss = null;
      world.shake = Math.max(world.shake, 14);
      world.flash = 0.5;
      dropPickup(enemy.x - 40, enemy.y, 'heart');
      dropPickup(enemy.x + 40, enemy.y, 'bomb');
    } else if (enemy.type === 'splitter') {
      for (let i = 0; i < 3; i += 1) {
        const mini = world.spawnEnemy('mini', enemy.x + (random() - 0.5) * 30, enemy.y + (random() - 0.5) * 30);
        const angle = randomAngle(random);
        mini.vx = Math.cos(angle) * 160;
        mini.vy = Math.sin(angle) * 160;
      }
    } else if (random() < 0.12) {
      dropPickup(enemy.x, enemy.y);
    }
    world.enemies.splice(index, 1);
    if (match) {
      world.state.combo += 1;
      world.state.comboTimer = COMBO.window;
      world.state.bestCombo = Math.max(world.state.bestCombo, world.state.combo);
      world.state.multiplier = Math.min(COMBO.maxMultiplier, 1 + world.state.combo * COMBO.perKill);
    }
    return EVENT_KILL;
  }

  function damagePlayer(audio) {
    const player = world.player;
    if (world.attract) return 0;
    if (player.invuln > 0) return 0;
    if (player.shield) {
      player.shield = false;
      player.invuln = 0.9;
      world.explode(player.x, player.y, '#7dd3fc', 22, 300);
      if (audio) audio.hit();
      return EVENT_HIT;
    }
    world.state.lives -= 1;
    world.state.combo = 0;
    world.state.comboTimer = 0;
    world.state.multiplier = 1;
    player.invuln = PLAYER.invulnerable;
    world.shake = Math.max(world.shake, 12);
    world.flash = 0.35;
    world.explode(player.x, player.y, '#ff5470', 30, 320);
    if (audio) audio.hurt();
    if (world.state.lives <= 0) return EVENT_HIT | EVENT_OVER;
    return EVENT_HIT;
  }

  function applyPickup(kind, audio) {
    const player = world.player;
    if (kind === 'shield') player.shield = true;
    if (kind === 'overdrive') player.overdriveTime = 6;
    if (kind === 'magnet') player.magnetTime = 8;
    if (kind === 'heart') world.state.lives = Math.min(PLAYER.maxLives, world.state.lives + 1);
    if (kind === 'bomb') {
      world.flash = 0.6;
      world.shake = Math.max(world.shake, 10);
      world.enemyBullets = [];
      for (let i = world.enemies.length - 1; i >= 0; i -= 1) {
        const enemy = world.enemies[i];
        enemy.hp -= 8;
        enemy.flash = 0.15;
        if (enemy.hp <= 0) killEnemy(enemy, i, null, false);
      }
    }
    addFloater(player.x, player.y - 30, PICKUPS[kind].label, PICKUPS[kind].color);
    if (audio) audio.pickup();
    return EVENT_PICKUP;
  }

  function stepPlayer(dt, input, audio) {
    const player = world.player;
    const length = Math.hypot(input.moveX, input.moveY) || 1;
    player.vx += (input.moveX / length) * PLAYER.accel * dt * (input.moveX || input.moveY ? 1 : 0);
    player.vy += (input.moveY / length) * PLAYER.accel * dt * (input.moveX || input.moveY ? 1 : 0);
    const drag = Math.max(0, 1 - PLAYER.drag * dt);
    player.vx *= drag;
    player.vy *= drag;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > PLAYER.maxSpeed) {
      player.vx = (player.vx / speed) * PLAYER.maxSpeed;
      player.vy = (player.vy / speed) * PLAYER.maxSpeed;
    }
    player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
    player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));
    player.thrust = speed / PLAYER.maxSpeed;

    if (input.aimSeen) {
      player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    } else {
      const target = world.enemies[0];
      if (target) player.angle = Math.atan2(target.y - player.y, target.x - player.x);
    }

    player.fireCd -= dt;
    player.colorCd -= dt;
    player.invuln = Math.max(0, player.invuln - dt);
    player.overdriveTime = Math.max(0, player.overdriveTime - dt);
    player.magnetTime = Math.max(0, player.magnetTime - dt);

    const direct = input.pressedColor();
    if (direct >= 0 && direct !== player.color && player.colorCd <= 0) {
      player.color = direct;
      player.colorCd = PLAYER.colorSwitchCooldown;
    }
    if (input.pressed('colorNext') && player.colorCd <= 0) {
      player.color = (player.color + 1) % COLORS.length;
      player.colorCd = PLAYER.colorSwitchCooldown;
    }
    if (input.pressed('colorPrev') && player.colorCd <= 0) {
      player.color = (player.color + COLORS.length - 1) % COLORS.length;
      player.colorCd = PLAYER.colorSwitchCooldown;
    }
    if (input.wheelDelta !== 0 && player.colorCd <= 0) {
      const steps = input.wheelDelta > 0 ? 1 : -1;
      player.color = (player.color + steps + COLORS.length) % COLORS.length;
      player.colorCd = PLAYER.colorSwitchCooldown;
    }

    if (input.firing && player.fireCd <= 0) {
      const interval = player.overdriveTime > 0 ? PLAYER.fireInterval / 2.2 : PLAYER.fireInterval;
      player.fireCd = interval;
      const nose = PLAYER.radius + 8;
      world.bullets.push({
        x: player.x + Math.cos(player.angle) * nose,
        y: player.y + Math.sin(player.angle) * nose,
        vx: Math.cos(player.angle) * PLAYER.bulletSpeed + player.vx * 0.4,
        vy: Math.sin(player.angle) * PLAYER.bulletSpeed + player.vy * 0.4,
        color: player.color,
        life: BULLET.life,
        radius: BULLET.radius,
      });
      world.state.shotsFired += 1;
      if (audio) audio.shoot(player.color);
    }
  }

  function stepEnemy(enemy, dt, audio) {
    const player = world.player;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    enemy.t += dt;
    enemy.flash = Math.max(0, enemy.flash - dt);

    if (enemy.isBoss) {
      const orbit = Math.atan2(dy, dx) + Math.PI / 2;
      const targetX = player.x + Math.cos(orbit) * 260;
      const targetY = player.y + Math.sin(orbit) * 260;
      enemy.vx += ((targetX - enemy.x) * 0.6 - enemy.vx) * Math.min(1, dt * 1.5);
      enemy.vy += ((targetY - enemy.y) * 0.6 - enemy.vy) * Math.min(1, dt * 1.5);
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.angle += dt * 0.8;
      enemy.colorT += dt;
      if (enemy.colorT > 4) {
        enemy.colorT = 0;
        enemy.color = (enemy.color + 1) % COLORS.length;
      }
      enemy.burstCd -= dt;
      if (enemy.burstCd <= 0) {
        enemy.burstCd = BOSS.burstInterval;
        for (let i = 0; i < 12; i += 1) {
          const angle = (i / 12) * TAU + enemy.angle;
          world.enemyBullets.push({
            x: enemy.x + Math.cos(angle) * enemy.radius,
            y: enemy.y + Math.sin(angle) * enemy.radius,
            vx: Math.cos(angle) * 210,
            vy: Math.sin(angle) * 210,
            radius: 8,
          });
        }
        if (audio) audio.waveHorn();
      }
      enemy.minionCd -= dt;
      if (enemy.minionCd <= 0) {
        enemy.minionCd = BOSS.minionInterval;
        const point = edgePoint(200);
        world.spawnEnemy(random() < 0.5 ? 'chaser' : 'weaver', point.x, point.y);
      }
      return;
    }

    if (enemy.behaviour === 'chase') {
      enemy.vx += (dx / dist) * enemy.speed * 2.4 * dt;
      enemy.vy += (dy / dist) * enemy.speed * 2.4 * dt;
      const speed = Math.hypot(enemy.vx, enemy.vy);
      if (speed > enemy.speed) {
        enemy.vx = (enemy.vx / speed) * enemy.speed;
        enemy.vy = (enemy.vy / speed) * enemy.speed;
      }
      enemy.angle = Math.atan2(enemy.vy, enemy.vx);
    } else if (enemy.behaviour === 'weave') {
      const perpendicular = Math.atan2(dy, dx) + Math.PI / 2;
      const sway = Math.sin(enemy.t * 3.2) * 0.9;
      const heading = Math.atan2(dy, dx) + sway;
      enemy.vx = Math.cos(heading) * enemy.speed;
      enemy.vy = Math.sin(heading) * enemy.speed;
      enemy.angle = heading;
      void perpendicular;
    } else if (enemy.behaviour === 'split') {
      enemy.vx = (dx / dist) * enemy.speed;
      enemy.vy = (dy / dist) * enemy.speed;
      enemy.angle += dt * 1.5;
    } else if (enemy.behaviour === 'snipe') {
      let heading;
      if (dist > 340) heading = Math.atan2(dy, dx);
      else if (dist < 250) heading = Math.atan2(-dy, -dx);
      else heading = Math.atan2(dy, dx) + Math.PI / 2;
      enemy.vx = Math.cos(heading) * enemy.speed;
      enemy.vy = Math.sin(heading) * enemy.speed;
      enemy.angle = Math.atan2(dy, dx);
      enemy.shootCd -= dt;
      if (enemy.shootCd <= 0 && dist < 560) {
        enemy.shootCd = 2.2;
        world.enemyBullets.push({
          x: enemy.x,
          y: enemy.y,
          vx: (dx / dist) * 250,
          vy: (dy / dist) * 250,
          radius: 7,
        });
        if (audio) audio.hit();
      }
    } else if (enemy.behaviour === 'dash') {
      enemy.stateT -= dt;
      if (enemy.state === 'stalk') {
        enemy.vx = (dx / dist) * enemy.speed;
        enemy.vy = (dy / dist) * enemy.speed;
        if (dist < 300 && enemy.stateT <= 0) {
          enemy.state = 'telegraph';
          enemy.stateT = 0.55;
        }
      } else if (enemy.state === 'telegraph') {
        enemy.vx *= 0.8;
        enemy.vy *= 0.8;
        enemy.angle = Math.atan2(dy, dx);
        if (enemy.stateT <= 0) {
          enemy.state = 'dash';
          enemy.stateT = 0.45;
          enemy.dashX = dx / dist;
          enemy.dashY = dy / dist;
          enemy.vx = enemy.dashX * 520;
          enemy.vy = enemy.dashY * 520;
        }
      } else if (enemy.state === 'dash') {
        if (enemy.stateT <= 0) {
          enemy.state = 'recover';
          enemy.stateT = 0.8;
        }
      } else {
        enemy.vx *= 0.85;
        enemy.vy *= 0.85;
        if (enemy.stateT <= 0) {
          enemy.state = 'stalk';
          enemy.stateT = 1 + random() * 0.8;
        }
      }
    }
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
  }

  function stepBullets(dt) {
    for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = world.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        world.bullets.splice(i, 1);
      }
    }
    for (let i = world.enemyBullets.length - 1; i >= 0; i -= 1) {
      const bullet = world.enemyBullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        world.enemyBullets.splice(i, 1);
      }
    }
  }

  function stepCollisions(dt, audio) {
    let events = 0;
    for (let i = world.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = world.bullets[i];
      let consumed = false;
      for (let j = world.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = world.enemies[j];
        const radius = enemy.radius + bullet.radius;
        if (Math.abs(enemy.x - bullet.x) > radius || Math.abs(enemy.y - bullet.y) > radius) continue;
        if (distance(enemy.x, enemy.y, bullet.x, bullet.y) > radius) continue;
        const match = bullet.color === enemy.color;
        enemy.hp -= match ? COMBO.matchDamage : COMBO.mismatchDamage;
        enemy.flash = 0.12;
        world.state.shotsHit += 1;
        world.explode(bullet.x, bullet.y, COLORS[bullet.color].css, 4, 140);
        if (audio) audio.hit();
        if (match) {
          world.state.combo += 1;
          world.state.comboTimer = COMBO.window;
          world.state.bestCombo = Math.max(world.state.bestCombo, world.state.combo);
          world.state.multiplier = Math.min(COMBO.maxMultiplier, 1 + world.state.combo * COMBO.perKill);
        }
        if (enemy.hp <= 0) events |= killEnemy(enemy, j, audio, match);
        world.bullets.splice(i, 1);
        consumed = true;
        break;
      }
      void consumed;
      void dt;
    }

    const player = world.player;
    for (let j = world.enemies.length - 1; j >= 0; j -= 1) {
      const enemy = world.enemies[j];
      const radius = enemy.radius + PLAYER.radius - 4;
      if (Math.abs(enemy.x - player.x) <= radius && Math.abs(enemy.y - player.y) <= radius
        && distance(enemy.x, enemy.y, player.x, player.y) <= radius) {
        events |= damagePlayer(audio);
        if (!enemy.isBoss) {
          enemy.hp -= 2;
          enemy.flash = 0.12;
          if (enemy.hp <= 0) events |= killEnemy(enemy, j, audio, false);
        }
        if (events & EVENT_OVER) return events;
      }
    }
    for (let i = world.enemyBullets.length - 1; i >= 0; i -= 1) {
      const bullet = world.enemyBullets[i];
      const radius = bullet.radius + PLAYER.radius - 4;
      if (Math.abs(bullet.x - player.x) <= radius && Math.abs(bullet.y - player.y) <= radius
        && distance(bullet.x, bullet.y, player.x, player.y) <= radius) {
        world.enemyBullets.splice(i, 1);
        events |= damagePlayer(audio);
        if (events & EVENT_OVER) return events;
      }
    }
    return events;
  }

  function stepPickups(dt, audio) {
    let events = 0;
    const player = world.player;
    for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = world.pickups[i];
      pickup.t += dt;
      if (player.magnetTime > 0) {
        const dx = player.x - pickup.x;
        const dy = player.y - pickup.y;
        const dist = Math.hypot(dx, dy) || 1;
        pickup.vx += (dx / dist) * 900 * dt;
        pickup.vy += (dy / dist) * 900 * dt;
      }
      pickup.vx *= Math.max(0, 1 - 2 * dt);
      pickup.vy *= Math.max(0, 1 - 2 * dt);
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;
      pickup.x = Math.min(FIELD.width - 14, Math.max(14, pickup.x));
      pickup.y = Math.min(FIELD.height - 14, Math.max(14, pickup.y));
      const radius = PLAYER.pickupRadius + 12;
      if (Math.abs(pickup.x - player.x) <= radius && Math.abs(pickup.y - player.y) <= radius
        && distance(pickup.x, pickup.y, player.x, player.y) <= radius) {
        world.pickups.splice(i, 1);
        events |= applyPickup(pickup.kind, audio);
      }
    }
    return events;
  }

  function stepParticles(dt) {
    for (let i = world.particles.length - 1; i >= 0; i -= 1) {
      const particle = world.particles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.max(0, 1 - 3 * dt);
      particle.vy *= Math.max(0, 1 - 3 * dt);
      particle.life -= dt;
      if (particle.life <= 0) world.particles.splice(i, 1);
    }
    for (let i = world.floaters.length - 1; i >= 0; i -= 1) {
      const floater = world.floaters[i];
      floater.y -= 42 * dt;
      floater.life -= dt * 0.9;
      if (floater.life <= 0) world.floaters.splice(i, 1);
    }
    world.shake = Math.max(0, world.shake - dt * 34);
    world.flash = Math.max(0, world.flash - dt * 2.2);
  }

  function stepWaves(dt, audio) {
    let events = 0;
    if (world.waveState === 'announce') {
      world.waveTimer -= dt;
      if (world.waveTimer <= 0) {
        world.waveState = 'fight';
        if (audio) audio.waveHorn();
      }
      return events;
    }
    if (world.waveState === 'fight') {
      if (world.spawnQueue.length > 0) {
        world.spawnTimer -= dt;
        if (world.spawnTimer <= 0) {
          const interval = Math.max(WAVE.spawnIntervalMin, WAVE.spawnInterval - world.state.wave * 0.05);
          world.spawnTimer = interval;
          const type = world.spawnQueue.shift();
          if (type === 'boss') {
            world.spawnEnemy('boss');
            events |= EVENT_BOSS;
          } else {
            const point = edgePoint(240);
            world.spawnEnemy(type, point.x, point.y);
          }
        }
      } else if (world.enemies.length === 0) {
        const bonus = WAVE.clearBonus * world.state.wave;
        addScore(bonus, FIELD.width / 2, FIELD.height / 2 - 60);
        addFloater(FIELD.width / 2, FIELD.height / 2 - 90, `WAVE ${world.state.wave} CLEAR  +${bonus}`, '#ffb000');
        world.waveState = 'clear';
        world.waveTimer = 1.6;
        events |= EVENT_WAVE_CLEAR;
      }
      return events;
    }
    world.waveTimer -= dt;
    if (world.waveTimer <= 0) world.nextWave();
    return events;
  }

  /** Advance the simulation one fixed step. Returns a bitmask of EVENT_* flags. */
  world.step = function step(dt, input, audio) {
    let events = 0;
    world.state.time += dt;
    world.state.comboTimer -= dt;
    if (world.state.comboTimer <= 0 && world.state.combo > 0) {
      world.state.combo = 0;
      world.state.multiplier = 1;
    }
    stepPlayer(dt, input, audio);
    events |= stepWaves(dt, audio);
    for (let i = world.enemies.length - 1; i >= 0; i -= 1) stepEnemy(world.enemies[i], dt, audio);
    stepBullets(dt);
    events |= stepCollisions(dt, audio);
    events |= stepPickups(dt, audio);
    stepParticles(dt);
    return events;
  };

  /** The nearest enemy to a point, or null when the field is empty. */
  world.nearestEnemy = function nearestEnemy(x, y) {
    let best = null;
    let bestDistance = Infinity;
    for (const enemy of world.enemies) {
      const dist = distance(x, y, enemy.x, enemy.y);
      if (dist < bestDistance) {
        bestDistance = dist;
        best = enemy;
      }
    }
    return best;
  };

  return world;
}
