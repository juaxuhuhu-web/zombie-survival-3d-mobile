import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addItem,
  attackInfected,
  craft,
  consumeSelected,
  createInitialState,
  emitSound,
  gather,
  normalizeSave,
  tick,
  tileFor,
} from './simulation.js';

test('inventory rejects an over-capacity add without changing existing stacks', () => {
  const inventory = Array.from({ length: 12 }, (_, index) => ({ id: 'branch', count: index === 0 ? 19 : 20 }));
  const before = structuredClone(inventory);
  assert.equal(addItem(inventory, 'stone', 1), false);
  assert.deepEqual(inventory, before);
});

test('primitive crafting consumes ingredients once and creates one output', () => {
  const state = createInitialState();
  assert.equal(craft(state.player, 'spear'), false);
  assert.equal(state.player.inventory.every((slot) => slot === null), true);
  for (const [item, amount] of [['branch', 2], ['stone', 1], ['fiber', 2]]) {
    assert.equal(addItem(state.player.inventory, item, amount), true);
  }
  assert.equal(craft(state.player, 'spear'), true);
  assert.equal(state.player.inventory.reduce((total, slot) => total + (slot?.id === 'spear' ? slot.count : 0), 0), 1);
  assert.equal(state.player.inventory.filter(Boolean).length, 1);
});

test('gathering is proximity-limited, finite, and does not consume resources on full pack', () => {
  const state = createInitialState();
  const node = state.world.resources.find((resource) => resource.id === 'berries-west');
  state.player.x = node.x;
  state.player.z = node.z;
  const originalCount = node.count;
  state.player.inventory = Array.from({ length: 12 }, () => ({ id: 'branch', count: 20 }));
  assert.equal(gather(state, node.id), false);
  assert.equal(node.count, originalCount);
  state.player.inventory = Array(12).fill(null);
  assert.equal(gather(state, node.id), true);
  assert.equal(node.count, originalCount - 1);
  state.player.x += 100;
  assert.equal(gather(state, node.id), false);
});

test('infected investigate a sound source instead of being given the player position', () => {
  const state = createInitialState();
  const enemy = state.world.infected[0];
  state.player.x = -3;
  state.player.z = 17;
  emitSound(state, -7, 17, 0.7);
  tick(state, 0.05, { isOccluded: () => true });
  assert.equal(enemy.state, 'investigate');
  assert.equal(enemy.targetX, -7);
  assert.equal(enemy.targetZ, 17);
  assert.notEqual(enemy.targetX, state.player.x);
});

test('the infected population persists without wave or timer-based spawning', () => {
  const state = createInitialState();
  const initialPopulation = state.world.infected.length;
  for (let step = 0; step < 200; step += 1) tick(state, 0.05, { isOccluded: () => true });
  assert.equal(state.world.infected.length, initialPopulation);
  assert.equal(state.worldTime > 8 * 3600, true);
  assert.equal(state.world.exploredTiles.length, 1);
});

test('a nearby bite creates a wound and infection exposure', () => {
  const state = createInitialState();
  const enemy = state.world.infected[0];
  enemy.x = state.player.x + 0.5;
  enemy.z = state.player.z;
  tick(state, 0.05);
  assert.equal(state.player.health, 91);
  assert.equal(state.player.wounds, 1);
  assert.equal(state.player.infection, 8);
  assert.equal(state.world.bloodTrail.length, 1);
});

test('sight acquisition respects an infected field of view and occlusion', () => {
  const state = createInitialState();
  const enemy = state.world.infected[0];
  state.player.x = -3;
  state.player.z = 17;
  enemy.facingX = 1;
  enemy.facingZ = 0;
  tick(state, 0.05, { isOccluded: () => true });
  assert.notEqual(enemy.state, 'sight');
  tick(state, 0.05, { isOccluded: () => false });
  assert.equal(enemy.state, 'sight');
});

test('consumables restore the matching survival vital and are removed once', () => {
  const state = createInitialState();
  state.player.inventory[0] = { id: 'berries', count: 2 };
  state.player.selectedItem = 0;
  const hungerBefore = state.player.hunger;
  assert.equal(consumeSelected(state), true);
  assert.equal(state.player.hunger, hungerBefore + 18);
  assert.equal(state.player.inventory[0].count, 1);
  assert.equal(consumeSelected(state), true);
  assert.equal(state.player.inventory[0], null);
  assert.equal(consumeSelected(state), false);
});

test('save validation preserves valid state and rejects malformed records', () => {
  const state = createInitialState(44);
  state.player.x = -12;
  assert.equal(normalizeSave(state).player.x, -12);
  state.player.hunger = 900;
  state.player.inventory[0] = { id: 'berries', count: 999 };
  const repaired = normalizeSave(state);
  assert.equal(repaired.player.hunger, 100);
  assert.equal(repaired.player.inventory[0], null);
  assert.equal(normalizeSave({ schemaVersion: 12 }), null);
  assert.equal(tileFor({ x: -1, z: 65 }), '-1:1');
});
