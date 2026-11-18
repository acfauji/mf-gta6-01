import { createRenderer, createScene } from './vendor/three.min.js';
import { CELL, WORLD, createCity } from './city.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createCar } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPoliceForce } from './police.js';
import { createMission } from './missions.js';

const STEP = 1 / 60;
const canvas = document.getElementById('game');
const hudMode = document.getElementById('mode');
const hudSpeed = document.getElementById('speed');
const hudHealth = document.getElementById('health');
const hudWanted = document.getElementById('wanted');
const hudMission = document.getElementById('mission');
const hudHint = document.getElementById('hint');
const crosshair = document.getElementById('crosshair');
const title = document.getElementById('title');
const pausePanel = document.getElementById('paused');
const status = document.getElementById('status');
const mapCanvas = document.getElementById('map');
const mapCtx = mapCanvas.getContext('2d');

const renderer = createRenderer(canvas);
const scene = createScene();
const city = createCity(scene);
const startX = CELL * 2;
const startZ = CELL * 2 + 6;
const player = createPlayer(scene, city, startX, startZ);
const input = createInput(canvas);

const CAR_COLORS = ['#d95c4a', '#e9c14e', '#4f8ba8', '#7fa65c', '#b76f9c', '#d98b4f', '#5d6fa8', '#c9c3ae'];
const spots = [{ x: startX + 4.6, z: startZ, yaw: Math.PI / 2 }, ...city.parkedSpots];
const parked = spots.slice(0, 8).map((spot, i) => createCar(scene, city, {
  x: spot.x, z: spot.z, yaw: spot.yaw, color: CAR_COLORS[i % CAR_COLORS.length], controllable: true,
}));
const traffic = createTraffic(scene, city);
const force = createPoliceForce(scene, city);
const mission = createMission(scene);
parked[0].owned = true;
const allCars = parked.concat(traffic.cars);

const view = { yaw: 0, pitch: -0.13, fov: 72 };
const camera = { x: startX, y: 3, z: startZ - 6, yaw: 0, pitch: -0.13, fov: 72 };
let driving = null;
let firstPerson = false;
let paused = false;
let introDone = false;
let frames = 0;
let shotFrames = 0;
let shotCooldown = 0;
let crosshairFlash = 0;
let missionInfo = { stage: 'go', text: 'Go to the store', event: null, distance: 0 };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function dismissIntro() {
  if (introDone) return;
  introDone = true;
  title.classList.add('hidden');
  status.textContent = 'SUNBLAZE city ready.';
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function applyLook() {
  const delta = input.mouse();
  if (delta.x || delta.y) {
    view.yaw = wrapAngle(view.yaw + delta.x * 0.0025);
    view.pitch = Math.max(-1.05, Math.min(0.75, view.pitch - delta.y * 0.0022));
    dismissIntro();
  }
}

function cameraDistance(wanted, x, z) {
  let distance = wanted;
  while (distance > 1.5 && city.collides(x - Math.sin(view.yaw) * distance, z - Math.cos(view.yaw) * distance, 0.5)) {
    distance -= 0.8;
  }
  return distance;
}

function updateCamera() {
  if (firstPerson && !driving) {
    camera.x = player.x + Math.sin(view.yaw) * 0.15;
    camera.y = player.y + 1.76;
    camera.z = player.z + Math.cos(view.yaw) * 0.15;
    camera.fov = 76;
  } else if (driving) {
    const distance = cameraDistance(8.4, driving.x, driving.z);
    camera.x = driving.x - Math.sin(view.yaw) * distance;
    camera.z = driving.z - Math.cos(view.yaw) * distance;
    camera.y = Math.max(1.4, Math.min(22, 2.3 - distance * Math.tan(view.pitch)));
    camera.fov = 72 + Math.min(8, Math.abs(driving.speed) * 0.25);
  } else {
    const distance = cameraDistance(6.2, player.x, player.z);
    camera.x = player.x - Math.sin(view.yaw) * distance;
    camera.z = player.z - Math.cos(view.yaw) * distance;
    camera.y = Math.max(1.4, Math.min(20, player.y + 1.7 - distance * Math.tan(view.pitch)));
    camera.fov = 72;
  }
  camera.yaw = view.yaw;
  camera.pitch = view.pitch;
}

function enterCar() {
  let nearest = null;
  let best = 4.4;
  for (let i = 0; i < parked.length; i++) {
    const distance = parked[i].distanceTo(player.x, player.z);
    if (distance < best) {
      best = distance;
      nearest = parked[i];
    }
  }
  if (!nearest) return;
  driving = nearest;
  player.setActive(false);
  view.yaw = driving.yaw;
  view.pitch = -0.12;
  if (!driving.owned && !driving.stolen) {
    driving.stolen = true;
    force.setWanted(force.wanted + 1);
    status.textContent = 'Car stolen! Police are on the way.';
  } else {
    status.textContent = 'Driving. W and S for gas and brake, A and D to steer.';
  }
}

function exitCar() {
  const sideX = Math.cos(driving.yaw) * 2.8;
  const sideZ = -Math.sin(driving.yaw) * 2.8;
  const place = city.resolve(driving.x + sideX, driving.z + sideZ, player.radius, player.x, player.z);
  player.place(place.x, place.z, driving.yaw);
  player.setActive(true);
  view.yaw = driving.yaw;
  driving = null;
  status.textContent = 'On foot. Find another car with F.';
}

function handleActions() {
  if (input.pressed('KeyP')) {
    paused = !paused;
    pausePanel.classList.toggle('hidden', !paused);
    status.textContent = paused ? 'Paused.' : 'Playing.';
  }
  if (input.pressed('KeyV') && !driving) {
    firstPerson = !firstPerson;
    status.textContent = firstPerson ? 'First-person camera.' : 'Third-person camera.';
  }
  if (input.pressed('KeyR')) {
    if (driving) exitCar();
    player.place(startX, startZ, 0);
    view.yaw = 0;
    view.pitch = -0.13;
    status.textContent = 'Back at the start.';
  }
  if (input.pressed('KeyF')) {
    if (driving) exitCar();
    else enterCar();
  }
  if (!paused && input.fire() && shotCooldown <= 0) {
    shotCooldown = 0.24;
    crosshairFlash = 1;
    const shooter = driving || player;
    force.shoot(shooter.x, shooter.z, Math.sin(view.yaw), Math.cos(view.yaw));
  }
}

function step(dt) {
  if (shotCooldown > 0) shotCooldown = Math.max(0, shotCooldown - dt);
  if (driving) {
    const throttle = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const steer = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    driving.step({ throttle, steer }, dt, allCars);
  } else {
    player.update(dt, input, view);
  }
  traffic.update(dt);

  const target = driving || player;
  const hits = traffic.hitPedestrians(target.x, target.z, driving ? 2.5 : player.radius + 0.3);
  if (hits) force.setWanted(force.wanted + hits);

  force.update(dt, target, allCars);
  if (!driving && force.bumps(player.x, player.z, player.radius) && player.damage(1)) {
    status.textContent = 'The cops hit you! Watch your health.';
  }

  missionInfo = mission.update(dt, target.x, target.z, force.wanted);
  if (missionInfo.event === 'robbed') {
    force.setWanted(3);
    status.textContent = 'Store robbed! Lose the cops.';
  } else if (missionInfo.event === 'complete') {
    status.textContent = 'Mission complete. Nice work.';
  }

  if (player.health <= 0) {
    player.revive();
    player.place(startX, startZ, 0);
    force.clear();
    status.textContent = 'Busted! You got away with your life.';
  }
}

function drawMap() {
  const size = mapCanvas.width;
  const scale = size / WORLD;
  mapCtx.clearRect(0, 0, size, size);
  mapCtx.fillStyle = 'rgba(20,28,34,0.72)';
  mapCtx.fillRect(0, 0, size, size);
  mapCtx.strokeStyle = '#596069';
  mapCtx.lineWidth = 22 * scale;
  for (let i = 0; i <= 9; i++) {
    const p = i * CELL * scale;
    mapCtx.beginPath();
    mapCtx.moveTo(p, 0);
    mapCtx.lineTo(p, size);
    mapCtx.stroke();
    mapCtx.beginPath();
    mapCtx.moveTo(0, p);
    mapCtx.lineTo(size, p);
    mapCtx.stroke();
  }
  mapCtx.fillStyle = '#b69a72';
  for (let i = 0; i < city.blocks.length; i++) {
    const b = city.blocks[i];
    mapCtx.fillRect(b.minX * scale, b.minZ * scale, Math.max(1, (b.maxX - b.minX) * scale), Math.max(1, (b.maxZ - b.minZ) * scale));
  }
  for (let i = 0; i < allCars.length; i++) {
    const car = allCars[i];
    mapCtx.fillStyle = car === driving ? '#ffe07a' : '#8fd0e8';
    mapCtx.fillRect(car.x * scale - 1.5, car.z * scale - 1.5, 3, 3);
  }
  for (let i = 0; i < force.cars.length; i++) {
    const car = force.cars[i];
    const mx = car.x * scale;
    const mz = car.z * scale;
    mapCtx.fillStyle = car.disabled ? '#6d7178' : (frames % 8 < 4 ? '#ff5b6e' : '#6aa8ff');
    mapCtx.fillRect(mx - 2, mz - 2, 4, 4);
  }
  if (mission.stage === 'go' || mission.stage === 'rob') {
    const mx = mission.store.x * scale;
    const mz = mission.store.z * scale;
    mapCtx.fillStyle = '#ffd23f';
    mapCtx.beginPath();
    mapCtx.moveTo(mx, mz - 6);
    mapCtx.lineTo(mx + 5, mz);
    mapCtx.lineTo(mx, mz + 6);
    mapCtx.lineTo(mx - 5, mz);
    mapCtx.closePath();
    mapCtx.fill();
  }
  if (!driving) {
    mapCtx.fillStyle = '#ff6f52';
    mapCtx.beginPath();
    mapCtx.arc(player.x * scale, player.z * scale, 3, 0, Math.PI * 2);
    mapCtx.fill();
  }
}

function updateHud() {
  setText(hudMode, driving ? 'DRIVING' : (firstPerson ? 'ON FOOT · 1ST' : 'ON FOOT · 3RD'));
  setText(hudSpeed, driving ? `${Math.round(Math.abs(driving.speed) * 3.6)} km/h` : `${Math.round(Math.hypot(player.x - startX, player.z - startZ))} m`);
  setText(hudHealth, '♥'.repeat(player.health) + '♡'.repeat(3 - player.health));
  setText(hudWanted, '★'.repeat(force.wanted) + '☆'.repeat(5 - force.wanted));
  hudWanted.classList.toggle('alert', force.wanted > 0);
  const missionText = missionInfo.stage === 'go' ? `${missionInfo.text} · ${Math.round(missionInfo.distance)} m` : missionInfo.text;
  setText(hudMission, `MISSION · ${missionText}`);
  crosshair.classList.toggle('hot', crosshairFlash > 0);

  let hint = 'WASD move · Shift sprint · Space jump · V camera · F car · Click shoot · P pause';
  if (driving) hint = 'W/S gas & brake · A/D steer · F exit · click to shoot';
  else {
    for (let i = 0; i < parked.length; i++) {
      if (parked[i].distanceTo(player.x, player.z) < 4.4) {
        hint = 'Press F to enter this car · click to shoot';
        break;
      }
    }
  }
  setText(hudHint, hint);
  if (frames % 4 === 0) drawMap();
}

function stageShot(name) {
  title.classList.add('hidden');
  if (name === 'drive') {
    driving = parked[0];
    player.setActive(false);
    view.yaw = driving.yaw;
    view.pitch = -0.18;
  } else if (name === 'sky') {
    player.place(WORLD / 2, WORLD / 2, 0.7);
    view.yaw = 0.7;
    view.pitch = -0.82;
    camera.x = WORLD / 2 - 70;
    camera.y = 150;
    camera.z = WORLD / 2 - 90;
  } else {
    player.place(CELL * 3, CELL * 3 + 5, 0);
    view.yaw = 0.34;
    view.pitch = -0.1;
  }
  for (let i = 0; i < 90; i++) traffic.update(STEP);
  status.textContent = `SUNBLAZE ${name} view.`;
}

if (shot) stageShot(shot);

let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(0.12, Math.max(0, (now - last) / 1000));
  last = now;
  crosshairFlash = Math.max(0, crosshairFlash - elapsed * 5);
  applyLook();
  if (!paused) {
    accumulator += elapsed;
    let guard = 0;
    while (accumulator >= STEP && guard < 8) {
      step(STEP);
      accumulator -= STEP;
      guard++;
    }
  }
  updateCamera();
  renderer.render(scene, camera);
  updateHud();
  handleActions();
  input.clearFrame();
  frames++;
  if (shot) {
    shotFrames++;
    if (shotFrames > 3) window.__shotReady = true;
  }
}

window.addEventListener('keydown', dismissIntro);
canvas.addEventListener('pointerdown', dismissIntro);
window.setTimeout(dismissIntro, 2600);
status.textContent = 'SUNBLAZE city ready.';
requestAnimationFrame(frame);
