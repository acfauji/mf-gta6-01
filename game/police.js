import { addBox, addMesh, createMesh } from './vendor/three.min.js';
import { createCar } from './vehicles.js';
import { CELL } from './city.js';

const MAX_CARS = 6;
const SIGHT = 52;
const EVADE_SECONDS = 6;
const SPAWN_DELAY = 1.1;
const HITS_TO_DISABLE = 3;
const SPARK_LIFE = 0.34;

function wrap(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function spawnPoint(city, target) {
  let best = null;
  let bestScore = Infinity;
  for (let i = 1; i < 9; i++) {
    for (let j = 1; j < 9; j++) {
      const x = i * CELL;
      const z = j * CELL;
      if (city.collides(x, z, 2.4)) continue;
      const distance = Math.hypot(x - target.x, z - target.z);
      if (distance < 42 || distance > 110) continue;
      const score = Math.abs(distance - 62) + Math.random() * 28;
      if (score < bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
  }
  if (!best) {
    const angle = Math.random() * Math.PI * 2;
    const found = city.resolve(target.x + Math.sin(angle) * 60, target.z + Math.cos(angle) * 60, 2, target.x, target.z);
    best = { x: found.x, z: found.z };
  }
  best.yaw = Math.atan2(target.x - best.x, target.z - best.z);
  return best;
}

function createPoliceCar(scene, city, spec) {
  const car = createCar(scene, city, { ...spec, color: '#f1f1ea' });
  const mesh = car.mesh;
  const bodyBox = mesh.boxes[1];
  addBox(mesh, { x: -0.97, y: 0.72, z: -0.1, w: 0.04, h: 0.5, d: 1.6, color: '#20242b' });
  addBox(mesh, { x: 0.97, y: 0.72, z: -0.1, w: 0.04, h: 0.5, d: 1.6, color: '#20242b' });
  addBox(mesh, { y: 1.13, z: 1.05, w: 1.5, h: 0.03, d: 0.9, color: '#20242b' });
  const lights = [
    addBox(mesh, { x: -0.35, y: 1.57, z: -0.12, w: 0.52, h: 0.16, d: 0.34, color: [255, 48, 48] }),
    addBox(mesh, { x: 0.35, y: 1.57, z: -0.12, w: 0.52, h: 0.16, d: 0.34, color: [48, 96, 255] }),
  ];

  car.bodyBox = bodyBox;
  car.lights = lights;
  car.baseColor = bodyBox.color.slice();
  car.health = HITS_TO_DISABLE;
  car.disabled = false;
  car.active = false;
  car.flash = 0;

  car.setActive = function setActive(value) {
    this.active = value;
    mesh.visible = value;
  };

  car.takeHit = function takeHit() {
    if (!this.active || this.disabled) return false;
    this.health -= 1;
    this.flash = 0.16;
    if (this.health <= 0) {
      this.disabled = true;
      this.speed = 0;
      this.bodyBox.color = [72, 74, 78];
      lights[0].color = [28, 28, 30];
      lights[1].color = [28, 28, 30];
    }
    return true;
  };

  return car;
}

export function createPoliceForce(scene, city) {
  const pool = [];
  const cars = [];
  const sparks = [];
  let wanted = 0;
  let evade = 0;
  let chase = 0;
  let spawnTimer = 0;
  let lightTime = 0;

  function standDown() {
    wanted = 0;
    evade = 0;
    chase = 0;
    spawnTimer = 0;
    for (const car of cars) car.setActive(false);
    cars.length = 0;
  }

  function setWanted(value) {
    wanted = Math.max(0, Math.min(5, Math.floor(value)));
    if (wanted === 0) standDown();
  }

  function spawn(target) {
    let car = pool.find((item) => !item.active);
    if (!car) {
      if (pool.length >= MAX_CARS) return;
      car = createPoliceCar(scene, city, { x: 0, z: 0, yaw: 0 });
      pool.push(car);
    }
    const point = spawnPoint(city, target);
    car.x = point.x;
    car.z = point.z;
    car.yaw = point.yaw;
    car.speed = 0;
    car.health = HITS_TO_DISABLE;
    car.disabled = false;
    car.flash = 0;
    car.bodyBox.color = car.baseColor.slice();
    car.lights[0].color = [255, 48, 48];
    car.lights[1].color = [48, 96, 255];
    car.mesh.x = car.x;
    car.mesh.z = car.z;
    car.mesh.rotationY = car.yaw;
    car.setActive(true);
    cars.push(car);
  }

  function spawnSparks(x, y, z) {
    let spark = sparks.find((item) => !item.active);
    if (!spark) {
      if (sparks.length >= 10) spark = sparks[0];
      else {
        const mesh = createMesh();
        addBox(mesh, { y: 0, w: 0.16, h: 0.16, d: 0.16, color: [255, 240, 160] });
        addBox(mesh, { x: 0.3, y: 0.18, w: 0.12, h: 0.12, d: 0.12, color: [255, 170, 70] });
        addBox(mesh, { x: -0.26, y: 0.26, w: 0.1, h: 0.1, d: 0.1, color: [255, 210, 90] });
        addBox(mesh, { z: 0.25, y: -0.1, w: 0.1, h: 0.1, d: 0.1, color: [255, 250, 210] });
        addMesh(scene, mesh);
        spark = { mesh, active: false, life: 0, x: 0, y: 0, z: 0, vx: 0, vz: 0 };
        sparks.push(spark);
      }
    }
    spark.active = true;
    spark.life = SPARK_LIFE;
    spark.x = x;
    spark.y = y;
    spark.z = z;
    spark.vx = (Math.random() - 0.5) * 3;
    spark.vz = (Math.random() - 0.5) * 3;
    spark.mesh.visible = true;
  }

  function updateSparks(dt) {
    for (const spark of sparks) {
      if (!spark.active) continue;
      spark.life -= dt;
      spark.x += spark.vx * dt;
      spark.z += spark.vz * dt;
      spark.y += 2.2 * dt;
      spark.mesh.x = spark.x;
      spark.mesh.y = spark.y;
      spark.mesh.z = spark.z;
      spark.mesh.rotationY += dt * 5;
      const k = Math.max(0, spark.life / SPARK_LIFE);
      for (const box of spark.mesh.boxes) {
        box.color = [255, Math.round(120 + 120 * k), Math.round(40 + 120 * k)];
      }
      if (spark.life <= 0) {
        spark.active = false;
        spark.mesh.visible = false;
      }
    }
  }

  function update(dt, target, others) {
    updateSparks(dt);
    if (wanted <= 0) return;

    chase += dt;
    const targetCount = Math.min(MAX_CARS, wanted + Math.floor(chase / 12));
    spawnTimer -= dt;
    if (cars.length < targetCount && spawnTimer <= 0) {
      spawn(target);
      spawnTimer = SPAWN_DELAY;
    }

    const collisions = cars.concat(others || []);
    let seen = false;
    for (const car of cars) {
      if (car.disabled) {
        car.speed *= Math.exp(-6 * dt);
        car.mesh.x = car.x;
        car.mesh.z = car.z;
        car.mesh.rotationY = car.yaw;
        continue;
      }
      if (car.distanceTo(target.x, target.z) < SIGHT) seen = true;
      const dx = target.x - car.x;
      const dz = target.z - car.z;
      const distance = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      const steer = Math.max(-1, Math.min(1, wrap(desired - car.yaw) * 2.4));
      const throttle = distance < 3.2 ? 0.35 : (distance < 12 ? 0.8 : 1);
      car.step({ throttle, steer }, dt, collisions);
    }

    lightTime += dt;
    const phase = Math.floor(lightTime / 0.16) % 2;
    for (const car of cars) {
      if (car.disabled) continue;
      if (car.flash > 0) {
        car.flash -= dt;
        car.bodyBox.color = [255, 245, 220];
        if (car.flash <= 0) car.bodyBox.color = car.baseColor.slice();
      }
      car.lights[0].color = phase ? [255, 40, 40] : [80, 18, 18];
      car.lights[1].color = phase ? [30, 50, 110] : [60, 110, 255];
    }

    if (seen) evade = 0;
    else {
      evade += dt;
      if (evade >= EVADE_SECONDS) {
        setWanted(wanted - 1);
        evade = 0;
      }
    }
  }

  function bumps(x, z, radius) {
    for (const car of cars) {
      if (!car.disabled && car.distanceTo(x, z) < radius + car.radius) return true;
    }
    return false;
  }

  function shoot(ox, oz, dx, dz, range = 62) {
    let hit = null;
    let nearest = Infinity;
    for (const car of cars) {
      if (car.disabled) continue;
      const rx = car.x - ox;
      const rz = car.z - oz;
      const along = rx * dx + rz * dz;
      if (along < 0 || along > range) continue;
      if (Math.abs(rx * dz - rz * dx) > car.radius + 0.6) continue;
      if (along < nearest) {
        nearest = along;
        hit = car;
      }
    }
    if (!hit) return null;
    hit.takeHit();
    spawnSparks(ox + dx * nearest, 1.05, oz + dz * nearest);
    return hit;
  }

  return {
    cars,
    get wanted() { return wanted; },
    setWanted,
    update,
    bumps,
    shoot,
    clear: standDown,
  };
}
