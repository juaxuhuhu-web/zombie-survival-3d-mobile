export const ITEMS = {
  branch: { name: 'Branch', stack: 20, weight: 0.25 },
  stone: { name: 'Stone', stack: 20, weight: 0.45 },
  fiber: { name: 'Plant fiber', stack: 20, weight: 0.05 },
  berries: { name: 'Wild berries', stack: 10, weight: 0.1, food: 18, water: 4 },
  cleanWater: { name: 'Clean water', stack: 5, weight: 0.5, water: 35 },
  rawWater: { name: 'Unsafe water', stack: 5, weight: 0.5, water: 35, infection: 4 },
  spear: { name: 'Wood spear', stack: 1, weight: 1.8, damage: 38 },
  campfireKit: { name: 'Campfire kit', stack: 1, weight: 2 },
};

export const RECIPES = {
  spear: {
    name: 'Stone-tipped spear',
    ingredients: { branch: 2, stone: 1, fiber: 2 },
    output: { id: 'spear', count: 1 },
  },
  campfireKit: {
    name: 'Campfire kit',
    ingredients: { branch: 4, stone: 3, fiber: 2 },
    output: { id: 'campfireKit', count: 1 },
  },
};

const SLOT_COUNT = 12;
const MAX_HEALTH = 100;
const MAX_STAMINA = 100;
const TILE_SIZE = 64;

export function createInitialState(seed = 20261023) {
  return {
    schemaVersion: 1,
    seed,
    worldTime: 8 * 3600,
    player: {
      x: -25,
      z: 0,
      health: 100,
      hunger: 82,
      thirst: 74,
      stamina: 100,
      coreTemperature: 37,
      infection: 0,
      wounds: 0,
      dead: false,
      inventory: Array(SLOT_COUNT).fill(null),
      selectedItem: 0,
    },
    world: {
      exploredTiles: [],
      resources: [
        { id: 'berries-west', kind: 'berries', x: -31, z: -7, count: 3 },
        { id: 'branch-west', kind: 'branch', x: -21, z: 7, count: 5 },
        { id: 'stone-west', kind: 'stone', x: -34, z: 9, count: 4 },
        { id: 'fiber-west', kind: 'fiber', x: -15, z: -10, count: 5 },
        { id: 'water-creek', kind: 'cleanWater', x: -11, z: 14, count: 8 },
        { id: 'berries-east', kind: 'berries', x: 3, z: -9, count: 4 },
        { id: 'branch-east', kind: 'branch', x: 8, z: 14, count: 6 },
        { id: 'stone-east', kind: 'stone', x: 17, z: 5, count: 5 },
        { id: 'fiber-east', kind: 'fiber', x: 4, z: 11, count: 5 },
        { id: 'water-town', kind: 'rawWater', x: 20, z: -7, count: 6 },
      ],
      infected: [
        { id: 'walker-01', x: -12, z: 17, health: 100, state: 'idle', targetX: -12, targetZ: 17, alert: 0, attackCooldown: 0 },
        { id: 'walker-02', x: 8, z: -15, health: 100, state: 'idle', targetX: 8, targetZ: -15, alert: 0, attackCooldown: 0 },
        { id: 'walker-03', x: 24, z: 12, health: 100, state: 'idle', targetX: 24, targetZ: 12, alert: 0, attackCooldown: 0 },
        { id: 'walker-04', x: 35, z: -17, health: 100, state: 'idle', targetX: 35, targetZ: -17, alert: 0, attackCooldown: 0 },
      ],
      sounds: [],
      bloodTrail: [],
      campfires: [],
      discoveredBiomes: [],
      note: 'Find water, food, and shelter. The infected are already here.',
    },
  };
}

export function normalizeSave(value) {
  if (!value || value.schemaVersion !== 1 || !value.player || !value.world) return null;
  if (!Number.isFinite(value.player.x) || !Number.isFinite(value.player.z)) return null;
  const initial = createInitialState(value.seed);
  const inventory = Array(SLOT_COUNT).fill(null);
  if (Array.isArray(value.player.inventory)) {
    value.player.inventory.slice(0, SLOT_COUNT).forEach((stack, index) => {
      if (!stack || !ITEMS[stack.id] || !Number.isInteger(stack.count) || stack.count < 1 || stack.count > ITEMS[stack.id].stack) return;
      inventory[index] = { id: stack.id, count: stack.count };
    });
  }
  const resources = Array.isArray(value.world.resources)
    ? value.world.resources.filter((node) => node && ITEMS[node.kind] && Number.isFinite(node.x) && Number.isFinite(node.z) && Number.isFinite(node.count))
    : initial.world.resources;
  const infected = Array.isArray(value.world.infected)
    ? value.world.infected.filter((enemy) => enemy && Number.isFinite(enemy.x) && Number.isFinite(enemy.z) && Number.isFinite(enemy.health))
    : initial.world.infected;
  return {
    ...initial,
    ...value,
    worldTime: Number.isFinite(value.worldTime) && value.worldTime >= 0 ? value.worldTime : initial.worldTime,
    player: {
      ...initial.player,
      ...value.player,
      x: Math.max(-10000, Math.min(10000, value.player.x)),
      z: Math.max(-10000, Math.min(10000, value.player.z)),
      health: Math.max(0, Math.min(100, Number.isFinite(value.player.health) ? value.player.health : initial.player.health)),
      hunger: Math.max(0, Math.min(100, Number.isFinite(value.player.hunger) ? value.player.hunger : initial.player.hunger)),
      thirst: Math.max(0, Math.min(100, Number.isFinite(value.player.thirst) ? value.player.thirst : initial.player.thirst)),
      stamina: Math.max(0, Math.min(100, Number.isFinite(value.player.stamina) ? value.player.stamina : initial.player.stamina)),
      coreTemperature: Number.isFinite(value.player.coreTemperature) ? value.player.coreTemperature : initial.player.coreTemperature,
      infection: Math.max(0, Math.min(100, Number.isFinite(value.player.infection) ? value.player.infection : initial.player.infection)),
      wounds: Math.max(0, Math.min(5, Number.isFinite(value.player.wounds) ? value.player.wounds : initial.player.wounds)),
      inventory,
    },
    world: {
      ...initial.world,
      ...value.world,
      resources,
      infected,
      exploredTiles: Array.isArray(value.world.exploredTiles) ? value.world.exploredTiles.filter((tile) => typeof tile === 'string') : [],
      discoveredBiomes: Array.isArray(value.world.discoveredBiomes) ? value.world.discoveredBiomes.filter((biome) => typeof biome === 'string') : [],
      sounds: Array.isArray(value.world.sounds) ? value.world.sounds.filter((sound) => sound && Number.isFinite(sound.x) && Number.isFinite(sound.z) && Number.isFinite(sound.intensity) && Number.isFinite(sound.age)) : [],
      bloodTrail: Array.isArray(value.world.bloodTrail) ? value.world.bloodTrail.filter((trail) => trail && Number.isFinite(trail.x) && Number.isFinite(trail.z) && Number.isFinite(trail.strength) && Number.isFinite(trail.age)) : [],
      campfires: Array.isArray(value.world.campfires) ? value.world.campfires.filter((fire) => fire && Number.isFinite(fire.x) && Number.isFinite(fire.z) && Number.isFinite(fire.fuel)) : [],
    },
  };
}

export function addItem(inventory, itemId, amount) {
  if (!ITEMS[itemId] || !Number.isInteger(amount) || amount <= 0) return false;
  const next = inventory.map((stack) => stack && { ...stack });
  let remaining = amount;
  for (const stack of next) {
    if (stack?.id !== itemId) continue;
    const added = Math.min(remaining, ITEMS[itemId].stack - stack.count);
    stack.count += added;
    remaining -= added;
    if (remaining === 0) break;
  }
  for (let index = 0; remaining > 0 && index < next.length; index += 1) {
    if (next[index]) continue;
    const added = Math.min(remaining, ITEMS[itemId].stack);
    next[index] = { id: itemId, count: added };
    remaining -= added;
  }
  if (remaining > 0) return false;
  inventory.splice(0, inventory.length, ...next);
  return true;
}

export function removeItems(inventory, requirements) {
  for (const [itemId, amount] of Object.entries(requirements)) {
    if (!Number.isInteger(amount) || amount < 0) return false;
    const count = inventory.reduce((total, stack) => total + (stack?.id === itemId ? stack.count : 0), 0);
    if (count < amount) return false;
  }
  const next = inventory.map((stack) => stack && { ...stack });
  for (const [itemId, amount] of Object.entries(requirements)) {
    let remaining = amount;
    for (let index = next.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const stack = next[index];
      if (stack?.id !== itemId) continue;
      const removed = Math.min(remaining, stack.count);
      stack.count -= removed;
      remaining -= removed;
      if (stack.count === 0) next[index] = null;
    }
  }
  inventory.splice(0, inventory.length, ...next);
  return true;
}

export function craft(player, recipeId) {
  const recipe = RECIPES[recipeId];
  if (!recipe || !removeItems(player.inventory, recipe.ingredients)) return false;
  if (!addItem(player.inventory, recipe.output.id, recipe.output.count)) {
    for (const [itemId, amount] of Object.entries(recipe.ingredients)) addItem(player.inventory, itemId, amount);
    return false;
  }
  return true;
}

export function gather(state, resourceId) {
  const node = state.world.resources.find((entry) => entry.id === resourceId && entry.count > 0);
  if (!node || Math.hypot(node.x - state.player.x, node.z - state.player.z) > 2.4) return false;
  if (!addItem(state.player.inventory, node.kind, 1)) return false;
  node.count -= 1;
  emitSound(state, state.player.x, state.player.z, 0.42);
  return true;
}

export function consumeSelected(state) {
  const player = state.player;
  const stack = player.inventory[player.selectedItem];
  if (!stack) return false;
  const definition = ITEMS[stack.id];
  if (!definition || (!definition.food && !definition.water)) return false;
  if (definition.food) player.hunger = Math.min(100, player.hunger + definition.food);
  if (definition.water) player.thirst = Math.min(100, player.thirst + definition.water);
  if (definition.infection) player.infection = Math.min(100, player.infection + definition.infection);
  stack.count -= 1;
  if (stack.count === 0) player.inventory[player.selectedItem] = null;
  return true;
}

export function emitSound(state, x, z, intensity) {
  state.world.sounds.push({ x, z, intensity: Math.max(0, Math.min(1, intensity)), age: 0 });
}

export function attackInfected(state, enemyId) {
  const enemy = state.world.infected.find((entry) => entry.id === enemyId && entry.health > 0);
  if (!enemy || Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z) > 2.1) return false;
  const selected = state.player.inventory[state.player.selectedItem];
  const damage = selected?.id === 'spear' ? 38 : 14;
  enemy.health = Math.max(0, enemy.health - damage);
  emitSound(state, state.player.x, state.player.z, 0.9);
  if (enemy.health > 0) enemy.state = 'investigate';
  return true;
}

export function placeCampfire(state) {
  const index = state.player.inventory.findIndex((stack) => stack?.id === 'campfireKit');
  if (index < 0) return false;
  state.player.inventory[index].count -= 1;
  if (!state.player.inventory[index].count) state.player.inventory[index] = null;
  state.world.campfires.push({ x: state.player.x, z: state.player.z, fuel: 240 });
  return true;
}

export function tileFor(position) {
  return `${Math.floor(position.x / TILE_SIZE)}:${Math.floor(position.z / TILE_SIZE)}`;
}

export function worldTimeLabel(seconds) {
  const day = Math.floor(seconds / 86400) + 1;
  const daySeconds = ((seconds % 86400) + 86400) % 86400;
  const hours = Math.floor(daySeconds / 3600);
  const minutes = Math.floor((daySeconds % 3600) / 60);
  return `DAY ${String(day).padStart(2, '0')} · ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function tick(state, delta, intent = {}) {
  const dt = Math.max(0, Math.min(delta, 0.25));
  const player = state.player;
  if (player.dead || dt === 0) return;
  state.worldTime += dt * 60;
  player.hunger = Math.max(0, player.hunger - dt * 0.022);
  player.thirst = Math.max(0, player.thirst - dt * 0.045);
  if (player.hunger === 0 || player.thirst === 0) player.health = Math.max(0, player.health - dt * (player.thirst === 0 ? 0.42 : 0.18));
  player.stamina = Math.max(0, Math.min(MAX_STAMINA, player.stamina + dt * (intent.sprinting ? -24 : intent.moving ? -2 : 12)));
  const tile = tileFor(player);
  if (!state.world.exploredTiles.includes(tile)) state.world.exploredTiles.push(tile);

  const biome = player.x < -5 ? 'forest' : 'town';
  if (!state.world.discoveredBiomes.includes(biome)) {
    state.world.discoveredBiomes.push(biome);
    state.world.note = biome === 'forest' ? 'Wilderness discovered. Watch your temperature and follow the creek.' : 'Abandoned town discovered. Noise carries between the buildings.';
  }
  const hour = (state.worldTime % 86400) / 3600;
  const nearFire = state.world.campfires.some((fire) => fire.fuel > 0 && Math.hypot(fire.x - player.x, fire.z - player.z) < 5);
  const targetTemperature = (hour >= 6 && hour <= 18 ? 36 : 33) + (nearFire ? 4 : 0);
  player.coreTemperature += (targetTemperature - player.coreTemperature) * dt * 0.003;
  if (player.coreTemperature < 34 || player.coreTemperature > 40) {
    player.health = Math.max(0, player.health - dt * 0.025);
    player.stamina = Math.max(0, player.stamina - dt * 0.1);
  }

  for (const sound of state.world.sounds) sound.age += dt;
  state.world.sounds = state.world.sounds.filter((sound) => sound.age < 9);
  for (const fire of state.world.campfires) fire.fuel = Math.max(0, fire.fuel - dt);

  for (const enemy of state.world.infected) {
    if (enemy.health <= 0) continue;
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    const dx = player.x - enemy.x;
    const dz = player.z - enemy.z;
    const distance = Math.hypot(dx, dz);
    const daylight = hour > 6 && hour < 19;
    const sightRange = daylight ? 15 : 7;
    const facingX = enemy.facingX ?? 0;
    const facingZ = enemy.facingZ ?? -1;
    const viewDot = distance > 0 ? (facingX * dx + facingZ * dz) / distance : 1;
    const visible = distance < sightRange && viewDot > 0.25 && !intent.isOccluded?.(enemy, player);
    const heardSound = state.world.sounds
      .filter((sound) => {
      const soundDistance = Math.hypot(sound.x - enemy.x, sound.z - enemy.z);
      return soundDistance < sound.intensity * (intent.rain ? 12 : 19) && sound.age < 5;
      })
      .sort((first, second) => second.intensity - first.intensity)[0];
    const scent = state.world.bloodTrail
      .filter((trail) => trail.strength > 0.1 && Math.hypot(trail.x - enemy.x, trail.z - enemy.z) < (intent.windTowardEnemy ? 16 : 9))
      .sort((first, second) => second.strength - first.strength)[0];
    if (visible) {
      enemy.state = 'sight';
      enemy.targetX = player.x;
      enemy.targetZ = player.z;
      enemy.alert = 1;
    } else if (heardSound || scent) {
      enemy.state = 'investigate';
      enemy.targetX = heardSound?.x ?? scent.x;
      enemy.targetZ = heardSound?.z ?? scent.z;
      enemy.alert = Math.min(1, enemy.alert + dt);
    } else if (enemy.alert > 0) {
      enemy.alert = Math.max(0, enemy.alert - dt * 0.12);
      if (enemy.alert === 0) enemy.state = 'idle';
    } else {
      enemy.state = 'idle';
    }

    if (distance < 1.55 && !intent.isOccluded?.(enemy, player)) {
      enemy.state = 'attack';
      if (enemy.attackCooldown === 0) {
        enemy.attackCooldown = 1.6;
        player.health = Math.max(0, player.health - 9);
        player.wounds = Math.min(5, player.wounds + 1);
        player.infection = Math.min(100, player.infection + 8);
        state.world.bloodTrail.push({ x: player.x, z: player.z, strength: 1, age: 0 });
        emitSound(state, player.x, player.z, 0.7);
      }
    } else if (enemy.state === 'sight' || enemy.state === 'investigate') {
      const targetDx = enemy.targetX - enemy.x;
      const targetDz = enemy.targetZ - enemy.z;
      const targetDistance = Math.hypot(targetDx, targetDz);
      const speed = enemy.state === 'sight' ? 1.25 : 0.72;
      if (targetDistance > 0.15) {
        if (intent.moveEnemy) {
          const position = intent.moveEnemy(enemy, enemy.targetX, enemy.targetZ, speed * dt);
          const movedX = position.x - enemy.x;
          const movedZ = position.z - enemy.z;
          const movedLength = Math.hypot(movedX, movedZ);
          if (movedLength > 0.001) {
            enemy.facingX = movedX / movedLength;
            enemy.facingZ = movedZ / movedLength;
          }
          enemy.x = position.x;
          enemy.z = position.z;
        } else {
          enemy.facingX = targetDx / targetDistance;
          enemy.facingZ = targetDz / targetDistance;
          enemy.x += enemy.facingX * speed * dt;
          enemy.z += enemy.facingZ * speed * dt;
        }
      }
    }
  }

  for (const scent of state.world.bloodTrail) {
    scent.age += dt;
    scent.strength = Math.max(0, scent.strength - dt * (intent.rain ? 0.08 : 0.025));
  }
  state.world.bloodTrail = state.world.bloodTrail.filter((scent) => scent.strength > 0);
  if (player.infection > 30) player.health = Math.max(0, player.health - dt * (player.infection - 30) * 0.0007);
  if (player.health <= 0) player.dead = true;
}
