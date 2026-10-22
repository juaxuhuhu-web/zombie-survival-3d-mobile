import * as THREE from 'three';
import './style.css';

const canvas = document.querySelector('#world');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9a99e');
scene.fog = new THREE.Fog('#a9a99e', 27, 76);

const camera = new THREE.PerspectiveCamera(59, 1, 0.1, 120);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

scene.add(new THREE.HemisphereLight('#d9e0d5', '#363a31', 2.1));
const sun = new THREE.DirectionalLight('#ffe0b0', 3.2);
sun.position.set(-12, 22, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -28;
sun.shadow.camera.right = 28;
sun.shadow.camera.top = 28;
sun.shadow.camera.bottom = -28;
scene.add(sun);

const material = (color, roughness = 0.9, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const materials = {
  asphalt: material('#464945'), concrete: material('#77766d'), brick: material('#765b4a'),
  darkBrick: material('#514a40'), glass: material('#333d3a', 0.3, 0.25),
  rust: material('#704a34'), metal: material('#555b56', 0.48, 0.45),
  foliage: material('#475243'), trunk: material('#554839'), sand: material('#958b72'),
  player: material('#536052'), pants: material('#333b38'), skin: material('#b7a18a'),
  zombie: material('#8b9880'), zombieDark: material('#4b574c'), blood: material('#713e35'),
};

const solidMeshes = [];
const ground = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), materials.asphalt);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const obstacles = [];
function isBlocked(position, radius) {
  return obstacles.some((obstacle) => (
    Math.abs(position.x - obstacle.x) < obstacle.width / 2 + radius
    && Math.abs(position.z - obstacle.z) < obstacle.depth / 2 + radius
  ));
}

function moveWithCollision(position, direction, distance, radius) {
  const nextX = position.x + direction.x * distance;
  if (!isBlocked({ x: nextX, z: position.z }, radius)) position.x = nextX;
  const nextZ = position.z + direction.z * distance;
  if (!isBlocked({ x: position.x, z: nextZ }, radius)) position.z = nextZ;
}

function box(parent, size, position, mat, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeBuilding(x, z, width, height, depth, tint, seed) {
  obstacles.push({ x, z, width, depth });
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const wall = material(tint);
  const body = box(group, [width, height, depth], [0, height / 2, 0], wall);
  solidMeshes.push(body);
  box(group, [width + 0.55, 0.38, depth + 0.55], [0, height + 0.19, 0], materials.darkBrick);
  const floors = Math.max(2, Math.floor(height / 2.2));
  const cols = Math.max(2, Math.floor(width / 1.65));
  for (let row = 0; row < floors; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const wx = -width / 2 + (col + 0.5) * width / cols;
      const wy = 1.25 + row * (height - 1.2) / floors;
      box(group, [0.68, 0.88, 0.09], [wx, wy, depth / 2 + 0.055], materials.glass, false);
      box(group, [0.75, 0.11, 0.16], [wx, wy - 0.5, depth / 2 + 0.08], materials.concrete, false);
      if ((row + col + seed) % 4 === 0) {
        box(group, [0.18, 0.42, 0.12], [wx + 0.12, wy, depth / 2 + 0.12], material('#b7824e', 0.55), false);
      }
    }
  }
  scene.add(group);
}

makeBuilding(-11, -10, 8, 10, 7, '#69655b', 1);
makeBuilding(11, -12, 9, 13, 8, '#786957', 3);
makeBuilding(-12, 11, 8, 8, 7, '#605f57', 2);
makeBuilding(12, 12, 10, 11, 8, '#74665b', 5);
makeBuilding(0, -23, 18, 15, 8, '#706c60', 4);

const roadStripe = material('#aaa48a');
for (let z = -18; z <= 18; z += 6) box(scene, [0.16, 0.012, 2.4], [0, 0.012, z], roadStripe, false);
const curbMat = material('#76746c');
for (const side of [-1, 1]) {
  box(scene, [0.45, 0.3, 44], [side * 7.6, 0.15, -1], curbMat);
  for (let z = -18; z <= 17; z += 7) {
    const crate = box(scene, [1.1, 0.8, 1.1], [side * (8.7 + Math.random() * 2), 0.4, z + Math.random() * 2], materials.rust);
    crate.rotation.y = Math.random() * 0.7;
  }
}

for (const [x, z] of [[-18, -3], [18, 2], [-18, 18], [18, -20], [4, 20], [-5, -18]]) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 2.4, 6), materials.trunk);
  trunk.position.y = 1.2;
  trunk.castShadow = true;
  tree.add(trunk);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), materials.foliage);
  crown.position.y = 3.1;
  crown.scale.set(1.1, 1.2, 1);
  crown.castShadow = true;
  tree.add(crown);
  scene.add(tree);
}

const player = new THREE.Group();
scene.add(player);
const torso = new THREE.Group();
player.add(torso);
const torsoMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.7, 4, 8), materials.player);
torsoMesh.position.y = 1.15;
torsoMesh.castShadow = true;
torso.add(torsoMesh);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), materials.skin);
head.position.set(0, 1.9, 0);
head.castShadow = true;
torso.add(head);
box(torso, [0.62, 0.16, 0.43], [0, 1.7, -0.01], materials.darkBrick);
const playerLegs = [];
const playerArms = [];
function limb(parent, x, y, z, length, width, mat, list) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const part = new THREE.Mesh(new THREE.BoxGeometry(width, length, width), mat);
  part.position.y = -length / 2;
  part.castShadow = true;
  pivot.add(part);
  parent.add(pivot);
  list.push(pivot);
  return pivot;
}
limb(torso, -0.19, 0.76, 0, 0.82, 0.23, materials.pants, playerLegs);
limb(torso, 0.19, 0.76, 0, 0.82, 0.23, materials.pants, playerLegs);
limb(torso, -0.49, 1.54, -0.03, 0.72, 0.19, materials.player, playerArms);
limb(torso, 0.49, 1.54, -0.03, 0.72, 0.19, materials.player, playerArms);
const gun = new THREE.Group();
gun.position.set(0.32, 1.34, -0.55);
box(gun, [0.16, 0.18, 0.62], [0, 0, -0.08], materials.metal);
box(gun, [0.13, 0.3, 0.17], [0, -0.18, 0.08], materials.darkBrick);
torso.add(gun);

const weapons = [
  { name: 'SERVICE PISTOL', mode: 'SEMI-AUTO', magSize: 12, mag: 12, reserve: 72, damage: 2, interval: 0.28, reload: 1.15 },
  { name: 'PATROL RIFLE', mode: 'FULL-AUTO', magSize: 30, mag: 30, reserve: 150, damage: 1, interval: 0.105, reload: 1.55 },
];
let weaponIndex = 0;
const zombies = [];
const pickups = [];
const tracers = [];
let health = 100;
let armor = 0;
let stamina = 100;
let wave = 0;
let score = 0;
let running = false;
let gameOver = false;
let waveRemaining = 0;
let spawnClock = 0;
let shootClock = 0;
let hitClock = 0;
let reloadClock = 0;
let reloadingWeaponIndex = null;
let meleeClock = 0;
let staminaDelay = 0;
let aimYaw = 0;
let toastClock = 0;
let stickX = 0;
let stickY = 0;
let fireHeld = false;
let sprintHeld = false;
let lastTime = 0;

const vectorForward = () => new THREE.Vector3(-Math.sin(aimYaw), 0, -Math.cos(aimYaw));
const waveElement = document.querySelector('#wave');
const overlay = document.querySelector('#overlay');
const startButton = document.querySelector('#start');

function makeZombie(position) {
  const group = new THREE.Group();
  group.position.copy(position);
  const body = new THREE.Group();
  group.add(body);
  const typeRoll = Math.random();
  const type = wave >= 3 && typeRoll > 0.8 ? 'brute' : wave >= 2 && typeRoll < 0.27 ? 'runner' : 'walker';
  const skin = material(type === 'brute' ? '#9a7967' : ['#8b9880', '#998877', '#737f73'][Math.floor(Math.random() * 3)]);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.64, 3, 7), materials.zombieDark);
  torso.position.y = 1.12;
  torso.castShadow = true;
  body.add(torso);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
  skull.position.y = 1.87;
  skull.castShadow = true;
  skull.userData.hitZone = 'head';
  body.add(skull);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#cf563a' });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), eyeMat);
    eye.position.set(side * 0.095, 1.9, -0.22);
    body.add(eye);
  }
  const legs = [];
  const arms = [];
  limb(body, -0.19, 0.72, 0, 0.78, 0.22, materials.zombieDark, legs);
  limb(body, 0.19, 0.72, 0, 0.78, 0.22, materials.zombieDark, legs);
  limb(body, -0.49, 1.54, 0, 0.72, 0.18, skin, arms);
  limb(body, 0.49, 1.54, 0, 0.72, 0.18, skin, arms);
  const zombie = {
    group, body, legs, arms, skin, eyeMat, type,
    health: (type === 'brute' ? 5 : type === 'runner' ? 1 : 2) + Math.floor(wave * 0.16),
    speed: (type === 'brute' ? 0.62 : type === 'runner' ? 1.35 : 0.8 + Math.random() * 0.25) + wave * 0.025,
    damage: type === 'brute' ? 20 : type === 'runner' ? 8 : 12,
    phase: Math.random() * 6,
  };
  body.traverse((child) => {
    if (child.isMesh) child.userData.enemy = zombie;
  });
  scene.add(group);
  zombies.push(zombie);
}

function beginWave() {
  wave += 1;
  waveElement.textContent = String(wave).padStart(2, '0');
  waveRemaining = Math.min(4 + wave * 2, 18);
  spawnClock = 0.35;
  showCallout(`WAVE ${String(wave).padStart(2, '0')} INBOUND`);
}

function showCallout(message) {
  const element = document.querySelector('#callout');
  element.textContent = message;
  element.classList.add('visible');
  window.setTimeout(() => element.classList.remove('visible'), 1800);
}

function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('visible');
  toastClock = 1.6;
}

function updateHud() {
  document.querySelector('#health-label').textContent = Math.ceil(health);
  document.querySelector('#health-bar').style.width = `${Math.max(0, health)}%`;
  document.querySelector('#armor-label').textContent = String(Math.ceil(armor)).padStart(2, '0');
  document.querySelector('#stamina-label').textContent = String(Math.ceil(stamina));
  document.querySelector('#stamina-bar').style.width = `${Math.max(0, stamina)}%`;
  document.querySelector('#threats').textContent = zombies.length + waveRemaining;
  document.querySelector('#score').textContent = String(score).padStart(6, '0');
  const weapon = weapons[weaponIndex];
  document.querySelector('#weapon-name').textContent = weapon.name;
  document.querySelector('#weapon-mode').textContent = weapon.mode;
  document.querySelector('#ammo-mag').textContent = String(weapon.mag).padStart(2, '0');
  document.querySelector('#ammo-reserve').textContent = String(weapon.reserve).padStart(2, '0');
  document.querySelectorAll('.weapon-slot').forEach((button, index) => button.classList.toggle('selected', index === weaponIndex));
}

function switchWeapon(index) {
  weaponIndex = index;
  updateHud();
}

function startReload() {
  const weapon = weapons[weaponIndex];
  if (!running || reloadClock > 0 || weapon.mag === weapon.magSize || weapon.reserve <= 0) return;
  reloadingWeaponIndex = weaponIndex;
  reloadClock = weapon.reload;
  toast('RELOADING');
}

function finishReload() {
  const weapon = weapons[reloadingWeaponIndex];
  const amount = Math.min(weapon.magSize - weapon.mag, weapon.reserve);
  weapon.mag += amount;
  weapon.reserve -= amount;
  reloadingWeaponIndex = null;
  updateHud();
}

function eliminateZombie(target) {
  const index = zombies.indexOf(target);
  if (index < 0) return;
  zombies.splice(index, 1);
  scene.remove(target.group);
  target.skin.dispose();
  target.eyeMat.dispose();
  score += target.type === 'brute' ? 150 : target.type === 'runner' ? 125 : 100;
  if (score % 500 === 0 || Math.random() < 0.24) dropPickup(target.group.position);
}

function damageZombie(target, amount, headshot = false) {
  target.health -= amount * (headshot ? 2.5 : 1);
  if (headshot) toast('HEADSHOT');
  if (target.health <= 0) eliminateZombie(target);
}

function takeDamage(amount) {
  const absorbed = Math.min(armor, amount * 0.75);
  armor -= absorbed;
  health = Math.max(0, health - (amount - absorbed));
  updateHud();
  if (health <= 0) endGame();
}

function meleeAttack() {
  if (!running || meleeClock > 0) return;
  meleeClock = 0.72;
  playerArms[0].rotation.x = -1.15;
  const facing = vectorForward();
  let closest = null;
  let closestDistance = 1.9;
  for (const zombie of zombies) {
    const offset = zombie.group.position.clone().sub(player.position);
    const distance = offset.length();
    if (distance > closestDistance || distance === 0) continue;
    if (facing.dot(offset.normalize()) < 0.15) continue;
    closest = zombie;
    closestDistance = distance;
  }
  if (!closest) return;
  damageZombie(closest, 2.5);
  if (zombies.includes(closest)) {
    closest.group.position.addScaledVector(facing, 0.65);
    toast('INFECTED STAGGERED');
  } else {
    toast('MELEE TAKEDOWN');
  }
}

function fire() {
  const weapon = weapons[weaponIndex];
  if (!running || reloadClock > 0 || shootClock > 0) return;
  if (weapon.mag <= 0) {
    startReload();
    return;
  }
  shootClock = weapon.interval;
  weapon.mag -= 1;
  updateHud();
  playerArms[0].rotation.x = -0.52;
  playerArms[1].rotation.x = -0.52;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hitMeshes = [];
  for (const zombie of zombies) zombie.body.traverse((child) => { if (child.isMesh) hitMeshes.push(child); });
  const hits = raycaster.intersectObjects([...solidMeshes, ...hitMeshes], false);
  const hit = hits[0];
  const target = hit?.object.userData.enemy;
  const origin = new THREE.Vector3();
  gun.getWorldPosition(origin);
  const destination = hit ? hit.point : raycaster.ray.at(34, new THREE.Vector3());
  const tracerGeometry = new THREE.BufferGeometry().setFromPoints([origin, destination]);
  const tracer = new THREE.Line(tracerGeometry, new THREE.LineBasicMaterial({ color: '#f1d08c', transparent: true, opacity: 0.85 }));
  scene.add(tracer);
  tracers.push({ mesh: tracer, life: 0.075 });

  if (target) {
    damageZombie(target, weapon.damage, hit.object.userData.hitZone === 'head');
  }
}

function dropPickup(position) {
  const group = new THREE.Group();
  group.position.copy(position);
  const type = Math.random() < 0.45 ? 'medical' : Math.random() < 0.82 ? 'ammo' : 'armor';
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.45, 0.56), type === 'armor' ? materials.metal : materials.sand);
  crate.position.y = 0.28;
  crate.castShadow = true;
  group.add(crate);
  const markColor = type === 'medical' ? '#d65e47' : type === 'armor' ? '#d3b76e' : '#d7d0b8';
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), material(markColor));
  cross.position.set(0, 0.55, 0);
  group.add(cross);
  const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.1), material(markColor));
  crossBar.position.set(0, 0.55, 0);
  group.add(crossBar);
  scene.add(group);
  pickups.push({ group, phase: Math.random() * 4, type });
}

function collectPickups() {
  const pistolReserveLimit = 180;
  const rifleReserveLimit = 300;
  for (let index = pickups.length - 1; index >= 0; index -= 1) {
    const pickup = pickups[index];
    if (pickup.group.position.distanceTo(player.position) > 1.6) continue;
    if (pickup.type === 'medical') {
      if (health >= 100) continue;
      health = Math.min(100, health + 35);
      toast('MEDKIT +35');
    } else if (pickup.type === 'armor') {
      if (armor >= 60) continue;
      armor = Math.min(60, armor + 30);
      toast('ARMOR PLATES +30');
    } else {
      if (weapons[0].reserve >= pistolReserveLimit && weapons[1].reserve >= rifleReserveLimit) continue;
      weapons[0].reserve = Math.min(pistolReserveLimit, weapons[0].reserve + 18);
      weapons[1].reserve = Math.min(rifleReserveLimit, weapons[1].reserve + 30);
      toast('AMMUNITION RECOVERED');
    }
    pickup.group.traverse((child) => { if (child.isMesh && child.material !== materials.sand && child.material !== materials.metal) child.material.dispose(); });
    scene.remove(pickup.group);
    pickups.splice(index, 1);
    updateHud();
  }
}

function endGame() {
  running = false;
  fireHeld = false;
  sprintHeld = false;
  document.querySelector('#sprint').classList.remove('active');
  gameOver = true;
  overlay.classList.remove('hidden');
  document.querySelector('#overlay-title').innerHTML = 'SIGNAL<br /><em>LOST</em>';
  document.querySelector('#overlay-copy').textContent = `You held through ${wave} wave${wave === 1 ? '' : 's'} · ${score} points`;
  startButton.querySelector('span').textContent = 'REDEPLOY';
}

function resetGame() {
  for (const zombie of zombies) {
    scene.remove(zombie.group);
    zombie.skin.dispose();
    zombie.eyeMat.dispose();
  }
  for (const pickup of pickups) {
    scene.remove(pickup.group);
    pickup.group.traverse((child) => { if (child.isMesh && child.material !== materials.sand && child.material !== materials.metal) child.material.dispose(); });
  }
  for (const tracer of tracers) scene.remove(tracer.mesh);
  zombies.length = 0;
  pickups.length = 0;
  tracers.length = 0;
  player.position.set(0, 0, 4);
  player.rotation.set(0, 0, 0);
  aimYaw = 0;
  health = 100;
  armor = 0;
  stamina = 100;
  wave = 0;
  score = 0;
  waveRemaining = 0;
  spawnClock = 0;
  reloadClock = 0;
  reloadingWeaponIndex = null;
  meleeClock = 0;
  staminaDelay = 0;
  fireHeld = false;
  sprintHeld = false;
  for (const weapon of weapons) {
    weapon.mag = weapon.magSize;
    weapon.reserve = weapon.name === 'SERVICE PISTOL' ? 72 : 150;
  }
  switchWeapon(0);
  gameOver = false;
  running = true;
  overlay.classList.add('hidden');
  beginWave();
  updateHud();
}

function pauseGame() {
  if (!running) return;
  running = false;
  fireHeld = false;
  sprintHeld = false;
  document.querySelector('#sprint').classList.remove('active');
  overlay.classList.remove('hidden');
  document.querySelector('#overlay-title').innerHTML = 'HOLD<br /><em>POSITION</em>';
  document.querySelector('#overlay-copy').textContent = 'Catch your breath. The block is still hot.';
  startButton.querySelector('span').textContent = 'RESUME';
}

startButton.addEventListener('click', () => {
  if (!gameOver && wave > 0) {
    running = true;
    overlay.classList.add('hidden');
    return;
  }
  resetGame();
});
document.querySelector('#pause').addEventListener('click', pauseGame);
document.querySelector('#reload').addEventListener('pointerdown', (event) => { event.preventDefault(); startReload(); });
document.querySelectorAll('.weapon-slot').forEach((button) => button.addEventListener('click', () => switchWeapon(Number(button.dataset.weapon))));
document.querySelector('#melee').addEventListener('pointerdown', (event) => { event.preventDefault(); meleeAttack(); });

const joystick = document.querySelector('#joystick');
const stick = document.querySelector('#stick');
let joystickPointer = null;
function updateStick(event) {
  const bounds = joystick.getBoundingClientRect();
  const dx = event.clientX - (bounds.left + bounds.width / 2);
  const dy = event.clientY - (bounds.top + bounds.height / 2);
  const radius = bounds.width * 0.31;
  const distance = Math.hypot(dx, dy);
  const scale = distance > radius ? radius / distance : 1;
  stickX = dx * scale / radius;
  stickY = -dy * scale / radius;
  stick.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
}
joystick.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  joystickPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  updateStick(event);
});
joystick.addEventListener('pointermove', (event) => { if (event.pointerId === joystickPointer) updateStick(event); });
function releaseStick() {
  joystickPointer = null;
  stickX = 0;
  stickY = 0;
  stick.style.transform = 'translate(0, 0)';
}
joystick.addEventListener('pointerup', releaseStick);
joystick.addEventListener('pointercancel', releaseStick);

const fireButton = document.querySelector('#fire');
fireButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  fireButton.setPointerCapture(event.pointerId);
  fireHeld = true;
  fire();
});
fireButton.addEventListener('pointerup', () => { fireHeld = false; });
fireButton.addEventListener('pointercancel', () => { fireHeld = false; });
fireButton.addEventListener('lostpointercapture', () => { fireHeld = false; });

const sprintButton = document.querySelector('#sprint');
function setSprint(held) {
  sprintHeld = held;
  sprintButton.classList.toggle('active', held);
}
sprintButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  sprintButton.setPointerCapture(event.pointerId);
  setSprint(true);
});
sprintButton.addEventListener('pointerup', () => setSprint(false));
sprintButton.addEventListener('pointercancel', () => setSprint(false));
sprintButton.addEventListener('lostpointercapture', () => setSprint(false));

let aimPointer = null;
let lastAimX = 0;
canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse') return;
  if (event.clientX < window.innerWidth * 0.38) return;
  aimPointer = event.pointerId;
  lastAimX = event.clientX;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== aimPointer) return;
  aimYaw += (event.clientX - lastAimX) * 0.006;
  lastAimX = event.clientX;
});
canvas.addEventListener('pointerup', () => { aimPointer = null; });
canvas.addEventListener('pointercancel', () => { aimPointer = null; });

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  if (event.code === 'KeyR') startReload();
  if (event.code === 'KeyQ') switchWeapon(1 - weaponIndex);
  if (event.code === 'KeyE') meleeAttack();
  if (event.code === 'Space') { event.preventDefault(); fireHeld = true; fire(); }
  if (event.code === 'Escape') pauseGame();
});
window.addEventListener('keyup', (event) => { if (event.code === 'Space') fireHeld = false; });
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse' && event.buttons === 2) aimYaw -= event.movementX * 0.004;
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

function update(delta, elapsed) {
  shootClock = Math.max(0, shootClock - delta);
  hitClock = Math.max(0, hitClock - delta);
  meleeClock = Math.max(0, meleeClock - delta);
  if (toastClock > 0) {
    toastClock -= delta;
    if (toastClock <= 0) document.querySelector('#toast').classList.remove('visible');
  }
  if (!running) return;

  if (fireHeld && weapons[weaponIndex].mode === 'FULL-AUTO') fire();
  const keys = new Set();
  if (window.keyboardState) for (const code of window.keyboardState) keys.add(code);
  const keyX = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const keyY = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const moving = stickX !== 0 || stickY !== 0 || keyX !== 0 || keyY !== 0;
  const sprinting = (sprintHeld || keys.has('ShiftLeft') || keys.has('ShiftRight')) && moving && stamina > 0;
  if (sprinting) {
    stamina = Math.max(0, stamina - delta * 30);
    staminaDelay = 0.85;
  } else if (staminaDelay > 0) {
    staminaDelay = Math.max(0, staminaDelay - delta);
  } else {
    stamina = Math.min(100, stamina + delta * 22);
  }
  sprintButton.classList.toggle('active', sprinting);
  let moveX = stickX + keyX;
  let moveY = stickY + keyY;
  const length = Math.hypot(moveX, moveY);
  if (length > 1) { moveX /= length; moveY /= length; }
  const forward = vectorForward();
  const right = new THREE.Vector3(Math.cos(aimYaw), 0, -Math.sin(aimYaw));
  const direction = right.multiplyScalar(moveX).add(forward.multiplyScalar(moveY));
  if (direction.lengthSq() > 0.01) {
    direction.normalize();
    moveWithCollision(player.position, direction, delta * (sprinting ? 7 : 4.2), 0.42);
    player.rotation.y = Math.atan2(-direction.x, -direction.z);
    const gait = Math.sin(elapsed * 10) * Math.min(1, Math.hypot(moveX, moveY));
    playerLegs[0].rotation.x = gait * 0.58;
    playerLegs[1].rotation.x = -gait * 0.58;
    playerArms[0].rotation.x = -0.35 + gait * 0.25;
    playerArms[1].rotation.x = -0.35 - gait * 0.25;
  } else {
    playerLegs.forEach((leg) => { leg.rotation.x *= 0.8; });
    playerArms.forEach((arm) => { arm.rotation.x *= 0.8; });
  }
  player.position.x = THREE.MathUtils.clamp(player.position.x, -21, 21);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -24, 23);
  player.rotation.y = aimYaw;

  const facing = vectorForward();
  const desiredCamera = player.position.clone().addScaledVector(facing, -5.6).add(new THREE.Vector3(0, 3.15, 0));
  camera.position.lerp(desiredCamera, 1 - Math.pow(0.001, delta));
  const aimTarget = player.position.clone().addScaledVector(facing, 18);
  camera.lookAt(aimTarget.x, player.position.y + 1.3, aimTarget.z);

  if (reloadClock > 0) {
    reloadClock -= delta;
    if (reloadClock <= 0) finishReload();
  }
  spawnClock -= delta;
  if (waveRemaining > 0 && spawnClock <= 0) {
    let position;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 15 + Math.random() * 7;
      position = player.position.clone().add(new THREE.Vector3(Math.sin(angle) * distance, 0, Math.cos(angle) * distance));
      position.x = THREE.MathUtils.clamp(position.x, -21, 21);
      position.z = THREE.MathUtils.clamp(position.z, -24, 23);
      if (!isBlocked(position, 0.45)) break;
    }
    makeZombie(position);
    waveRemaining -= 1;
    spawnClock = Math.max(0.58, 1.45 - wave * 0.035);
  }
  for (const zombie of zombies) {
    const toPlayer = player.position.clone().sub(zombie.group.position);
    const distance = toPlayer.length();
    if (distance > 0.6) {
      toPlayer.normalize();
      moveWithCollision(zombie.group.position, toPlayer, zombie.speed * delta, 0.42);
      zombie.group.rotation.y = Math.atan2(-toPlayer.x, -toPlayer.z);
    }
    const stride = Math.sin(elapsed * 7 + zombie.phase);
    zombie.legs[0].rotation.x = stride * 0.62;
    zombie.legs[1].rotation.x = -stride * 0.62;
    zombie.arms[0].rotation.x = -1.0 + stride * 0.18;
    zombie.arms[1].rotation.x = -1.0 - stride * 0.18;
    if (distance < 1.35 && hitClock <= 0) {
      takeDamage(zombie.damage);
      hitClock = 0.8;
      if (health <= 0) break;
    }
  }
  if (gameOver) return;
  if (waveRemaining === 0 && zombies.length === 0) {
    spawnClock -= delta;
    if (spawnClock <= 0) beginWave();
  }
  for (const pickup of pickups) {
    pickup.group.position.y = Math.sin(elapsed * 2 + pickup.phase) * 0.1;
    pickup.group.rotation.y += delta * 0.7;
  }
  collectPickups();
  for (let index = tracers.length - 1; index >= 0; index -= 1) {
    const tracer = tracers[index];
    tracer.life -= delta;
    tracer.mesh.material.opacity = Math.max(0, tracer.life / 0.075);
    if (tracer.life <= 0) {
      scene.remove(tracer.mesh);
      tracer.mesh.geometry.dispose();
      tracer.mesh.material.dispose();
      tracers.splice(index, 1);
    }
  }
  updateHud();
}

window.keyboardState = new Set();
window.addEventListener('keydown', (event) => window.keyboardState.add(event.code));
window.addEventListener('keyup', (event) => window.keyboardState.delete(event.code));

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.fov = width < height ? 66 : 59;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
window.addEventListener('resize', resize);
resize();
camera.position.set(0, 4.5, 10);
camera.lookAt(0, 1, 4);
updateHud();

function animate(time) {
  requestAnimationFrame(animate);
  const delta = Math.min(0.05, (time - lastTime) / 1000 || 0);
  lastTime = time;
  update(delta, time / 1000);
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);