import { addGround, addBox, addMesh, createMesh, freezeMesh } from './vendor/three.min.js';

export const CELL = 84;
export const ROAD = 22;
export const SIDEWALK = 5;
export const GRID = 9;
export const WORLD = GRID * CELL;

const BUILDINGS = ['#d8a06f', '#c9785c', '#e0b87c', '#b88266', '#e7c99b', '#c99680', '#d4b28d', '#c27f70'];
const ROOF = '#7e6a5b';
const BAND = '#f0dcae';

function random(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rect(x0, x1, z0, z1, y, color, layer) {
  return [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
}

function pick(list, rnd) {
  return list[Math.floor(rnd() * list.length) % list.length];
}

export function createCity(scene, seed = 2407) {
  const rnd = random(seed);
  const blocks = [];
  const parkedSpots = [];
  const sidewalkPaths = [];

  addGround(scene, rect(-260, WORLD + 260, -260, WORLD + 260, -0.12, '#d7c39a'), 0);

  for (let i = 0; i <= GRID; i++) {
    const p = i * CELL;
    addGround(scene, rect(p - ROAD / 2, p + ROAD / 2, -90, WORLD + 90, -0.02, '#51565c'), 1);
    addGround(scene, rect(-90, WORLD + 90, p - ROAD / 2, p + ROAD / 2, -0.015, '#51565c'), 1);
    for (let t = 8; t < WORLD + 40; t += 15) {
      const nearCrossing = t % CELL < ROAD + 5 || t % CELL > CELL - 5;
      if (nearCrossing) continue;
      addGround(scene, rect(p - 0.22, p + 0.22, t, t + 6, 0.01, '#f2d271'), 3);
      addGround(scene, rect(t, t + 6, p - 0.22, p + 0.22, 0.012, '#f2d271'), 3);
    }
  }

  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      if ((i + j) % 2 !== 0) continue;
      const x = i * CELL, z = j * CELL;
      for (let k = -1; k <= 1; k++) {
        addGround(scene, rect(x - ROAD / 2 + 2 + k * 3.1, x - ROAD / 2 + 4.1 + k * 3.1, z + ROAD / 2 - 7, z + ROAD / 2 - 2, 0.02, '#e8e3d6'), 3);
        addGround(scene, rect(x - ROAD / 2 + 2 + k * 3.1, x - ROAD / 2 + 4.1 + k * 3.1, z - ROAD / 2 + 2, z - ROAD / 2 + 7, 0.02, '#e8e3d6'), 3);
      }
    }
  }

  for (let bx = 0; bx < GRID; bx++) {
    for (let bz = 0; bz < GRID; bz++) {
      const sx0 = bx * CELL + ROAD / 2;
      const sx1 = (bx + 1) * CELL - ROAD / 2;
      const sz0 = bz * CELL + ROAD / 2;
      const sz1 = (bz + 1) * CELL - ROAD / 2;
      addGround(scene, rect(sx0, sx1, sz0, sz1, 0.055, '#d6ceba'), 2);
      const x0 = sx0 + SIDEWALK;
      const x1 = sx1 - SIDEWALK;
      const z0 = sz0 + SIDEWALK;
      const z1 = sz1 - SIDEWALK;
      const park = rnd() < 0.075;
      addGround(scene, rect(x0, x1, z0, z1, 0.07, park ? '#8aa66d' : '#bfa98c'), 2.2);

      if (park) {
        for (let t = 0; t < 5; t++) {
          const tx = x0 + 5 + rnd() * (x1 - x0 - 10);
          const tz = z0 + 5 + rnd() * (z1 - z0 - 10);
          const tree = createMesh();
          tree.x = tx;
          tree.y = 1.1;
          tree.z = tz;
          addBox(tree, { y: -1.1, w: 0.8, h: 2.2, d: 0.8, color: '#7c6047' });
          addBox(tree, { y: 1.7, w: 3.4, h: 3.2, d: 3.4, color: '#5f8a55' });
          addBox(tree, { y: 3.6, w: 2.2, h: 1.8, d: 2.2, color: '#6c9a5d' });
          addMesh(scene, freezeMesh(tree));
          blocks.push({ minX: tx - 0.5, maxX: tx + 0.5, minZ: tz - 0.5, maxZ: tz + 0.5 });
        }
      } else {
        const sw = (x1 - x0) / 2;
        const sd = (z1 - z0) / 2;
        for (let ix = 0; ix < 2; ix++) {
          for (let iz = 0; iz < 2; iz++) {
            if (rnd() < 0.16) continue;
            const w = sw - 4 - rnd() * 5;
            const d = sd - 4 - rnd() * 5;
            if (w < 7 || d < 7) continue;
            const cx = x0 + ix * sw + sw / 2 + (rnd() - 0.5) * 2;
            const cz = z0 + iz * sd + sd / 2 + (rnd() - 0.5) * 2;
            const centre = Math.hypot(cx - WORLD / 2, cz - WORLD / 2) / (WORLD * 0.72);
            let h = 9 + rnd() * 17 + (1 - Math.min(1, centre)) * rnd() * 42;
            if (rnd() < 0.07) h *= 1.45;
            h = Math.min(78, h);
            const color = pick(BUILDINGS, rnd);
            const mesh = createMesh();
            mesh.x = cx;
            mesh.y = h / 2 + 0.09;
            mesh.z = cz;
            addBox(mesh, { w, h, d, color });
            addBox(mesh, { y: h / 2 + 0.3, w: w + 0.7, h: 0.6, d: d + 0.7, color: ROOF });
            if (h > 15) {
              const bands = Math.min(4, Math.floor(h / 11));
              for (let b = 1; b <= bands; b++) {
                addBox(mesh, { y: -h / 2 + (h * b) / (bands + 1), w: w + 0.16, h: 0.4, d: d + 0.16, color: BAND });
              }
            }
            addMesh(scene, freezeMesh(mesh));
            blocks.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
          }
        }
      }

      if (bx > 0 && bz > 0 && bx < GRID - 1 && bz < GRID - 1) {
        sidewalkPaths.push([
          { x: sx0 + 1.6, z: sz0 + 1.6 },
          { x: sx1 - 1.6, z: sz0 + 1.6 },
          { x: sx1 - 1.6, z: sz1 - 1.6 },
          { x: sx0 + 1.6, z: sz1 - 1.6 },
        ]);
      }
    }
  }

  for (let i = 1; i < GRID; i++) {
    for (let j = 1; j < GRID; j += 2) {
      parkedSpots.push({ x: i * CELL + 4.6, z: (j + 0.5) * CELL, yaw: Math.PI / 2 });
      parkedSpots.push({ x: (i + 0.5) * CELL, z: j * CELL - 4.6, yaw: 0 });
    }
  }

  const loops = [
    [
      { x: CELL, z: CELL }, { x: (GRID - 1) * CELL, z: CELL },
      { x: (GRID - 1) * CELL, z: (GRID - 1) * CELL }, { x: CELL, z: (GRID - 1) * CELL },
    ],
    [
      { x: 2 * CELL, z: 2 * CELL }, { x: (GRID - 2) * CELL, z: 2 * CELL },
      { x: (GRID - 2) * CELL, z: (GRID - 2) * CELL }, { x: 2 * CELL, z: (GRID - 2) * CELL },
    ],
    [
      { x: 3 * CELL, z: CELL }, { x: 3 * CELL, z: (GRID - 1) * CELL },
      { x: (GRID - 1) * CELL, z: (GRID - 1) * CELL }, { x: (GRID - 1) * CELL, z: 3 * CELL },
    ],
  ];

  function collides(x, z, r) {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true;
    }
    return false;
  }

  function resolve(x, z, r, oldX, oldZ) {
    let nx = x, nz = z;
    if (collides(nx, oldZ, r)) nx = oldX;
    if (collides(nx, nz, r)) nz = oldZ;
    nx = Math.max(6, Math.min(WORLD - 6, nx));
    nz = Math.max(6, Math.min(WORLD - 6, nz));
    return { x: nx, z: nz };
  }

  return { blocks, parkedSpots, sidewalkPaths, loops, collides, resolve };
}
