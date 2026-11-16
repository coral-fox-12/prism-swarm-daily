// Keyboard and mouse, read as one state. The game loop polls this every frame; keys that
// act once (pause, restart, colour switch) are edge-triggered and cleared at the frame's end.

export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_RESTART = 'restart';
export const ACTION_MUTE = 'mute';
export const ACTION_COLOR_NEXT = 'colorNext';
export const ACTION_COLOR_PREV = 'colorPrev';

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyR: ACTION_RESTART,
  KeyM: ACTION_MUTE,
  KeyQ: ACTION_COLOR_PREV,
  KeyE: ACTION_COLOR_NEXT,
  Digit1: 'color0',
  Digit2: 'color1',
  Digit3: 'color2',
  Digit4: 'color3',
  Digit5: 'color4',
};

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let wheelDelta = 0;

  const input = {
    /** Movement axes, -1 to 1, from WASD or the arrow keys. */
    moveX: 0,
    moveY: 0,
    /** Aim point in canvas pixels; the ship fires toward it. */
    aimX: 0,
    aimY: 0,
    aimSeen: false,
    /** The fire button is held (mouse button or Space). */
    firing: false,
    /** Accumulated mouse-wheel steps since the last frame; the loop consumes them. */
    wheelDelta: 0,
    /** Colour the loop should switch to (touch auto-aim sets this); -1 = none. */
    autoColor: -1,
    /** True once a touch has been used: the game switches to touch mode. */
    touchMode: false,
    /** Virtual joystick state, in canvas pixels. Null when not held. */
    touch: null,
  };

  // Touch: left half of the screen is a virtual joystick, right half aims and
  // fires. The game loop reads input.touch and auto-fires at the nearest
  // enemy while touch mode is on.
  const touches = new Map();
  const JOYSTICK_RADIUS = 64;

  function canvasPoint(touch) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((touch.clientX - rect.left) / rect.width) * canvas.width,
      y: ((touch.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function onTouchStart(event) {
    input.touchMode = true;
    for (const touch of event.changedTouches) {
      const point = canvasPoint(touch);
      const half = canvas.width / 2;
      if (point.x < half && ![...touches.values()].some((t) => t.kind === 'joy')) {
        touches.set(touch.identifier, { kind: 'joy', ox: point.x, oy: point.y, x: point.x, y: point.y });
      } else if (![...touches.values()].some((t) => t.kind === 'aim')) {
        touches.set(touch.identifier, { kind: 'aim', x: point.x, y: point.y });
        input.aimX = point.x;
        input.aimY = point.y;
        input.aimSeen = true;
        input.firing = true;
      }
    }
    event.preventDefault();
  }

  function onTouchMove(event) {
    for (const touch of event.changedTouches) {
      const held = touches.get(touch.identifier);
      if (!held) continue;
      const point = canvasPoint(touch);
      if (held.kind === 'joy') {
        const dx = point.x - held.ox;
        const dy = point.y - held.oy;
        const length = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(length, JOYSTICK_RADIUS);
        held.x = held.ox + (dx / length) * clamped;
        held.y = held.oy + (dy / length) * clamped;
      } else {
        held.x = point.x;
        held.y = point.y;
        input.aimX = point.x;
        input.aimY = point.y;
      }
    }
    event.preventDefault();
  }

  function onTouchEnd(event) {
    for (const touch of event.changedTouches) {
      const held = touches.get(touch.identifier);
      if (!held) continue;
      touches.delete(touch.identifier);
      if (held.kind === 'aim' && ![...touches.values()].some((t) => t.kind === 'aim')) {
        input.firing = false;
      }
    }
    event.preventDefault();
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) pressed.add(action);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    input.aimX = ((event.clientX - rect.left) / rect.width) * canvas.width;
    input.aimY = ((event.clientY - rect.top) / rect.height) * canvas.height;
    input.aimSeen = true;
  }

  function onMouseDown(event) {
    if (event.button === 0) {
      input.firing = true;
      // A fresh click is also an edge-triggered confirm (start / back-to-title).
      // Holding the button through a run's end must NOT auto-restart it:
      // the daily game only has 3 attempts, so a held button silently eating
      // a second attempt would be a real loss.
      pressed.add(ACTION_CONFIRM);
    }
    onMouseMove(event);
  }

  function onMouseUp(event) {
    if (event.button === 0) input.firing = false;
  }

  function onWheel(event) {
    wheelDelta += event.deltaY > 0 ? 1 : -1;
    event.preventDefault();
  }

  function onBlur() {
    keys.clear();
    input.firing = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

  /** Refresh the axes from the keys held down; call once per frame before the world steps. */
  input.update = function update() {
    const left = keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0;
    const right = keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0;
    const up = keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0;
    const down = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
    input.moveX = right - left;
    input.moveY = down - up;
    const joy = [...touches.values()].find((t) => t.kind === 'joy');
    if (joy) {
      input.touch = { ox: joy.ox, oy: joy.oy, x: joy.x, y: joy.y };
      input.moveX = (joy.x - joy.ox) / JOYSTICK_RADIUS;
      input.moveY = (joy.y - joy.oy) / JOYSTICK_RADIUS;
    } else {
      input.touch = null;
    }
    input.firing = input.firing || keys.has('Space');
    input.wheelDelta = wheelDelta;
    wheelDelta = 0;
  };

  /** True only on the frame the action's key went down. */
  input.pressed = function wasPressed(action) {
    return pressed.has(action);
  };

  /** Direct colour choice from the digit keys, or -1 when none was pressed. */
  input.pressedColor = function pressedColor() {
    if (input.autoColor >= 0) return input.autoColor;
    for (let index = 0; index < 5; index += 1) {
      if (pressed.has(`color${index}`)) return index;
    }
    return -1;
  };

  /** Clear the edge-triggered presses; call once per frame after the world steps. */
  input.endFrame = function endFrame() {
    pressed.clear();
  };

  return input;
}
