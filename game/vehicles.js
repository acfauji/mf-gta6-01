import { addBox, addMesh, createMesh } from './vendor/three.min.js';

function shade(hex, factor) {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * factor)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function createCar(scene, city, spec) {
  const color = spec.color || '#d95c4a';
  const mesh = createMesh();
  mesh.x = spec.x;
  mesh.y = 0;
  mesh.z = spec.z;
  mesh.rotationY = spec.yaw || 0;
  addBox(mesh, { y: 0.36, w: 2.02, h: 0.24, d: 3.96, color: '#27292d' });
  addBox(mesh, { y: 0.7, w: 1.9, h: 0.64, d: 4.2, color });
  addBox(mesh, { y: 1.14, z: -0.15, w: 1.58, h: 0.56, d: 2.08, color: shade(color, 0.82) });
  addBox(mesh, { y: 1.16, z: 0.94, w: 1.42, h: 0.38, d: 0.1, color: '#2c4a59' });
  addBox(mesh, { y: 1.16, z: -1.24, w: 1.42, h: 0.36, d: 0.1, color: '#2c4a59' });
  addBox(mesh, { y: 1.44, z: -0.15, w: 1.38, h: 0.1, d: 1.82, color: shade(color, 0.9) });
  for (const x of [-0.98, 0.98]) {
    for (const z of [-1.35, 1.35]) {
      addBox(mesh, { x, y: 0.34, z, w: 0.34, h: 0.68, d: 0.74, color: '#1c1d20' });
    }
  }
  addBox(mesh, { x: -0.62, y: 0.75, z: 2.13, w: 0.42, h: 0.22, d: 0.08, color: '#fff1b8' });
  addBox(mesh, { x: 0.62, y: 0.75, z: 2.13, w: 0.42, h: 0.22, d: 0.08, color: '#fff1b8' });
  addBox(mesh, { x: -0.62, y: 0.75, z: -2.13, w: 0.42, h: 0.2, d: 0.08, color: '#bd3b31' });
  addBox(mesh, { x: 0.62, y: 0.75, z: -2.13, w: 0.42, h: 0.2, d: 0.08, color: '#bd3b31' });
  addMesh(scene, mesh);

  const car = {
    x: spec.x, z: spec.z, y: 0, yaw: spec.yaw || 0, speed: 0,
    mesh, radius: 1.35, controllable: !!spec.controllable,

    step(controls, dt, cars) {
      const throttle = controls.throttle || 0;
      if (throttle > 0) this.speed += (this.speed < 0 ? 13 : 10.5) * throttle * dt;
      else if (throttle < 0) this.speed -= (this.speed > 0 ? 17 : 6.5) * throttle * dt;
      else this.speed *= Math.exp(-1.7 * dt);
      const drag = 0.0025 * this.speed * Math.abs(this.speed);
      this.speed -= Math.sign(this.speed) * drag * dt;
      this.speed = Math.max(-8, Math.min(25, this.speed));

      const steer = controls.steer || 0;
      if (Math.abs(this.speed) > 0.05) {
        const grip = Math.min(1, Math.abs(this.speed) / 5);
        this.yaw += steer * grip * 1.08 * dt * Math.sign(this.speed);
      }

      const ox = this.x, oz = this.z;
      this.x += Math.sin(this.yaw) * this.speed * dt;
      this.z += Math.cos(this.yaw) * this.speed * dt;
      const next = city.resolve(this.x, this.z, this.radius, ox, oz);
      if (Math.abs(next.x - this.x) > 0.001 || Math.abs(next.z - this.z) > 0.001) this.speed *= 0.35;
      this.x = next.x;
      this.z = next.z;

      if (cars) {
        for (let i = 0; i < cars.length; i++) {
          const other = cars[i];
          if (other === this) continue;
          const dx = this.x - other.x, dz = this.z - other.z;
          const distance = Math.hypot(dx, dz);
          if (distance > 0.001 && distance < 3.4) {
            const push = (3.4 - distance) * 0.5;
            this.x += (dx / distance) * push;
            this.z += (dz / distance) * push;
            this.speed *= 0.7;
          }
        }
      }

      mesh.x = this.x;
      mesh.z = this.z;
      mesh.rotationY = this.yaw;
    },

    distanceTo(x, z) {
      return Math.hypot(this.x - x, this.z - z);
    },

    setActive(value) {
      mesh.visible = value;
    },
  };
  return car;
}
