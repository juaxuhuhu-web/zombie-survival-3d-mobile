import * as THREE from 'three';
import './style.css';
import {
  ITEMS,
  RECIPES,
  attackInfected,
  consumeSelected,
  craft,
  createInitialState,
  emitSound,
  gather,
  normalizeSave,
  placeCampfire,
  tick,
  tileFor,
  worldTimeLabel,
} from './game/simulation.js';

const SAVE_KEY = 'deadzone.openworld.save.v1';
const canvas = document.querySelector('#world');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#83917b');
scene.fog = new THREE.Fog('#83917b', 38, 115);

const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 180);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const ambientLight = new THREE.HemisphereLight('#dce8d4', '#354033', 1.7);
scene.add(ambientLight);
const sun = new THREE.DirectionalLight('#ffe0ae', 2.5);
sun.position.set(-28, 35, 16);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -45;
sun.shadow.camera.right = 45;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
scene.add(sun);

const mat = (color, roughness = 0.9, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const mats = {
  forest: mat('#4b6147'),
  townGround: mat('#656861'),
  road: mat('#464a46'),
  roadMark: mat('#a9a183'),
  treeBark: mat('#4f4437'),
  leaves: mat('#40583e'),
  leavesLight: mat('#5c6947'),
  wall: mat('#746d5b'),
  wallDark: mat('#514c42'),
  glass: mat('#303c3a', 0.35, 0.2),
  rubble: mat('#77756b'),
  player: mat('#596456'),
  pants: mat('#303933'),
  skin: mat('#b59d83'),
  infected: mat('#4c5148'),
  infectedSkin: mat('#879079'),
  resource: mat('#b7a66d'),
  water: mat('#507d80', 0.35),
  firewood: mat('#674a36'),
  fire: new THREE.MeshBasicMaterial({ color: '#ed843e' }),
  spear: mat('#96815b'),
};

const worldState = loadState();
const player = worldState.player;
let running = false;
let lastTime = 0;
let autosaveClock = 0;
let uiClock = 0;
let toastClock = 0;
let lastStepSound = 0;
let yaw = 0;
let pitch = 0.16;
let zoom = 6.4;
let movementX = 0;
let movementY = 0;
let lookX = 0;
let lookY = 0;
let sprintHeld = false;
let crouched = false;
let activeLookPointer = null;
let lookPointers = new Map();
let lastLookX = 0;
let lastLookY = 0;
let pinchDistance = 0;
let elapsed = 0;

const obstacles = [];
const resourceObjects = new Map();
const infectedObjects = new Map();
const campfireObjects = [];
const playerLegs = [];
const playerArms = [];
const playerRoot = new THREE.Group();
const avatar = new THREE.Group();
const keys = new Set();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function loadState() {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    return saved ? normalizeSave(JSON.parse(saved)) ?? createInitialState() : createInitialState();
  } catch (error) {
    console.error('Could not load survival save:', error);
    return createInitialState();
  }
}

function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(worldState));
  } catch (error) {
    console.error('Could not save survival progress:', error);
    showMessage('SAVE FAILED · CHECK DEVICE STORAGE');
  }
}

function box(parent, size, position, material, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addObstacle(x, z, width, depth, height = 6, color = '#716b5c') {
  const building = new THREE.Group();
  building.position.set(x, 0, z);
  const wall = mat(color);
  const shell = box(building, [width, height, depth], [0, height / 2, 0], wall);
  box(building, [width + 0.45, 0.35, depth + 0.45], [0, height + 0.17, 0], mats.wallDark);
  const windows = Math.max(2, Math.floor(width / 2.2));
  for (let index = 0; index < windows; index += 1) {
    const xOffset = -width / 2 + ((index + 0.5) * width) / windows;
    box(building, [0.85, 1.05, 0.08], [xOffset, Math.min(height - 1.25, 2.4), depth / 2 + 0.05], mats.glass, false);
    box(building, [0.92, 0.12, 0.16], [xOffset, Math.min(height - 1.75, 1.87), depth / 2 + 0.1], mats.rubble, false);
  }
  scene.add(building);
  obstacles.push({ x, z, width: width + 0.25, depth: depth + 0.25, height, mesh: shell });
  return building;
}

function isBlocked(x, z, radius = 0.4) {
  return obstacles.some((obstacle) => (
    Math.abs(x - obstacle.x) < obstacle.width / 2 + radius
    && Math.abs(z - obstacle.z) < obstacle.depth / 2 + radius
  ));
}

function moveColliding(x, z, dx, dz, radius = 0.4) {
  const nextX = x + dx;
  if (!isBlocked(nextX, z, radius)) x = nextX;
  const nextZ = z + dz;
  if (!isBlocked(x, nextZ, radius)) z = nextZ;
  return { x, z };
}

function buildWorld() {
  const forest = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), mats.forest);
  forest.rotation.x = -Math.PI / 2;
  forest.position.set(-35, -0.04, 0);
  forest.receiveShadow = true;
  scene.add(forest);
  const town = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), mats.townGround);
  town.rotation.x = -Math.PI / 2;
  town.position.set(35, -0.05, 0);
  town.receiveShadow = true;
  scene.add(town);

  const road = box(scene, [6.2, 0.025, 112], [28, 0, 0], mats.road, false);
  road.receiveShadow = true;
  for (let z = -50; z < 52; z += 8) {
    box(scene, [0.13, 0.03, 3.2], [28, 0.02, z], mats.roadMark, false);
  }

  const creek = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 46), mats.water);
  creek.rotation.x = -Math.PI / 2;
  creek.rotation.z = -0.25;
  creek.position.set(-19, 0.005, 0);
  scene.add(creek);

  addObstacle(13, -8, 10, 12, 7, '#746e60');
  addObstacle(37, 9, 12, 10, 9, '#655f55');
  addObstacle(48, -17, 9, 13, 8, '#777060');
  addObstacle(11, 28, 12, 9, 6, '#6a685d');
  addObstacle(35, -32, 14, 10, 10, '#595b55');
  addObstacle(53, 30, 10, 12, 7, '#796a59');

  let seed = worldState.seed >>> 0;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < 90; index += 1) {
    const x = -57 + random() * 48;
    const z = -52 + random() * 104;
    if (Math.hypot(x + 19, z) < 5 || isBlocked(x, z, 1.7)) continue;
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 2.8, 7), mats.treeBark);
    trunk.position.y = 1.4;
    trunk.castShadow = true;
    tree.add(trunk);
    const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(1.75, 1), random() > 0.5 ? mats.leaves : mats.leavesLight);
    foliage.position.y = 3.3;
    foliage.scale.set(1, 1.2, 0.95);
    foliage.castShadow = true;
    tree.add(foliage);
    scene.add(tree);
    obstacles.push({ x, z, width: 0.7, depth: 0.7 });
  }

  for (let index = 0; index < 32; index += 1) {
    const x = 4 + random() * 55;
    const z = -48 + random() * 96;
    if (isBlocked(x, z, 1.1)) continue;
    const debris = box(scene, [0.5 + random(), 0.35 + random() * 0.45, 0.6 + random()], [x, 0.25, z], mats.rubble);
    debris.rotation.y = random() * Math.PI;
  }

  buildAvatar();
  buildResources();
  buildInfected();
  syncCampfires();
}

function makeLimb(parent, x, y, z, length, width, material, store) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const limb = box(pivot, [width, length, width], [0, -length / 2, 0], material);
  limb.castShadow = true;
  parent.add(pivot);
  store.push(pivot);
  return pivot;
}

function buildAvatar() {
  scene.add(playerRoot);
  playerRoot.add(avatar);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.68, 4, 8), mats.player);
  torso.position.y = 1.15;
  torso.castShadow = true;
  avatar.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 9), mats.skin);
  head.position.y = 1.84;
  head.castShadow = true;
  avatar.add(head);
  box(avatar, [0.58, 0.14, 0.4], [0, 1.64, 0], mats.wallDark);
  makeLimb(avatar, -0.17, 0.75, 0, 0.78, 0.22, mats.pants, playerLegs);
  makeLimb(avatar, 0.17, 0.75, 0, 0.78, 0.22, mats.pants, playerLegs);
  makeLimb(avatar, -0.45, 1.48, 0, 0.66, 0.18, mats.player, playerArms);
  makeLimb(avatar, 0.45, 1.48, 0, 0.66, 0.18, mats.player, playerArms);
  const spear = new THREE.Group();
  spear.name = 'spear';
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 1.65, 6), mats.spear);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.7;
  spear.add(shaft);
  const point = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 5), mats.rubble);
  point.rotation.x = -Math.PI / 2;
  point.position.set(0, 0, -1.66);
  spear.add(point);
  spear.position.set(0.3, 1.1, -0.25);
  spear.visible = false;
  avatar.add(spear);
  playerRoot.position.set(player.x, 0, player.z);
}

function buildResources() {
  for (const node of worldState.world.resources) {
    const group = new THREE.Group();
    group.position.set(node.x, 0, node.z);
    const geometry = node.kind === 'stone'
      ? new THREE.DodecahedronGeometry(0.42, 0)
      : node.kind === 'branch'
        ? new THREE.CylinderGeometry(0.08, 0.12, 1.15, 5)
        : node.kind === 'cleanWater' || node.kind === 'rawWater'
          ? new THREE.CylinderGeometry(0.42, 0.5, 0.12, 12)
          : new THREE.IcosahedronGeometry(0.35, 0);
    const material = node.kind === 'cleanWater' || node.kind === 'rawWater' ? mats.water : mats.resource;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = node.kind === 'branch' ? 0.55 : node.kind === 'stone' ? 0.3 : 0.55;
    if (node.kind === 'branch') mesh.rotation.z = Math.PI / 3;
    mesh.castShadow = true;
    group.add(mesh);
    const marker = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 4, 18), mat('#d9c995'));
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.035;
    group.add(marker);
    scene.add(group);
    resourceObjects.set(node.id, group);
  }
}

function buildInfected() {
  for (const enemy of worldState.world.infected) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.64, 3, 7), mats.infected);
    torso.position.y = 1.05;
    torso.castShadow = true;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 9, 8), mats.infectedSkin);
    head.position.y = 1.77;
    head.castShadow = true;
    group.add(head);
    const limbs = [];
    makeLimb(group, -0.17, 0.68, 0, 0.72, 0.19, mats.infected, limbs);
    makeLimb(group, 0.17, 0.68, 0, 0.72, 0.19, mats.infected, limbs);
    makeLimb(group, -0.43, 1.42, 0, 0.72, 0.17, mats.infectedSkin, limbs);
    makeLimb(group, 0.43, 1.42, 0, 0.72, 0.17, mats.infectedSkin, limbs);
    group.position.set(enemy.x, 0, enemy.z);
    scene.add(group);
    infectedObjects.set(enemy.id, { group, limbs, enemy });
  }
}

function syncCampfires() {
  while (campfireObjects.length < worldState.world.campfires.length) {
    const source = worldState.world.campfires[campfireObjects.length];
    const group = new THREE.Group();
    for (let index = 0; index < 3; index += 1) {
      const log = box(group, [0.12, 0.12, 0.95], [0, 0.12, 0], mats.firewood);
      log.rotation.y = (index * Math.PI) / 3;
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.85, 7), mats.fire);
    flame.position.y = 0.57;
    group.add(flame);
    group.position.set(source.x, 0, source.z);
    scene.add(group);
    campfireObjects.push(group);
  }
}

function itemCount(itemId) {
  return player.inventory.reduce((total, stack) => total + (stack?.id === itemId ? stack.count : 0), 0);
}

function updateInventoryUi() {
  const quickbar = document.querySelector('#quickbar');
  quickbar.replaceChildren();
  player.inventory.forEach((stack, index) => {
    const button = document.createElement('button');
    button.className = `slot${player.selectedItem === index ? ' selected' : ''}`;
    button.setAttribute('aria-label', stack ? `${ITEMS[stack.id].name}, ${stack.count}` : `Empty slot ${index + 1}`);
    button.innerHTML = stack
      ? `${ITEMS[stack.id].name}<small>×${stack.count}</small>`
      : `<span>${String(index + 1).padStart(2, '0')}</span>`;
    button.addEventListener('click', () => {
      player.selectedItem = index;
      updateInventoryUi();
      updateEquipment();
    });
    quickbar.append(button);
  });
  const weight = player.inventory.reduce((total, stack) => total + (stack ? ITEMS[stack.id].weight * stack.count : 0), 0);
  document.querySelector('#inventory-weight').textContent = `${weight.toFixed(1)} KG · ${player.inventory.filter(Boolean).length}/12 SLOTS`;
  const selected = player.inventory[player.selectedItem];
  document.querySelector('#eat').textContent = selected && (ITEMS[selected.id].food || ITEMS[selected.id].water) ? 'CONSUME' : 'USE';
}

function updateEquipment() {
  const spear = avatar.getObjectByName('spear');
  if (spear) spear.visible = player.inventory[player.selectedItem]?.id === 'spear';
}

function updateHud() {
  const setStat = (id, value, percent = value) => {
    document.querySelector(`#${id}-label`).textContent = String(Math.round(value));
    document.querySelector(`#${id}-bar`).style.width = `${Math.max(0, Math.min(100, percent))}%`;
  };
  setStat('health', player.health);
  setStat('hunger', player.hunger);
  setStat('thirst', player.thirst);
  setStat('stamina', player.stamina);
  document.querySelector('#temperature-label').textContent = `${player.coreTemperature.toFixed(1)}°`;
  document.querySelector('#infection-label').textContent = `${Math.round(player.infection)}%`;
  document.querySelector('#clock').textContent = worldTimeLabel(worldState.worldTime);
  document.querySelector('#biome').textContent = player.x < -5 ? 'WILDERNESS' : 'ABANDONED TOWN';
  document.querySelector('#world-note').textContent = worldState.world.note;
}

function nearestResource() {
  let closest = null;
  let closestDistance = 2.7;
  for (const node of worldState.world.resources) {
    if (node.count <= 0) continue;
    const distance = Math.hypot(node.x - player.x, node.z - player.z);
    if (distance < closestDistance) {
      closest = node;
      closestDistance = distance;
    }
  }
  return closest;
}

function nearestEnemy() {
  let closest = null;
  let closestDistance = 2.2;
  for (const enemy of worldState.world.infected) {
    if (enemy.health <= 0) continue;
    const distance = Math.hypot(enemy.x - player.x, enemy.z - player.z);
    if (distance < closestDistance) {
      closest = enemy;
      closestDistance = distance;
    }
  }
  return closest;
}

function refreshInteraction() {
  const node = nearestResource();
  const enemy = nearestEnemy();
  const prompt = document.querySelector('#prompt');
  if (enemy) prompt.textContent = 'INFECTED CLOSE · TAP ✕ TO STRIKE';
  else if (node) prompt.textContent = `TAP USE · GATHER ${ITEMS[node.kind].name.toUpperCase()}`;
  else prompt.textContent = '';
}

function showMessage(message) {
  const element = document.querySelector('#message');
  element.textContent = message;
  element.classList.add('visible');
  toastClock = 2.1;
}

function useSelected() {
  const item = player.inventory[player.selectedItem];
  if (!item) {
    showMessage('SELECT FOOD OR WATER TO USE IT');
    return;
  }
  if (item.id === 'campfireKit') {
    if (placeCampfire(worldState)) {
      syncCampfires();
      showMessage('CAMPFIRE LIT · MOVE CLOSE TO WARM UP');
    }
  } else if (consumeSelected(worldState)) {
    showMessage(`${ITEMS[item.id].name.toUpperCase()} USED`);
    updateInventoryUi();
  } else {
    showMessage('THIS ITEM CANNOT BE USED RIGHT NOW');
  }
  updateHud();
  saveState();
}

function interact() {
  const enemy = nearestEnemy();
  if (enemy) {
    showMessage('TOO CLOSE · STRIKE OR BACK AWAY');
    return;
  }
  const node = nearestResource();
  if (!node) {
    showMessage('NOTHING TO GATHER NEARBY');
    return;
  }
  if (!gather(worldState, node.id)) {
    showMessage('PACK FULL · MAKE ROOM BEFORE GATHERING');
    return;
  }
  if (node.count <= 0) {
    resourceObjects.get(node.id)?.visible && (resourceObjects.get(node.id).visible = false);
  }
  showMessage(`GATHERED ${ITEMS[node.kind].name.toUpperCase()}`);
  updateInventoryUi();
  saveState();
}

function craftRecipe(id) {
  const recipe = RECIPES[id];
  if (!craft(player, id)) {
    const missing = Object.entries(recipe.ingredients)
      .filter(([item, amount]) => itemCount(item) < amount)
      .map(([item, amount]) => `${ITEMS[item].name} ${Math.max(0, amount - itemCount(item))}`);
    showMessage(missing.length ? `NEED ${missing.join(' · ')}` : 'PACK FULL');
    return;
  }
  showMessage(`${recipe.name.toUpperCase()} CRAFTED · NOISE MAY ATTRACT INFECTED`);
  updateInventoryUi();
  updateEquipment();
  saveState();
}

function strike() {
  const enemy = nearestEnemy();
  if (!enemy) {
    emitSound(worldState, player.x, player.z, crouched ? 0.35 : 0.62);
    showMessage('SWING MISSED');
    return;
  }
  attackInfected(worldState, enemy.id);
  if (enemy.health <= 0) {
    const visual = infectedObjects.get(enemy.id);
    if (visual) visual.group.visible = false;
    showMessage('INFECTED DOWN · CHECK YOUR SURROUNDINGS');
  } else {
    showMessage('HIT · IT HEARD YOU');
  }
  updateHud();
  saveState();
}

function toggleCrouch() {
  crouched = !crouched;
  document.querySelector('#crouch').classList.toggle('active', crouched);
  playerArms.forEach((arm) => { arm.rotation.x = crouched ? -0.15 : 0; });
  showMessage(crouched ? 'CROUCHED · QUIETER MOVEMENT' : 'STANDING');
}

document.querySelector('#eat').addEventListener('click', useSelected);
document.querySelector('#craft-spear').addEventListener('click', () => craftRecipe('spear'));
document.querySelector('#craft-fire').addEventListener('click', () => craftRecipe('campfireKit'));
document.querySelector('#interact').addEventListener('pointerdown', (event) => { event.preventDefault(); interact(); });
document.querySelector('#melee').addEventListener('pointerdown', (event) => { event.preventDefault(); strike(); });
document.querySelector('#crouch').addEventListener('click', toggleCrouch);

const joystick = document.querySelector('#joystick');
const stick = document.querySelector('#stick');
let movementPointer = null;
function moveStick(event) {
  const bounds = joystick.getBoundingClientRect();
  const dx = event.clientX - (bounds.left + bounds.width / 2);
  const dy = event.clientY - (bounds.top + bounds.height / 2);
  const radius = bounds.width * 0.31;
  const distance = Math.hypot(dx, dy);
  const scale = distance > radius ? radius / distance : 1;
  movementX = dx * scale / radius;
  movementY = -dy * scale / radius;
  stick.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
}
joystick.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  movementPointer = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  moveStick(event);
});
joystick.addEventListener('pointermove', (event) => { if (event.pointerId === movementPointer) moveStick(event); });
function releaseStick() {
  movementPointer = null;
  movementX = 0;
  movementY = 0;
  stick.style.transform = 'translate(0,0)';
}
joystick.addEventListener('pointerup', releaseStick);
joystick.addEventListener('pointercancel', releaseStick);

const lookJoystick = document.querySelector('#look-joystick');
const lookStick = document.querySelector('#look-stick');
let lookStickPointer = null;
function moveLookStick(event) {
  const bounds = lookJoystick.getBoundingClientRect();
  const dx = event.clientX - (bounds.left + bounds.width / 2);
  const dy = event.clientY - (bounds.top + bounds.height / 2);
  const radius = bounds.width * 0.31;
  const distance = Math.hypot(dx, dy);
  const scale = distance > radius ? radius / distance : 1;
  lookX = dx * scale / radius;
  lookY = dy * scale / radius;
  lookStick.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
}
lookJoystick.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  lookStickPointer = event.pointerId;
  lookJoystick.setPointerCapture(event.pointerId);
  moveLookStick(event);
});
lookJoystick.addEventListener('pointermove', (event) => {
  if (event.pointerId === lookStickPointer) moveLookStick(event);
});
function releaseLookStick() {
  lookStickPointer = null;
  lookX = 0;
  lookY = 0;
  lookStick.style.transform = 'translate(0,0)';
}
lookJoystick.addEventListener('pointerup', releaseLookStick);
lookJoystick.addEventListener('pointercancel', releaseLookStick);

const sprintButton = document.querySelector('#sprint');
sprintButton.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  sprintButton.setPointerCapture(event.pointerId);
  sprintHeld = true;
  sprintButton.classList.add('active');
});
function releaseSprint() {
  sprintHeld = false;
  sprintButton.classList.remove('active');
}
sprintButton.addEventListener('pointerup', releaseSprint);
sprintButton.addEventListener('pointercancel', releaseSprint);
sprintButton.addEventListener('lostpointercapture', releaseSprint);

canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse') return;
  lookPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (lookPointers.size === 1 && event.clientX > window.innerWidth * 0.48) {
    activeLookPointer = event.pointerId;
    lastLookX = event.clientX;
    lastLookY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  } else if (lookPointers.size === 2) {
    const points = [...lookPointers.values()];
    pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    activeLookPointer = null;
  }
});
canvas.addEventListener('pointermove', (event) => {
  if (lookPointers.has(event.pointerId)) lookPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (lookPointers.size >= 2) {
    const points = [...lookPointers.values()];
    const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    if (pinchDistance > 0) zoom = THREE.MathUtils.clamp(zoom + (pinchDistance - distance) * 0.012, 3.8, 10);
    pinchDistance = distance;
    return;
  }
  if (event.pointerId !== activeLookPointer) return;
  yaw -= (event.clientX - lastLookX) * 0.006;
  pitch = THREE.MathUtils.clamp(pitch + (event.clientY - lastLookY) * 0.003, -0.18, 0.65);
  lastLookX = event.clientX;
  lastLookY = event.clientY;
});
function releaseLook(event) {
  lookPointers.delete(event.pointerId);
  if (event.pointerId === activeLookPointer) activeLookPointer = null;
  if (lookPointers.size < 2) pinchDistance = 0;
}
canvas.addEventListener('pointerup', releaseLook);
canvas.addEventListener('pointercancel', releaseLook);
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse' && event.buttons === 2) yaw -= event.movementX * 0.004;
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

window.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyE') interact();
  if (event.code === 'Space') { event.preventDefault(); strike(); }
  if (event.code === 'KeyF') useSelected();
  if (event.code === 'KeyC') toggleCrouch();
  if (event.code === 'Escape') togglePause();
  if (event.code.startsWith('Digit')) {
    const slot = Number(event.code.slice(5)) - 1;
    if (slot >= 0 && slot < player.inventory.length) {
      player.selectedItem = slot;
      updateInventoryUi();
      updateEquipment();
    }
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => {
  keys.clear();
  releaseStick();
  releaseLookStick();
  releaseSprint();
  saveState();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    running = false;
    document.querySelector('#overlay').classList.remove('hidden');
    document.querySelector('#overlay-title').innerHTML = 'WORLD<br /><em>PAUSED</em>';
    document.querySelector('#overlay-copy').textContent = 'Your journey is saved. Return when you are ready.';
    document.querySelector('#start span').textContent = 'CONTINUE JOURNEY';
    saveState();
  }
});

function togglePause() {
  if (running) {
    running = false;
    saveState();
    document.querySelector('#overlay').classList.remove('hidden');
    document.querySelector('#overlay-title').innerHTML = 'WORLD<br /><em>PAUSED</em>';
    document.querySelector('#overlay-copy').textContent = 'The world waits. Your progress is saved locally.';
    document.querySelector('#start span').textContent = 'CONTINUE JOURNEY';
  } else {
    running = true;
    document.querySelector('#overlay').classList.add('hidden');
  }
}
document.querySelector('#pause').addEventListener('click', togglePause);
document.querySelector('#start').addEventListener('click', () => {
  if (player.dead) {
    localStorage.removeItem(SAVE_KEY);
    window.location.reload();
    return;
  }
  running = true;
  document.querySelector('#overlay').classList.add('hidden');
});

function updateCamera(delta) {
  forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  const horizontalZoom = Math.cos(pitch) * zoom;
  desiredCamera.set(
    player.x - Math.sin(yaw) * horizontalZoom,
    2.4 + Math.sin(pitch) * zoom,
    player.z + Math.cos(yaw) * horizontalZoom,
  );
  camera.position.lerp(desiredCamera, 1 - Math.pow(0.002, delta));
  lookTarget.set(player.x + forward.x * 5, 1.25 + Math.sin(pitch) * 4, player.z + forward.z * 5);
  camera.lookAt(lookTarget);
}

function updateDayLighting() {
  const daySeconds = worldState.worldTime % 86400;
  const daylight = THREE.MathUtils.clamp((Math.sin((daySeconds / 86400) * Math.PI * 2 - Math.PI / 2) + 0.2) / 0.8, 0.12, 1);
  ambientLight.intensity = 0.55 + daylight * 1.4;
  sun.intensity = 0.18 + daylight * 2.35;
  const sky = new THREE.Color('#17232c').lerp(new THREE.Color('#91a181'), daylight);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
}

function updateWorld(delta) {
  yaw -= lookX * delta * 2.2;
  pitch = THREE.MathUtils.clamp(pitch + lookY * delta * 1.3, -0.18, 0.65);
  const inputX = movementX + Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const inputY = movementY + Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const inputLength = Math.hypot(inputX, inputY);
  const clampedX = inputLength > 1 ? inputX / inputLength : inputX;
  const clampedY = inputLength > 1 ? inputY / inputLength : inputY;
  const moving = inputLength > 0.08;
  const sprinting = (sprintHeld || keys.has('ShiftLeft') || keys.has('ShiftRight')) && moving && !crouched && player.stamina > 0;
  const speed = sprinting ? 6.4 : crouched ? 1.5 : 3.3;
  right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  const moveX = right.x * clampedX + forward.x * clampedY;
  const moveZ = right.z * clampedX + forward.z * clampedY;
  if (moving) {
    const position = moveColliding(player.x, player.z, moveX * speed * delta, moveZ * speed * delta, 0.38);
    player.x = THREE.MathUtils.clamp(position.x, -59, 59);
    player.z = THREE.MathUtils.clamp(position.z, -54, 54);
    if (sprinting && elapsed - lastStepSound > 0.55) {
      emitSound(worldState, player.x, player.z, 0.9);
      lastStepSound = elapsed;
    } else if (!crouched && elapsed - lastStepSound > 1.15) {
      emitSound(worldState, player.x, player.z, 0.35);
      lastStepSound = elapsed;
    }
    const gait = Math.sin(elapsed * (sprinting ? 13 : 8)) * Math.min(1, inputLength);
    playerLegs[0].rotation.x = gait * (crouched ? 0.23 : 0.5);
    playerLegs[1].rotation.x = -gait * (crouched ? 0.23 : 0.5);
    playerRoot.rotation.y = yaw;
  } else {
    playerLegs.forEach((leg) => { leg.rotation.x *= 0.82; });
  }
  playerRoot.position.set(player.x, crouched ? -0.12 : 0, player.z);
  const spear = avatar.getObjectByName('spear');
  if (spear) spear.visible = player.inventory[player.selectedItem]?.id === 'spear';
  tick(worldState, delta, {
    moving,
    sprinting,
    isOccluded: isObstructed,
    moveEnemy: (enemy, targetX, targetZ, distance) => {
      const dx = targetX - enemy.x;
      const dz = targetZ - enemy.z;
      const length = Math.hypot(dx, dz) || 1;
      return moveColliding(enemy.x, enemy.z, (dx / length) * distance, (dz / length) * distance, 0.38);
    },
  });

  for (const visual of infectedObjects.values()) {
    const enemy = visual.enemy;
    visual.group.position.set(enemy.x, 0, enemy.z);
    if (enemy.state !== 'idle') {
      visual.group.rotation.y = Math.atan2(-(player.x - enemy.x), -(player.z - enemy.z));
      const gait = Math.sin(elapsed * 7 + enemy.x) * 0.4;
      visual.limbs[0].rotation.x = gait;
      visual.limbs[1].rotation.x = -gait;
      visual.limbs[2].rotation.x = -0.8;
      visual.limbs[3].rotation.x = -0.9;
    }
  }
  for (const node of worldState.world.resources) {
    const object = resourceObjects.get(node.id);
    if (object) object.visible = node.count > 0;
  }

  updateCamera(delta);
  updateDayLighting();
  syncCampfires();
  refreshInteraction();
}

function isObstructed(enemy, target) {
  const dx = target.x - enemy.x;
  const dz = target.z - enemy.z;
  const length = Math.hypot(dx, dz);
  const steps = Math.ceil(length / 0.75);
  for (let index = 1; index < steps; index += 1) {
    const ratio = index / steps;
    if (isBlocked(enemy.x + dx * ratio, enemy.z + dz * ratio, 0)) return true;
  }
  return false;
}

function updateInterface(delta) {
  uiClock += delta;
  if (uiClock > 0.15) {
    uiClock = 0;
    updateHud();
  }
  autosaveClock += delta;
  if (autosaveClock > 10) {
    autosaveClock = 0;
    saveState();
  }
  if (toastClock > 0) {
    toastClock -= delta;
    if (toastClock <= 0) document.querySelector('#message').classList.remove('visible');
  }
  if (player.dead && running) {
    running = false;
    saveState();
    document.querySelector('#overlay-title').innerHTML = 'JOURNEY<br /><em>ENDED</em>';
    document.querySelector('#overlay-copy').textContent = 'You did not survive this journey. Begin again with a new world.';
    document.querySelector('#start span').textContent = 'NEW JOURNEY';
    document.querySelector('#overlay').classList.remove('hidden');
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.fov = width < height ? 68 : 58;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
window.addEventListener('resize', resize);

function animate(time) {
  requestAnimationFrame(animate);
  const delta = Math.min(0.05, (time - lastTime) / 1000 || 0);
  lastTime = time;
  elapsed += delta;
  if (running) updateWorld(delta);
  updateInterface(delta);
  renderer.render(scene, camera);
}

buildWorld();
updateInventoryUi();
updateEquipment();
updateHud();
resize();
updateCamera(0.05);
if (player.dead) {
  document.querySelector('#overlay-title').innerHTML = 'JOURNEY<br /><em>ENDED</em>';
  document.querySelector('#overlay-copy').textContent = 'You did not survive this journey. Begin again with a new world.';
  document.querySelector('#start span').textContent = 'NEW JOURNEY';
}
requestAnimationFrame(animate);
