// The screenshot scenes behind ?shot=title|play|boss|over. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot,
// so the frame is what a short game really looks like and the same seed always gives the
// same frame.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAMPLE = STEP;

/** The fake input the autopilot drives the world with. Exported for the title screen's demo. */
export function pilotInput(world, skill, target) {
  const player = world.player;
  let moveX = 0;
  let moveY = 0;
  let aimX = player.x;
  let aimY = player.y - 100;
  let firing = false;
  let wantedColor = player.color;

  if (skill > 0) {
    if (skill >= 1) {
      let fleeX = 0;
      let fleeY = 0;
      for (const enemy of world.enemies) {
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 230) {
          const weight = (230 - dist) / (dist * dist);
          fleeX += (dx / dist) * weight * 1000;
          fleeY += (dy / dist) * weight * 1000;
        }
      }
      for (const bullet of world.enemyBullets) {
        const dx = player.x - bullet.x;
        const dy = player.y - bullet.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 150) {
          const weight = (150 - dist) / (dist * dist);
          fleeX += (dx / dist) * weight * 1000;
          fleeY += (dy / dist) * weight * 1000;
        }
      }
      const fleeLength = Math.hypot(fleeX, fleeY);
      if (fleeLength > 0.2) {
        moveX = fleeX / fleeLength;
        moveY = fleeY / fleeLength;
      } else {
        const pickup = world.pickups[0];
        if (pickup) {
          const dx = pickup.x - player.x;
          const dy = pickup.y - player.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist > 40) {
            moveX = dx / dist;
            moveY = dy / dist;
          }
        } else {
          moveX = (FIELD.width / 2 - player.x) / FIELD.width;
          moveY = (FIELD.height / 2 - player.y) / FIELD.height;
        }
      }
    } else {
      // A half-hearted pilot: it shoots, but never dodges, so it scores a little and dies.
      moveX = (FIELD.width / 2 - player.x) / FIELD.width;
      moveY = (FIELD.height / 2 - player.y) / FIELD.height;
    }
    if (target) {
      aimX = target.x + target.vx * 0.15;
      aimY = target.y + target.vy * 0.15;
      wantedColor = target.color;
      firing = true;
    }
  }

  return {
    moveX,
    moveY,
    aimX,
    aimY,
    aimSeen: skill > 0,
    firing,
    wheelDelta: 0,
    pressed() {
      return false;
    },
    pressedColor() {
      return player.colorCd <= 0 && wantedColor !== player.color ? wantedColor : -1;
    },
    endFrame() {},
  };
}

function simulate(world, seconds, skill) {
  const steps = Math.floor(seconds / SAMPLE);
  for (let index = 0; index < steps; index += 1) {
    const target = skill > 0 ? world.nearestEnemy(world.player.x, world.player.y) : null;
    const events = world.step(SAMPLE, pilotInput(world, skill, target), null);
    if (events & EVENT_OVER) return true;
  }
  return false;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the best
 * score to show. Names: title, play, boss, over; anything else is title.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    // Play until the field is busy: several hostiles up, shots in the air, score on the
    // board — the frame a player actually sees mid-fight — or a minute at most.
    for (let second = 0; second < 70; second += 1) {
      simulate(world, 1, 1);
      if (world.state.lives <= 0) break;
      if (world.enemies.length >= 6 && world.bullets.length >= 2 && world.state.score > 0) break;
    }
    return { screen: world.state.lives > 0 ? SCREEN_PLAY : SCREEN_OVER, best: world.state.score };
  }
  if (name === 'boss') {
    world.state.wave = 4;
    world.nextWave();
    let bossSeen = false;
    let bossTime = 0;
    for (let index = 0; index < 60 / SAMPLE; index += 1) {
      const target = world.nearestEnemy(world.player.x, world.player.y);
      const events = world.step(SAMPLE, pilotInput(world, 1, target), null);
      if (world.boss) {
        bossSeen = true;
        bossTime += SAMPLE;
        if (bossTime > 7) break;
      }
      if (events & EVENT_OVER) break;
    }
    void bossSeen;
    return { screen: world.state.lives > 0 ? SCREEN_PLAY : SCREEN_OVER, best: world.state.score };
  }
  if (name === 'over') {
    simulate(world, 600, 0.5);
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  world.attract = true;
  simulate(world, 6, 1);
  return { screen: SCREEN_TITLE, best: 0 };
}
