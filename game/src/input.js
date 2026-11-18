// Keyboard and pointer input. Held keys or a held pointer give a steering direction; one-shot
// presses (start or restart, pause) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice.
import { FIELD, PLAYER } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(target) {
  let left = false;
  let right = false;
  let actions = 0;
  let pointerHeld = false;
  let pointerX = 0;

  function trackPointer(event) {
    const rect = target.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const offset = (rect.width - FIELD.width * scale) / 2;
    pointerX = Math.min(FIELD.width, Math.max(0, (event.clientX - rect.left - offset) / scale));
  }

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    pointerHeld = false;
  });
  target.addEventListener('pointerdown', (event) => {
    pointerHeld = true;
    trackPointer(event);
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointermove', (event) => {
    if (pointerHeld) trackPointer(event);
  });
  window.addEventListener('pointerup', () => {
    pointerHeld = false;
  });
  window.addEventListener('pointercancel', () => {
    pointerHeld = false;
  });

  return {
    /** -1 for left, 1 for right, 0 for neither or both; a held pointer steers toward its x. */
    direction(playerCenter) {
      const keys = (right ? 1 : 0) - (left ? 1 : 0);
      if (keys !== 0 || !pointerHeld) return keys;
      const delta = pointerX - playerCenter;
      return Math.abs(delta) < PLAYER.width / 2 ? 0 : Math.sign(delta);
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
