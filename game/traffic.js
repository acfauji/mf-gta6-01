import { addBox, addMesh, createMesh } from './vendor/three.min.js';
import { createCar } from './vehicles.js';

const CAR_COLORS = ['#3f7ea8', '#d3b33f', '#7c9d54', '#a96a9c', '#cf714c', '#5d8b95', '#c9c4b6'];

function random(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrap(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function createPedestrian(scene, path, index, rnd) {
  const mesh = createMesh();
  const shirt = ['#3e6b8a', '#a5534a', '#c2a14c', '#587a56', '#765c8d'][index % 5];
  addBox(mesh, { x: -0.13, y: 0.38, w: 0.22, h: 0.76, d: 0.24, color: '#383b43' });
  addBox(mesh, { x: 0.13, y: 0.38, w: 0.22, h: 0.76, d: 0.24, color: '#383b43' });
  addBox(mesh, { y: 1.15, w: 0.52, h: 0.76, d: 0.34, color: shirt });
  addBox(mesh, { y: 1.72, w: 0.36, h: 0.38, d: 0.36, color: '#d6a77e' });
  addMesh(scene, mesh);
  const ped = {
    mesh, path, point: Math.floor(rnd() * path.length), t: rnd(), speed: 1.1 + rnd() * 0.8,
    x: path[0].x, z: path[0].z,

    update(dt) {
      const from = this.path[this.point];
      const to = this.path[(this.point + 1) % this.path.length];
      const dx = to.x - from.x, dz = to.z - from.z;
      const length = Math.hypot(dx, dz) || 1;
      this.t += (this.speed * dt) / length;
      while (this.t >= 1) {
        this.t -= 1;
        this.point = (this.point + 1) % this.path.length;
      }
      const a = this.path[this.point];
      const b = this.path[(this.point + 1) % this.path.length];
      this.x = a.x + (b.x - a.x) * this.t;
      this.z = a.z + (b.z - a.z) * this.t;
      this.mesh.x = this.x;
      this.mesh.z = this.z;
      this.mesh.rotationY = Math.atan2(b.x - a.x, b.z - a.z);
    },
  };
  return ped;
}

export function createTraffic(scene, city) {
  const rnd = random(9931);
  const cars = [];
  for (let i = 0; i < 9; i++) {
    const loop = city.loops[i % city.loops.length];
    const lane = i % 2 === 0 ? 4.6 : -4.6;
    const start = loop[i % loop.length];
    const next = loop[(i + 1) % loop.length];
    const sx = next.x - start.x, sz = next.z - start.z;
    const len = Math.hypot(sx, sz) || 1;
    const car = createCar(scene, city, {
      x: start.x + (sz / len) * lane,
      z: start.z - (sx / len) * lane,
      yaw: Math.atan2(sx, sz),
      color: CAR_COLORS[i % CAR_COLORS.length],
    });
    car.loop = loop;
    car.waypoint = (i + 1) % loop.length;
    car.lane = lane;
    car.cruise = 8.5 + rnd() * 4;
    cars.push(car);
  }

  const pedestrians = [];
  const paths = city.sidewalkPaths;
  for (let i = 0; i < Math.min(16, paths.length); i++) {
    pedestrians.push(createPedestrian(scene, paths[(i * 3) % paths.length], i, rnd));
  }

  function update(dt) {
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i];
      const loop = car.loop;
      const target = loop[car.waypoint];
      const previous = loop[(car.waypoint + loop.length - 1) % loop.length];
      const sx = target.x - previous.x, sz = target.z - previous.z;
      const seg = Math.hypot(sx, sz) || 1;
      const tx = target.x + (sz / seg) * car.lane;
      const tz = target.z - (sx / seg) * car.lane;
      const dx = tx - car.x, dz = tz - car.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 8) car.waypoint = (car.waypoint + 1) % loop.length;
      const desired = Math.atan2(dx, dz);
      const steer = Math.max(-1, Math.min(1, wrap(desired - car.yaw) * 1.7));

      let blocked = false;
      const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
      for (let j = 0; j < cars.length; j++) {
        if (j === i) continue;
        const other = cars[j];
        const ox = other.x - car.x, oz = other.z - car.z;
        const ahead = ox * fx + oz * fz;
        if (ahead > 0 && ahead < 9 && Math.abs(ox * fz - oz * fx) < 2.2) blocked = true;
      }
      const throttle = blocked ? -0.55 : (car.speed < car.cruise ? 0.8 : 0.05);
      car.step({ throttle, steer }, dt, cars);
    }
    for (let i = 0; i < pedestrians.length; i++) {
      if (!pedestrians[i].hit) pedestrians[i].update(dt);
    }
  }

  function hitPedestrians(x, z, radius) {
    let hits = 0;
    for (let i = 0; i < pedestrians.length; i++) {
      const ped = pedestrians[i];
      if (ped.hit || Math.hypot(ped.x - x, ped.z - z) >= radius) continue;
      ped.hit = true;
      ped.mesh.visible = false;
      hits++;
    }
    return hits;
  }

  return { cars, pedestrians, update, hitPedestrians };
}
