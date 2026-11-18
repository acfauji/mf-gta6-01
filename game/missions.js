import { addBox, addMesh, createMesh } from './vendor/three.min.js';
import { CELL, ROAD } from './city.js';

const RADIUS = 4.6;
const HOLD = 1.5;

export function createMission(scene) {
  const store = { x: CELL * 3 + ROAD / 2 + 2.5, z: CELL * 3 + ROAD / 2 + 2.5 };

  const shop = createMesh();
  shop.x = store.x;
  shop.z = store.z + 2.2;
  shop.rotationY = Math.PI;
  addBox(shop, { y: 1.5, w: 4.2, h: 3, d: 2.6, color: '#d9d6c4' });
  addBox(shop, { y: 1.0, z: 1.35, w: 2.4, h: 1.2, d: 0.12, color: '#3b5f6b' });
  addBox(shop, { y: 0.55, z: 1.38, w: 0.9, h: 1.1, d: 0.14, color: '#7a4b32' });
  addBox(shop, { y: 2.5, z: 1.45, w: 4.5, h: 0.22, d: 0.9, color: '#e8a83c' });
  addBox(shop, { y: 3.35, z: 1.4, w: 2.8, h: 0.5, d: 0.18, color: '#f3c552' });
  addMesh(scene, shop);

  const marker = createMesh();
  marker.x = store.x + 2.6;
  marker.z = store.z;
  const beam = addBox(marker, { y: 3.2, w: 0.5, h: 6, d: 0.5, color: [255, 210, 70] });
  const cap = addBox(marker, { y: 6.5, w: 1.2, h: 0.5, d: 1.2, color: [255, 240, 140] });
  addMesh(scene, marker);

  let stage = 'go';
  let hold = 0;
  let pulse = 0;

  function update(dt, x, z, wanted) {
    pulse += dt;
    const distance = Math.hypot(x - store.x, z - store.z);
    const near = distance < RADIUS;
    let event = null;

    if (stage === 'go') {
      if (near) {
        stage = 'rob';
        hold = 0;
      }
    } else if (stage === 'rob') {
      if (near) {
        hold += dt;
        if (hold >= HOLD) {
          stage = 'escape';
          event = 'robbed';
        }
      } else {
        hold = Math.max(0, hold - dt * 2);
      }
    } else if (stage === 'escape' && wanted === 0) {
      stage = 'done';
      event = 'complete';
    }

    marker.visible = stage === 'go' || stage === 'rob';
    const glow = 0.65 + 0.35 * Math.sin(pulse * 4);
    beam.color = [255, Math.round(170 + 60 * glow), Math.round(40 + 50 * glow)];
    cap.color = [255, Math.round(210 + 40 * glow), Math.round(90 + 60 * glow)];

    let text;
    if (stage === 'go') text = 'Go to the store';
    else if (stage === 'rob') text = near ? `Rob it · ${Math.max(0, HOLD - hold).toFixed(1)}s` : 'Rob it — get back inside';
    else if (stage === 'escape') text = 'Lose the cops';
    else text = 'Mission complete';

    return { stage, text, event, distance };
  }

  return { store, radius: RADIUS, update, get stage() { return stage; } };
}
