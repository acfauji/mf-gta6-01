import { createRenderer, createScene } from './vendor/three.min.js';
import { CELL, WORLD, createCity } from './city.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createCar } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createPoliceForce } from './police.js';
import { createMission } from './missions.js';
import { createAudio } from './audio.js';

const STEP = 1 / 60;
const canvas = document.getElementById('game');
const hudMode = document.getElementById('mode');
const hudSpeed = document.getElementById('speed');
const hudHealth = document.getElementById('health');
const hudWanted = document.getElementById('wanted');
const hudMission = document.getElementById('mission');
const hudBadge = document.getElementById('missionBadge');
const missionPanel = document.getElementById('missionPanel');
const missionMeter = document.getElementById('missionMeterFill');
const hudHint = document.getElementById('hint');
const crosshair = document.getElementById('crosshair');
const speedlines = document.getElementById('speedlines');
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
const audio = createAudio();

const CAR_COLORS = ['#d95c4a', '#e9c14e', '#4f8ba8', '#7fa65c', '#b76f9c', '#d98b4f', '#5d6fa8', '#c9c3ae'];
const spots = [{ x: startX + 4.6, z: startZ, yaw: Math.PI / 2 }, ...city.parkedSpots];
const parked = spots.slice(0, 8).map((spot, i) => createCar(scene, city, {
  x: spot.x, z: spot.z, yaw: spot.yaw, color: CAR_COLORS[i % CAR_COLORS.length], controllable: true,
}));
const initialParked = parked.map((car) => ({ x: car.x, z: car.z, yaw: car.yaw }));
const traffic = createTraffic(scene, city);
const force = createPoliceForce(scene, city);
const mission = createMission(scene);
parked[0].owned = true;
const allCars = parked.concat(traffic.cars);

const view = { yaw: 0, pitch: -0.13, fov: 72 };
const look = { yaw: 0, pitch: -0.13 };
const camera = { x: startX, y: 3, z: startZ - 6, yaw: 0, pitch: -0.13, fov: 72 };
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

let state = 'title';
let driving = null;
let firstPerson = false;
let frames = 0;
let shotFrames = 0;
let shotCooldown = 0;
let crosshairFlash = 0;
let recoil = 0;
let shake = 0;
let fovKick = 0;
let titleTime = 0;
let shotCamera = false;
let accumulator = 0;
let missionInfo = { stage: 'go', text: 'Go to the store', event: null, distance: 0, hold: 0 };

function setText(element, value) {
  if (element.textContent !== value) element.textContent = value;
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setState(next) {
  state = next;
  document.body.dataset.state = next;
  title.classList.toggle('hidden', next !== 'title');
  pausePanel.classList.toggle('hidden', next !== 'paused');
  audio.setPaused(next === 'paused');
  accumulator = 0;
  if (next !== 'playing') speedlines.style.opacity = '0';
}

function resetWorld() {
  if (driving) driving.speed = 0;
  driving = null;
  firstPerson = false;
  shotCamera = false;
  recoil = 0;
  shake = 0;
  fovKick = 0;
  crosshairFlash = 0;
  shotCooldown = 0;
  look.yaw = 0;
  look.pitch = -0.13;
  view.yaw = 0;
  view.pitch = -0.13;
  view.fov = 72;
  camera.x = startX;
  camera.y = 3;
  camera.z = startZ - 6;
  camera.fov = 72;
  player.revive();
  player.setActive(true);
  player.place(startX, startZ, 0);
  for (let i = 0; i < parked.length; i++) {
    const car = parked[i];
    const origin = initialParked[i];
    car.x = origin.x;
    car.z = origin.z;
    car.yaw = origin.yaw;
    car.speed = 0;
    car.stolen = false;
    car.mesh.x = car.x;
    car.mesh.z = car.z;
    car.mesh.rotationY = car.yaw;
  }
  parked[0].owned = true;
  traffic.reset();
  force.clear();
  mission.reset();
  missionInfo = mission.update(0, player.x, player.z, 0);
  audio.engine(0, false);
  audio.siren(0);
  if (document.pointerLockElement) document.exitPointerLock();
}

function startGame() {
  if (state !== 'title') return;
  audio.unlock();
  setState('playing');
  status.textContent = 'SUNBLAZE city ready. Go to the store.';
}

function pauseGame() {
  if (state !== 'playing') return;
  setState('paused');
  status.textContent = 'Paused.';
}

function resumeGame() {
  if (state !== 'paused') return;
  setState('playing');
  status.textContent = 'Playing.';
}

function restartGame() {
  resetWorld();
  audio.unlock();
  setState('playing');
  status.textContent = 'Fresh run. Go to the store.';
}

function quitToTitle() {
  resetWorld();
  setState('title');
  status.textContent = 'Back to the title screen.';
}

function applyLook(dt) {
  if (state !== 'playing') {
    input.mouse();
    return;
  }
  const delta = input.mouse();
  if (delta.x || delta.y) {
    look.yaw = wrapAngle(look.yaw + delta.x * 0.0022);
    look.pitch = clamp(look.pitch - delta.y * 0.002, -1.05, 0.75);
  }
  const ease = 1 - Math.exp(-dt * 22);
  view.yaw += wrapAngle(look.yaw - view.yaw) * ease;
  view.pitch += (look.pitch - view.pitch) * ease;
}

function cameraDistance(wanted, x, z) {
  let distance = wanted;
  while (distance > 1.3 && city.collides(x - Math.sin(view.yaw) * distance, z - Math.cos(view.yaw) * distance, 0.55)) {
    distance -= 0.6;
  }
  return distance;
}

function updateCamera(dt) {
  let tx, ty, tz, targetFov;
  if (firstPerson && !driving) {
    tx = player.x + Math.sin(view.yaw) * 0.15;
    ty = player.y + 1.76;
    tz = player.z + Math.cos(view.yaw) * 0.15;
    targetFov = 76;
  } else if (driving) {
    const distance = cameraDistance(8.4, driving.x, driving.z);
    tx = driving.x - Math.sin(view.yaw) * distance;
    tz = driving.z - Math.cos(view.yaw) * distance;
    ty = clamp(2.3 - distance * Math.tan(view.pitch), 1.4, 22);
    targetFov = 72 + Math.min(11, Math.abs(driving.speed) * 0.45) + fovKick;
  } else {
    const distance = cameraDistance(6.2, player.x, player.z);
    tx = player.x - Math.sin(view.yaw) * distance;
    tz = player.z - Math.cos(view.yaw) * distance;
    ty = clamp(player.y + 1.7 - distance * Math.tan(view.pitch), 1.4, 20);
    targetFov = 72 + fovKick;
  }
  const rate = firstPerson && !driving ? 30 : driving ? 7 : 11;
  const follow = 1 - Math.exp(-dt * rate);
  camera.x += (tx - camera.x) * follow;
  camera.y += (ty - camera.y) * follow;
  camera.z += (tz - camera.z) * follow;
  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-dt * 5));
  camera.yaw = view.yaw;
  camera.pitch = view.pitch + recoil;
  if (shake > 0.001) {
    camera.x += (Math.random() - 0.5) * shake;
    camera.y += (Math.random() - 0.5) * shake * 0.6;
    camera.z += (Math.random() - 0.5) * shake;
  }
  recoil *= Math.exp(-dt * 11);
  shake *= Math.exp(-dt * 9);
  fovKick *= Math.exp(-dt * 6);
}

function titleCamera(dt) {
  titleTime += dt;
  const angle = 0.22 + titleTime * 0.055;
  const radius = 92;
  const cx = WORLD / 2;
  const cz = WORLD / 2;
  const px = cx + Math.sin(angle) * radius;
  const pz = cz + Math.cos(angle) * radius;
  const py = 30 + Math.sin(titleTime * 0.4) * 5;
  camera.x = px;
  camera.y = py;
  camera.z = pz;
  camera.yaw = Math.atan2(cx - px, cz - pz);
  camera.pitch = -Math.atan2(py - 14, radius);
  camera.fov = 66;
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
  view.yaw = look.yaw = driving.yaw;
  view.pitch = look.pitch = -0.12;
  fovKick = 5;
  audio.chime(0.7);
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
  view.yaw = look.yaw = driving.yaw;
  driving = null;
  status.textContent = 'On foot. Find another car with F.';
}

function handleActions() {
  if (state !== 'playing') return;
  if (input.pressed('KeyV') && !driving) {
    firstPerson = !firstPerson;
    status.textContent = firstPerson ? 'First-person camera.' : 'Third-person camera.';
  }
  if (input.pressed('KeyR')) {
    if (driving) exitCar();
    player.place(startX, startZ, 0);
    view.yaw = look.yaw = 0;
    view.pitch = look.pitch = -0.13;
    status.textContent = 'Back at the start.';
  }
  if (input.pressed('KeyF')) {
    if (driving) exitCar();
    else enterCar();
  }
  if (input.fire() && shotCooldown <= 0) {
    shotCooldown = 0.24;
    crosshairFlash = 1;
    recoil = Math.min(0.14, recoil + 0.06);
    shake = Math.min(0.55, shake + 0.2);
    fovKick = Math.min(9, fovKick + 2.5);
    const shooter = driving || player;
    force.shoot(shooter.x, shooter.z, Math.sin(view.yaw), Math.cos(view.yaw));
    audio.gunshot();
  }
}

function sirenLevel() {
  if (force.wanted <= 0 || !force.cars.length) return 0;
  const target = driving || player;
  let nearest = Infinity;
  for (const car of force.cars) {
    if (!car.disabled) nearest = Math.min(nearest, car.distanceTo(target.x, target.z));
  }
  return clamp(1 - nearest / 85, 0, 1);
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
    shake = Math.min(0.6, shake + 0.25);
    status.textContent = 'The cops hit you! Watch your health.';
  }

  missionInfo = mission.update(dt, target.x, target.z, force.wanted);
  if (missionInfo.event === 'arrived') {
    audio.chime(1);
    status.textContent = 'Hold position to rob the store.';
  } else if (missionInfo.event === 'robbed') {
    force.setWanted(3);
    audio.chime(1.18);
    status.textContent = 'Store robbed! Lose the cops.';
  } else if (missionInfo.event === 'complete') {
    audio.chime(1.5);
    status.textContent = 'Mission complete. Nice work.';
  }

  if (player.health <= 0) {
    player.revive();
    player.place(startX, startZ, 0);
    force.clear();
    status.textContent = 'Busted! You got away with your life.';
  }

  audio.engine(driving ? Math.min(1, Math.abs(driving.speed) / 25) : 0, !!driving);
  audio.siren(sirenLevel());
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

  const stage = missionInfo.stage;
  const badge = stage === 'go' ? 'OBJECTIVE' : stage === 'rob' ? 'HOLD' : stage === 'escape' ? 'WANTED' : 'COMPLETE';
  setText(hudBadge, badge);
  const missionText = stage === 'go' ? `${missionInfo.text} · ${Math.round(missionInfo.distance)} m` : missionInfo.text;
  setText(hudMission, missionText);
  let progress = 0;
  if (stage === 'rob') progress = clamp((missionInfo.hold || 0) / 1.5, 0, 1) * 100;
  else if (stage === 'escape') progress = (5 - force.wanted) / 5 * 100;
  else if (stage === 'done') progress = 100;
  missionPanel.className = `panel stage-${stage}`;
  missionMeter.style.width = `${progress.toFixed(1)}%`;
  crosshair.classList.toggle('hot', crosshairFlash > 0);

  const speedRatio = driving ? Math.min(1, Math.abs(driving.speed) / 25) : 0;
  const lines = clamp((speedRatio - 0.35) / 0.65, 0, 1) * 0.5;
  speedlines.style.opacity = state === 'playing' ? lines.toFixed(3) : '0';

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
  shotCamera = false;
  if (name === 'start') {
    titleTime = 1.4;
    setState('title');
    titleCamera(0);
    status.textContent = 'SUNBLAZE title view.';
    return;
  }
  setState('playing');
  if (name === 'drive') {
    driving = parked[0];
    player.setActive(false);
    view.yaw = look.yaw = driving.yaw;
    view.pitch = look.pitch = -0.18;
  } else if (name === 'sky') {
    player.place(WORLD / 2, WORLD / 2, 0.7);
    view.yaw = look.yaw = 0.7;
    view.pitch = look.pitch = -0.82;
    camera.x = WORLD / 2 - 70;
    camera.y = 150;
    camera.z = WORLD / 2 - 90;
    shotCamera = true;
  } else if (name === 'end') {
    player.place(CELL * 3, CELL * 3 + 12, 0);
    view.yaw = look.yaw = 0.7;
    view.pitch = look.pitch = -0.12;
    force.setWanted(3);
    for (let i = 0; i < 150; i++) force.update(STEP, player, allCars);
  } else {
    player.place(CELL * 3, CELL * 3 + 5, 0);
    view.yaw = look.yaw = 0.34;
    view.pitch = look.pitch = -0.1;
  }
  for (let i = 0; i < 90; i++) traffic.update(STEP);
  status.textContent = `SUNBLAZE ${name} view.`;
}

title.addEventListener('pointerdown', startGame);
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('resumeBtn').addEventListener('click', resumeGame);
document.getElementById('restartBtn').addEventListener('click', restartGame);
document.getElementById('quitBtn').addEventListener('click', quitToTitle);
window.addEventListener('keydown', (event) => {
  if (state === 'title') {
    if (event.code === 'Enter' || event.code === 'NumpadEnter') startGame();
  } else if (state === 'paused') {
    if (event.code === 'KeyP' || event.code === 'Escape' || event.code === 'Enter' || event.code === 'NumpadEnter') resumeGame();
    else if (event.code === 'KeyR') restartGame();
    else if (event.code === 'KeyQ') quitToTitle();
  } else if (state === 'playing') {
    if (event.code === 'KeyP' || event.code === 'Escape') pauseGame();
  }
});

setState('title');
if (shot) stageShot(shot);

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(0.12, Math.max(0, (now - last) / 1000));
  last = now;
  crosshairFlash = Math.max(0, crosshairFlash - elapsed * 5);
  applyLook(elapsed);
  if (state === 'title') {
    traffic.update(Math.min(elapsed, 0.05));
    titleCamera(elapsed);
  } else if (state === 'playing') {
    accumulator += elapsed;
    let guard = 0;
    while (accumulator >= STEP && guard < 8) {
      step(STEP);
      accumulator -= STEP;
      guard++;
    }
    if (!shotCamera) updateCamera(elapsed);
  }
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

requestAnimationFrame(frame);
