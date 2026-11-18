const BLOCKED_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyV', 'KeyR', 'KeyP',
  'Space', 'ShiftLeft', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  let mouseX = 0, mouseY = 0;
  let dragging = false, lastX = 0, lastY = 0, locked = false;

  window.addEventListener('keydown', (event) => {
    if (!held.has(event.code)) pressed.add(event.code);
    held.add(event.code);
    if (BLOCKED_KEYS.has(event.code)) event.preventDefault();
  });

  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });

  window.addEventListener('blur', () => {
    held.clear();
    pressed.clear();
    dragging = false;
  });

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    if (!locked && canvas.requestPointerLock) canvas.requestPointerLock();
  });

  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointercancel', () => { dragging = false; });

  window.addEventListener('pointermove', (event) => {
    if (locked) {
      mouseX += event.movementX || 0;
      mouseY += event.movementY || 0;
    } else if (dragging) {
      mouseX += event.clientX - lastX;
      mouseY += event.clientY - lastY;
    }
    lastX = event.clientX;
    lastY = event.clientY;
  });

  return {
    down(code) { return held.has(code); },
    pressed(code) {
      const hit = pressed.has(code);
      pressed.delete(code);
      return hit;
    },
    mouse() {
      const value = { x: mouseX, y: mouseY };
      mouseX = 0;
      mouseY = 0;
      return value;
    },
    get locked() { return locked; },
    clearFrame() { pressed.clear(); },
  };
}
