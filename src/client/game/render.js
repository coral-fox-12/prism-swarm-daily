// Everything the player sees: the starfield, the glowing sprites, the HUD and the menus.
// Sprites are pre-rendered once to offscreen canvases (glow included), so each frame is
// cheap drawImage calls; nothing is drawn with a live shadowBlur per frame.

import { BOSS, COLORS, FIELD, PALETTE, PICKUPS, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function glowSprite(size, drawShape) {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  ctx.translate(size / 2, size / 2);
  drawShape(ctx, size);
  return canvas;
}

function heartPath(ctx, x, y, size) {
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.9);
  ctx.bezierCurveTo(x - size * 1.2, y + size * 0.1, x - size * 0.7, y - size * 0.9, x, y - size * 0.25);
  ctx.bezierCurveTo(x + size * 0.7, y - size * 0.9, x + size * 1.2, y + size * 0.1, x, y + size * 0.9);
  ctx.closePath();
}

export function createRenderer(canvas) {
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;
  const ctx = canvas.getContext('2d');

  // The starfield never moves with the game; it is drawn once and reused.
  const background = makeCanvas(Math.max(FIELD.width, FIELD.height));
  background.width = FIELD.width;
  background.height = FIELD.height;
  const bg = background.getContext('2d');
  const gradient = bg.createLinearGradient(0, 0, FIELD.width, FIELD.height);
  gradient.addColorStop(0, '#0a0d24');
  gradient.addColorStop(0.5, '#0a0618');
  gradient.addColorStop(1, '#160a2e');
  bg.fillStyle = gradient;
  bg.fillRect(0, 0, FIELD.width, FIELD.height);
  let seed = 1337;
  function bgRandom() {
    seed = (seed * 1664525 + 1013904223) | 0;
    return ((seed >>> 0) / 4294967296);
  }
  for (const [x, y, radius, color] of [
    [240, 160, 260, 'rgba(56, 120, 255, 0.10)'],
    [1020, 120, 220, 'rgba(168, 85, 247, 0.10)'],
    [880, 560, 280, 'rgba(255, 77, 109, 0.07)'],
    [180, 580, 200, 'rgba(74, 222, 128, 0.06)'],
  ]) {
    const nebula = bg.createRadialGradient(x, y, 0, x, y, radius);
    nebula.addColorStop(0, color);
    nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
    bg.fillStyle = nebula;
    bg.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  for (let i = 0; i < 170; i += 1) {
    const x = bgRandom() * FIELD.width;
    const y = bgRandom() * FIELD.height;
    const radius = 0.5 + bgRandom() * 1.6;
    bg.fillStyle = `rgba(255, 255, 255, ${0.25 + bgRandom() * 0.6})`;
    bg.beginPath();
    bg.arc(x, y, radius, 0, TAU);
    bg.fill();
  }

  // One sprite per ship colour, and one per enemy type and colour.
  const playerSprites = COLORS.map((color) => glowSprite(96, (c) => {
    c.shadowColor = color.css;
    c.shadowBlur = 18;
    c.fillStyle = color.css;
    c.beginPath();
    c.moveTo(26, 0);
    c.lineTo(-18, -18);
    c.lineTo(-10, 0);
    c.lineTo(-18, 18);
    c.closePath();
    c.fill();
    c.shadowBlur = 0;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(6, 0, 5, 0, TAU);
    c.fill();
    c.strokeStyle = color.glow;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(26, 0);
    c.lineTo(-18, -18);
    c.lineTo(-10, 0);
    c.lineTo(-18, 18);
    c.closePath();
    c.stroke();
  }));

  function enemySprite(color, shape) {
    return glowSprite(128, (c) => {
      c.shadowColor = color.css;
      c.shadowBlur = 16;
      c.fillStyle = color.css;
      c.strokeStyle = color.glow;
      c.lineWidth = 3;
      shape(c);
      c.fill();
      c.shadowBlur = 0;
      c.stroke();
      c.fillStyle = 'rgba(255, 255, 255, 0.85)';
      c.beginPath();
      c.arc(0, 0, 5, 0, TAU);
      c.fill();
    });
  }

  const enemySprites = {
    chaser: COLORS.map((color) => enemySprite(color, (c) => {
      c.beginPath();
      c.moveTo(26, 0);
      c.lineTo(-20, -20);
      c.lineTo(-12, 0);
      c.lineTo(-20, 20);
      c.closePath();
    })),
    weaver: COLORS.map((color) => enemySprite(color, (c) => {
      c.beginPath();
      c.moveTo(24, 0);
      c.lineTo(0, -24);
      c.lineTo(-24, 0);
      c.lineTo(0, 24);
      c.closePath();
    })),
    splitter: COLORS.map((color) => enemySprite(color, (c) => {
      c.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * TAU;
        const x = Math.cos(angle) * 26;
        const y = Math.sin(angle) * 26;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
    })),
    sniper: COLORS.map((color) => enemySprite(color, (c) => {
      c.beginPath();
      c.moveTo(0, -26);
      c.lineTo(26, 0);
      c.lineTo(0, 26);
      c.lineTo(-26, 0);
      c.closePath();
      c.moveTo(26, 0);
      c.lineTo(38, 0);
    })),
    dasher: COLORS.map((color) => enemySprite(color, (c) => {
      c.beginPath();
      c.moveTo(30, 0);
      c.lineTo(-6, -22);
      c.lineTo(-16, -8);
      c.lineTo(-16, 8);
      c.lineTo(-6, 22);
      c.closePath();
    })),
    mini: COLORS.map((color) => enemySprite(color, (c) => {
      c.beginPath();
      c.moveTo(16, 0);
      c.lineTo(-12, -12);
      c.lineTo(-12, 12);
      c.closePath();
    })),
  };

  const bossSprite = glowSprite(192, (c) => {
    c.shadowColor = '#e879f9';
    c.shadowBlur = 26;
    c.fillStyle = '#2a1040';
    c.strokeStyle = '#e879f9';
    c.lineWidth = 4;
    c.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * TAU;
      const x = Math.cos(angle) * 62;
      const y = Math.sin(angle) * 62;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
    c.stroke();
    c.shadowBlur = 0;
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * TAU;
      c.fillStyle = COLORS[i % COLORS.length].css;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, 34, angle - 0.42, angle + 0.42);
      c.closePath();
      c.fill();
    }
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(0, 0, 10, 0, TAU);
    c.fill();
  });

  function drawText(text, x, y, size, color, align = 'left', weight = 600) {
    ctx.font = `${weight} ${size}px ${'system-ui, -apple-system, "Segoe UI", sans-serif'}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawPanel(x, y, width, height) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 14);
    ctx.fill();
    ctx.stroke();
  }

  function drawHud(world, ui) {
    const state = world.state;
    drawText(`SCORE ${state.score.toLocaleString('en-US')}`, 28, 46, 30, PALETTE.text, 'left', 800);
    drawText(`BEST ${Math.max(ui.best, state.score).toLocaleString('en-US')}`, 28, 74, 15, PALETTE.muted);
    drawText(`WAVE ${state.wave}`, FIELD.width / 2, 46, 28, PALETTE.text, 'center', 800);
    const hostiles = world.enemies.length + world.spawnQueue.length;
    drawText(hostiles > 0 ? `${hostiles} HOSTILE${hostiles === 1 ? '' : 'S'}` : 'CLEAR!', FIELD.width / 2, 72, 14, PALETTE.muted, 'center');

    for (let i = 0; i < PLAYER.maxLives; i += 1) {
      const x = FIELD.width - 40 - i * 34;
      const y = 36;
      ctx.save();
      ctx.translate(x, y);
      heartPath(ctx, 0, 0, 11);
      ctx.fillStyle = i < state.lives ? '#ff5470' : 'rgba(255, 255, 255, 0.14)';
      ctx.fill();
      ctx.restore();
    }

    const chipY = 66;
    COLORS.forEach((color, index) => {
      const x = FIELD.width - 40 - (COLORS.length - 1 - index) * 30;
      const active = index === world.player.color;
      ctx.beginPath();
      ctx.arc(x, chipY, active ? 9 : 6, 0, TAU);
      ctx.fillStyle = color.css;
      ctx.fill();
      if (active) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
    drawText(COLORS[world.player.color].name.toUpperCase(), FIELD.width - 28, 96, 12, COLORS[world.player.color].glow, 'right', 700);

    if (state.combo > 1) {
      const width = 220;
      const x = (FIELD.width - width) / 2;
      const y = FIELD.height - 34;
      drawText(`COMBO x${state.multiplier.toFixed(2)}`, FIELD.width / 2, y - 8, 16, '#ffd166', 'center', 800);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(x, y, width, 6);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(x, y, width * Math.max(0, state.comboTimer / 4), 6);
    }

    // Daily run clock: a shrinking bar plus the seconds left, gold when it runs low.
    if (ui.timeLeft !== undefined) {
      const total = ui.timeTotal || 120;
      const left = Math.max(0, ui.timeLeft);
      const minutes = Math.floor(left / 60);
      const seconds = Math.floor(left % 60);
      const barWidth = 220;
      const barX = (FIELD.width - barWidth) / 2;
      const barY = 92;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(barX, barY, barWidth, 6);
      ctx.fillStyle = left <= 30 ? '#ff5470' : '#ffd166';
      ctx.fillRect(barX, barY, barWidth * Math.max(0, left / total), 6);
      drawText(`⏱ ${minutes}:${String(seconds).padStart(2, '0')}`, FIELD.width / 2, barY + 24, 15, left <= 30 ? '#ff5470' : PALETTE.muted, 'center', 800);
    }

    let statusY = FIELD.height - 30;
    if (world.player.overdriveTime > 0) {
      drawText(`OVERDRIVE ${Math.ceil(world.player.overdriveTime)}s`, 28, statusY, 14, '#fb923c', 'left', 700);
      statusY -= 22;
    }
    if (world.player.magnetTime > 0) {
      drawText(`MAGNET ${Math.ceil(world.player.magnetTime)}s`, 28, statusY, 14, '#c084fc', 'left', 700);
      statusY -= 22;
    }
    if (world.player.shield) drawText('AEGIS SHIELD UP', 28, statusY, 14, '#7dd3fc', 'left', 700);

    if (world.boss) {
      const width = 420;
      const x = (FIELD.width - width) / 2;
      const y = 108;
      drawText('PRISM KEEPER', FIELD.width / 2, y - 8, 14, '#e879f9', 'center', 800);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(x, y, width, 10);
      ctx.fillStyle = COLORS[world.boss.color].css;
      ctx.fillRect(x, y, width * Math.max(0, world.boss.hp / world.boss.maxHp), 10);
    }
  }

  function drawBanner(world) {
    if (world.waveState === 'announce') {
      const alpha = Math.min(1, world.waveTimer);
      ctx.save();
      ctx.globalAlpha = alpha;
      drawText(`WAVE ${world.state.wave}`, FIELD.width / 2, FIELD.height / 2 - 40, 64, PALETTE.text, 'center', 900);
      drawText(world.state.wave % 5 === 0 ? 'SOMETHING HUGE APPROACHES' : 'GET READY', FIELD.width / 2, FIELD.height / 2 + 4, 18, PALETTE.muted, 'center');
      ctx.restore();
    } else if (world.waveState === 'clear') {
      ctx.save();
      ctx.globalAlpha = Math.min(1, world.waveTimer);
      drawText('WAVE CLEAR', FIELD.width / 2, FIELD.height / 2 - 40, 56, PALETTE.gold, 'center', 900);
      ctx.restore();
    }
  }

  function drawTitle(world, ui) {
    ctx.fillStyle = 'rgba(4, 6, 18, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const title = 'PRISM SWARM';
    const letters = ['#ff4d6d', '#38bdf8', '#4ade80', '#e879f9', '#fbbf24'];
    ctx.font = `900 92px ${'system-ui, -apple-system, "Segoe UI", sans-serif'}`;
    ctx.textAlign = 'center';
    let totalWidth = 0;
    const widths = [...title].map((letter) => {
      const width = ctx.measureText(letter).width;
      totalWidth += width;
      return width;
    });
    let x = FIELD.width / 2 - totalWidth / 2;
    [...title].forEach((letter, index) => {
      ctx.fillStyle = letter === ' ' ? PALETTE.text : letters[index % letters.length];
      ctx.textAlign = 'left';
      ctx.fillText(letter, x, 218);
      x += widths[index];
    });
    drawText('MATCH THE COLOUR. BREAK THE SWARM.', FIELD.width / 2, 258, 20, PALETTE.muted, 'center', 600);
    drawText('A chromatic arena survival — one ship, five colours, endless swarm.', FIELD.width / 2, 288, 15, PALETTE.muted, 'center');

    const panelX = (FIELD.width - 640) / 2;
    drawPanel(panelX, 322, 640, 168);
    drawText('HOW TO PLAY', FIELD.width / 2, 352, 15, PALETTE.gold, 'center', 800);
    const rows = [
      ['MOVE', 'WASD / Arrow keys'],
      ['AIM + FIRE', 'Mouse — hold to fire'],
      ['SWITCH COLOUR', 'Q / E, wheel, or keys 1-5'],
      ['MATCHING HITS', 'Deal 3x damage and build combo'],
      ['P / ESC', 'Pause      M — mute'],
    ];
    rows.forEach(([key, value], index) => {
      const y = 382 + index * 22;
      drawText(key, panelX + 40, y, 14, PALETTE.text, 'left', 700);
      drawText(value, panelX + 230, y, 14, PALETTE.muted, 'left');
    });

    const blink = Math.floor(world.state.time * 2) % 2 === 0;
    // The DOM mode buttons replace click-to-start, so the canvas line would
    // only duplicate them — and the buttons sit low, so the strip and the
    // leaders move up clear of them (they used to hide underneath).
    if (blink && !ui.daily) drawText('CLICK OR PRESS ENTER TO START', FIELD.width / 2, 552, 22, '#ffffff', 'center', 800);
    if (ui.best > 0 && !ui.daily) drawText(`BEST SCORE  ${ui.best.toLocaleString('en-US')}`, FIELD.width / 2, 592, 16, PALETTE.gold, 'center', 700);
    if (ui.daily) {
      const daily = ui.daily;
      const strip = `TODAY ${daily.date}  ·  ${daily.attemptsLeft} ${daily.attemptsLeft === 1 ? 'ATTEMPT' : 'ATTEMPTS'} LEFT  ·  BEST TODAY ${daily.bestToday.toLocaleString('en-US')}${daily.streak > 0 ? `  ·  🔥 ${daily.streak}-DAY STREAK` : ''}`;
      // The panel ends at 490 and the DOM buttons start around 531 (logical);
      // 512 is the clear band between them. The top-3 leaders live in the
      // leaderboard panel and on the splash card instead of crowding this band.
      drawText(strip, FIELD.width / 2, 512, 14, PALETTE.gold, 'center', 700);
    } else {
      drawText('5 enemy kinds, a boss every 5th wave, shields, overdrive and nova bombs.', FIELD.width / 2, 636, 14, PALETTE.muted, 'center');
    }
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(4, 6, 18, 0.66)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    drawText('PAUSED', FIELD.width / 2, FIELD.height / 2 - 10, 56, PALETTE.text, 'center', 900);
    drawText('Press P or ESC to resume — R to restart', FIELD.width / 2, FIELD.height / 2 + 34, 16, PALETTE.muted, 'center');
  }

  function drawOver(world, ui) {
    ctx.fillStyle = 'rgba(10, 4, 10, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    drawText('SIGNAL LOST', FIELD.width / 2, 168, 64, '#ff5470', 'center', 900);
    drawText('The swarm overran your ship.', FIELD.width / 2, 206, 17, PALETTE.muted, 'center');
    const panelX = (FIELD.width - 520) / 2;
    const extraRows = ui.dailyResult ? 2 : 0;
    drawPanel(panelX, 240, 520, 250 + extraRows * 24);
    const state = world.state;
    const accuracy = state.shotsFired > 0 ? Math.round((state.shotsHit / state.shotsFired) * 100) : 0;
    drawText('FINAL SCORE', FIELD.width / 2, 286, 14, PALETTE.muted, 'center', 700);
    drawText(state.score.toLocaleString('en-US'), FIELD.width / 2, 334, 48, '#ffffff', 'center', 900);
    const rows = [
      ['WAVE REACHED', String(state.wave)],
      ['ENEMIES DESTROYED', String(state.kills)],
      ['BEST COMBO', `x${(1 + Math.min(state.bestCombo, 24) * 0.125).toFixed(2)}  (${state.bestCombo} hits)`],
      ['ACCURACY', `${accuracy}%`],
      ['BEST SCORE', Math.max(ui.best, state.score).toLocaleString('en-US')],
    ];
    if (ui.dailyResult) {
      rows.push(['TODAY’S RANK', ui.dailyResult.rank > 0 ? `#${ui.dailyResult.rank}` : '—']);
      rows.push(['STREAK', ui.dailyResult.streak > 0 ? `${ui.dailyResult.streak} day${ui.dailyResult.streak === 1 ? '' : 's'} 🔥` : '—']);
    }
    rows.forEach(([key, value], index) => {
      const y = 372 + index * 24;
      drawText(key, panelX + 40, y, 14, PALETTE.muted, 'left', 700);
      drawText(value, panelX + 480, y, 14, PALETTE.text, 'right', 700);
    });
    const blink = Math.floor(world.state.time * 2) % 2 === 0;
    if (blink) drawText('PRESS R OR CLICK TO PLAY AGAIN', FIELD.width / 2, 552 + extraRows * 24, 20, '#ffffff', 'center', 800);
  }

  const renderer = {
    /** Paint one frame. `screen` is one of the SCREEN_* constants. */
    draw(world, screen, ui) {
      ctx.save();
      ctx.clearRect(0, 0, FIELD.width, FIELD.height);
      if (world.shake > 0.2) {
        const magnitude = world.shake * 0.5;
        ctx.translate((Math.random() - 0.5) * magnitude, (Math.random() - 0.5) * magnitude);
      }
      ctx.drawImage(background, 0, 0);
      ctx.strokeStyle = PALETTE.grid;
      ctx.lineWidth = 1;
      for (let x = 0; x <= FIELD.width; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, FIELD.height);
        ctx.stroke();
      }
      for (let y = 0; y <= FIELD.height; y += 80) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(FIELD.width, y);
        ctx.stroke();
      }

      for (const pickup of world.pickups) {
        const def = PICKUPS[pickup.kind];
        const pulse = 1 + Math.sin(pickup.t * 5) * 0.12;
        ctx.save();
        ctx.translate(pickup.x, pickup.y);
        ctx.scale(pulse, pulse);
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#0a0618';
        ctx.font = '900 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pickup.kind === 'heart' ? '+' : pickup.kind[0].toUpperCase(), 0, 1);
        ctx.restore();
      }

      for (const bullet of world.enemyBullets) {
        ctx.fillStyle = '#ff7a9e';
        ctx.shadowColor = '#ff5470';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      for (const enemy of world.enemies) {
        ctx.save();
        ctx.translate(enemy.x, enemy.y);
        const sprite = enemy.isBoss
          ? bossSprite
          : enemySprites[enemy.type][enemy.color];
        const size = enemy.isBoss ? 192 : enemy.radius * 3.4;
        const spin = enemy.behaviour === 'split' || enemy.isBoss ? enemy.angle : enemy.angle;
        ctx.rotate(enemy.type === 'sniper' ? enemy.angle : spin);
        if (enemy.flash > 0) {
          ctx.filter = 'brightness(2.2)';
        }
        ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
        ctx.restore();
        if (enemy.behaviour === 'dash' && enemy.state === 'telegraph') {
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 8]);
          ctx.beginPath();
          ctx.moveTo(enemy.x, enemy.y);
          ctx.lineTo(world.player.x, world.player.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      const player = world.player;
      if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
        const blink = player.invuln > 0 && Math.floor(world.state.time * 12) % 2 === 0;
        if (!blink) {
          ctx.save();
          ctx.translate(player.x, player.y);
          ctx.rotate(player.angle);
          const sprite = playerSprites[player.color];
          ctx.drawImage(sprite, -48, -48, 96, 96);
          ctx.restore();
          if (player.thrust > 0.2) {
            const backX = player.x - Math.cos(player.angle) * 26;
            const backY = player.y - Math.sin(player.angle) * 26;
            ctx.fillStyle = 'rgba(255, 190, 90, 0.85)';
            ctx.shadowColor = '#ffb45a';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(backX, backY, 4 + player.thrust * 6, 0, TAU);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
          if (player.shield) {
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(player.x, player.y, PLAYER.radius + 12, 0, TAU);
            ctx.stroke();
          }
        }
        for (const bullet of world.bullets) {
          ctx.save();
          ctx.translate(bullet.x, bullet.y);
          ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
          ctx.fillStyle = COLORS[bullet.color].css;
          ctx.shadowColor = COLORS[bullet.color].css;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.ellipse(0, 0, 15, 5, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        ctx.shadowBlur = 0;
        if (player.aimSeen) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(player.aimX, player.aimY, 10, 0, TAU);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(player.aimX - 14, player.aimY);
          ctx.lineTo(player.aimX - 6, player.aimY);
          ctx.moveTo(player.aimX + 6, player.aimY);
          ctx.lineTo(player.aimX + 14, player.aimY);
          ctx.moveTo(player.aimX, player.aimY - 14);
          ctx.lineTo(player.aimX, player.aimY - 6);
          ctx.moveTo(player.aimX, player.aimY + 6);
          ctx.lineTo(player.aimX, player.aimY + 14);
          ctx.stroke();
        }
      }

      for (const particle of world.particles) {
        ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      for (const floater of world.floaters) {
        ctx.globalAlpha = Math.max(0, floater.life);
        drawText(floater.text, floater.x, floater.y, 16, floater.color, 'center', 800);
      }
      ctx.globalAlpha = 1;

      if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
        drawHud(world, ui);
        drawBanner(world);
      }
      if (screen === SCREEN_TITLE) drawTitle(world, ui);
      if (screen === SCREEN_PAUSED) drawPaused();
      if (screen === SCREEN_OVER) drawOver(world, ui);

      if (ui.muted) drawText('MUTED (M)', FIELD.width - 28, FIELD.height - 58, 12, PALETTE.muted, 'right');
      if (world.flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${world.flash * 0.5})`;
        ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      }
      ctx.restore();
    },
  };

  return renderer;
}
