import { addBox, addMesh, createMesh } from './vendor/three.min.js';

export function createPlayer(scene, city, startX, startZ) {
  const mesh = createMesh();
  mesh.x = startX;
  mesh.y = 0;
  mesh.z = startZ;
  addBox(mesh, { x: -0.19, y: 0.43, z: 0, w: 0.3, h: 0.86, d: 0.34, color: '#263b5c' });
  addBox(mesh, { x: 0.19, y: 0.43, z: 0, w: 0.3, h: 0.86, d: 0.34, color: '#263b5c' });
  addBox(mesh, { y: 1.32, w: 0.78, h: 0.92, d: 0.46, color: '#d4663f' });
  addBox(mesh, { x: -0.52, y: 1.3, w: 0.22, h: 0.8, d: 0.26, color: '#e0b089' });
  addBox(mesh, { x: 0.52, y: 1.3, w: 0.22, h: 0.8, d: 0.26, color: '#e0b089' });
  addBox(mesh, { y: 2.05, w: 0.52, h: 0.56, d: 0.5, color: '#e3b58b' });
  addBox(mesh, { y: 2.36, w: 0.58, h: 0.16, d: 0.56, color: '#3a2d27' });
  addMesh(scene, mesh);

  const player = {
    x: startX, y: 0, z: startZ, vy: 0, yaw: 0, radius: 0.55,
    onGround: true, mesh, walking: false, phase: 0, active: true,

    update(dt, input, view) {
      let mx = 0, mz = 0;
      if (input.down('KeyW')) mz += 1;
      if (input.down('KeyS')) mz -= 1;
      if (input.down('KeyD')) mx += 1;
      if (input.down('KeyA')) mx -= 1;
      const len = Math.hypot(mx, mz);
      this.walking = len > 0;
      if (len > 0) {
        mx /= len;
        mz /= len;
        const fx = Math.sin(view.yaw), fz = Math.cos(view.yaw);
        const rx = fz, rz = -fx;
        const dx = rx * mx + fx * mz;
        const dz = rz * mx + fz * mz;
        const speed = input.down('ShiftLeft') ? 8.4 : 5.1;
        const next = city.resolve(this.x + dx * speed * dt, this.z + dz * speed * dt, this.radius, this.x, this.z);
        this.x = next.x;
        this.z = next.z;
        this.yaw = Math.atan2(dx, dz);
        this.phase += dt * (speed * 1.7);
      }

      if (this.onGround && input.pressed('Space')) {
        this.vy = 6.6;
        this.onGround = false;
      }
      this.vy -= 18 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.onGround = true;
      }

      mesh.x = this.x;
      mesh.z = this.z;
      mesh.y = this.y + (this.walking && this.onGround ? Math.abs(Math.sin(this.phase)) * 0.045 : 0);
      mesh.rotationY = this.yaw;
    },

    setActive(value) {
      this.active = value;
      mesh.visible = value;
    },

    place(x, z, yaw) {
      this.x = x;
      this.z = z;
      this.y = 0;
      this.vy = 0;
      this.yaw = yaw || this.yaw;
      mesh.x = x;
      mesh.z = z;
      mesh.y = 0;
      mesh.rotationY = this.yaw;
    },
  };
  return player;
}
