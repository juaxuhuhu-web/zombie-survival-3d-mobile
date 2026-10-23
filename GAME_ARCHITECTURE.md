# Deadzone: Open-World Survival RPG

## Design contract

- Single-player, offline-first Android survival RPG.
- No rounds, waves, arena boundaries, or timer-driven enemy escalations.
- The world persists as a seeded ecosystem. Infected move, investigate stimuli,
  feed, and migrate whether or not the player is nearby.
- Technology is earned through materials, discoveries, tools, and workstations;
  crafting never advances automatically by elapsed play time.
- Simulation and presentation are separate. Rendering can simplify or omit
  distant entities without changing authoritative world state.
- Target mid-range Android hardware first. Preserve a stable frame time and
  memory ceiling before increasing visible population or world detail.

The initial implementation is a Three.js/Capacitor application. Keep gameplay
systems engine-independent JavaScript modules and isolate Three.js behind the
world presentation adapter. This permits incremental replacement of the
prototype without coupling saved data or rules to scene objects.

## 1. Runtime architecture

### Module boundaries

```text
src/
  app/
    bootstrap.js             # construction, lifecycle, dependency wiring
    game-loop.js             # fixed-step simulation and render interpolation
    input-router.js          # touch, keyboard, and gesture normalization
  core/
    clock.js                 # monotonic game clock, calendar, pause handling
    event-bus.js             # typed domain events; no direct UI dependencies
    rng.js                   # seeded random streams per region/system
    save-service.js          # versioned, atomic local persistence
  world/
    world-manager.js         # tile lifecycle and biome/POI queries
    tile-generator.js        # deterministic terrain and placement
    streaming-scheduler.js   # prioritization and upload budget
    navigation.js            # local nav meshes/grids and obstacle queries
    weather-system.js        # local fronts, rain, fog, wind
    ecology-system.js        # population, migration, feeding, decomposition
    sound-field.js           # acoustic propagation and event decay
    scent-field.js           # blood/survivor scent transport and decay
  actors/
    player-controller.js     # movement intent, stance, collision
    player-vitals.js         # hunger, thirst, temperature, infection, health
    zombie-director.js       # persistent population and group behavior
    zombie-perception.js     # vision, hearing, scent evidence
    zombie-brain.js          # sensory state machine and intent
  items/
    item-catalog.json        # immutable item definitions
    inventory.js             # stack/container operations and transactions
    equipment.js             # equipped items and condition
    recipes.json             # recipe definitions and unlock requirements
    crafting-system.js       # validation, station, time, and output transaction
    progression.js           # tier prerequisites and discovery flags
  combat/
    weapon-catalog.json      # weapon and ammunition definitions
    weapon-runtime.js        # magazine, chamber, heat, condition, jam
    ballistics.js            # projectile simulation and hit resolution
    combat-system.js         # damage, wounds, stagger, durability
  presentation/
    three-world-view.js      # meshes, instancing, LOD, effects, audio
    camera-rig.js            # follow, aim, zoom, collision
    hud-controller.js        # read-only view of game state
    asset-cache.js           # ref-counted CPU/GPU asset lifetime
  data/
    biomes.json
    points-of-interest.json
    zombie-archetypes.json
    items.json
    recipes.json
```

Systems receive dependencies at construction and communicate through commands,
queries, and domain events. For example, `Inventory.tryCraft()` returns a
transaction result; the HUD listens for `inventory.changed` and does not edit
inventory state itself.

### Simulation cadence and authority

- Run simulation on a fixed 20 Hz step (`dt = 0.05 s`) with an accumulator;
  render independently at display refresh rate and interpolate transforms.
- Cap catch-up work after suspension. Advance the world clock by measured
  elapsed time, but analytically update low-frequency systems rather than
  simulating hundreds of missed frames.
- Update nearby active actors every simulation step. Update distant groups,
  vitals, weather, and ecology on staggered 0.5–10 second schedules.
- Use double-precision world coordinates for tile identity and local floating
  origin coordinates for rendering. Rebase the render origin near the player.
- Use seeded PRNG streams per tile/system so loading a tile does not reroll
  unrelated weather, loot, wildlife, or infected behavior.
- `WorldState` is authoritative. Meshes, animations, particles, and UI are
  disposable projections of it.

## 2. World and ecosystem

### Seamless tile streaming

Represent the world as an unbounded, deterministic grid of 128 m square tiles.
Each tile has a stable integer coordinate, biome ID, seed, persistent summary,
and optional POI records. Subdivide each tile into 32 m cells for navigation,
ecology, sound, scent, and local simulation.

1. When the player approaches a tile boundary, request adjacent tile data
   asynchronously. Generate terrain, roads, vegetation placement, and POI
   manifests off the render-critical path.
2. Keep the current tile and its 8 neighbors at full collision and gameplay
   detail. Keep a second ring as low-detail visual terrain and aggregate
   population only. Do not create distant individual zombie meshes.
3. Upload geometry and textures incrementally under a per-frame budget; use
   compressed textures, instanced foliage/debris, pooled effects, and LOD
   meshes. Avoid synchronous disk reads and shader compilation during combat.
4. Do not display a loading screen for ordinary travel. If a device falls
   behind, reduce foliage, distant animation, shadow resolution, and LOD
   transition distance before reducing simulation correctness.
5. On unload, write the tile's compact persistent summary and release GPU
   resources through reference-counted caches. Recreate presentation from the
   seed and saved deltas when revisited.

Initial performance budget for a mid-range Android device:

| Resource | Starting budget |
|---|---:|
| Active visible individual infected | 24, with pooled meshes |
| Full-detail simulation radius | 128 m |
| Aggregate simulation radius | 384 m |
| Active tile geometry and textures | 160 MiB GPU target |
| Cached CPU world data | 96 MiB target |
| Newly uploaded data | 2 MiB/frame maximum |
| Frame target | 30 FPS minimum; 60 FPS when device allows |

These are profiling targets, not correctness limits. Measure on real devices
and degrade visual fidelity adaptively. Population caps may reduce rendered
nearby detail, but must never create a wave or teleport an enemy into range.

### Biomes, routes, and points of interest

- **Wilderness:** temperate forest, rocky hills, river/lake basins, wetlands.
  Resources include wood, stone, fibers, edible plants, wildlife, and water.
- **Deep forest:** limited sightlines, dampened distant sound, dense vegetation,
  higher navigation risk, shelter and hunting opportunities.
- **Rural fringe:** farms, cabins, barns, roads, utility poles, wells, and small
  infected populations.
- **Abandoned towns:** houses, shops, clinics, workshops, storage, roads, and
  small power/water networks. Loot is finite and locally depleted.
- **Ruined megacity:** districts, blocked streets, high verticality, interiors,
  dense acoustic propagation, and larger persistent infected populations.

Generate a coarse regional graph first: biome zones, rivers, roads, and POI
anchors. Generate detail only when tiles stream in. Roads and rivers cross
boundaries through shared edge descriptors so tile seams align. POIs are
authored prefabs assembled from modular pieces and seeded variations, rather
than unbounded expensive procedural interiors.

### Time, weather, and hazards

`WorldClock` stores world seconds, day index, and season. Sun elevation drives
ambient intensity and shadow direction. Infected perception reads local
illumination; at night, sight range falls but ordinary visual stealth is not
replaced by an arbitrary aggression multiplier.

Weather is a set of regional fronts with temperature, precipitation, cloud,
fog, wind direction, and intensity. Weather changes gradually and is sampled
per tile. Rain wets clothing, cools exposed players, masks some footstep sound,
and washes scent trails faster. Fog lowers visual range for both player and
infected. Wind advects scent fields and changes how far sound carries.

Environmental hazards include cold exposure, heat, deep water, unsafe food,
contaminated water, smoke/fire, and unstable structures. Each hazard has
readable cues, exposure rates, mitigation, and recovery; avoid hidden damage.

### Persistent ecology (not waves)

Each tile stores aggregate counts and group records for infected and wildlife.
Active actors move with navigation and react to local events. Distant actors
advance by coarse time steps using migration, feeding, noise response, and
survival rules. Infected may enter through roads, buildings, or wilderness
routes, but only as members of the existing population/ecology model.

```ts
type TileId = `${number}:${number}`;
type TileSummary = {
  id: TileId;
  seed: number;
  biome: string;
  discovered: boolean;
  lootLedger: Record<string, number>;
  infectedGroups: InfectedGroupRecord[];
  wildlife: WildlifeRecord[];
  structures: StructureRecord[];
  changedAtWorldSecond: number;
};

type InfectedGroupRecord = {
  id: string;
  count: number;
  archetype: string;
  localCell: number;
  goal: "wander" | "feed" | "investigate" | "migrate" | "shelter";
  lastSimulatedAt: number;
};
```

## 3. Survival vitals and sensory AI

### Player state

```ts
type PlayerVitals = {
  health: number;             // 0..100; zero is death/downed
  hunger: number;             // 0..100; decreases over world time
  thirst: number;             // 0..100; decreases faster than hunger
  stamina: number;            // 0..100; movement/action reserve
  coreTemperatureC: number;
  infection: number;          // 0..100 exposure/progression
  bloodLoss: number;           // 0..100
  fatigue: number;             // 0..100
  wetness: number;             // 0..100 clothing saturation
  wounds: Wound[];
  lastFoodAt: number;
  lastDrinkAt: number;
};
```

Vitals change continuously with explicit, inspectable rates. Hunger and thirst
reduce stamina recovery and eventually health; they should not instantly kill
the player. Temperature uses ambient temperature, wind, wetness, clothing
insulation, shelter, exertion, and fire warmth. Stamina drains from sprinting,
melee, climbing, and heavy carry load, and recovers with rest, food, hydration,
and sleep.

Infection is a staged condition: exposure event → incubation → symptomatic
progression → critical state. Bite severity, wound treatment, medicine,
cleanliness, and time affect progression. Infection is not a binary random
death timer. Communicate exposure and symptoms and make prevention/treatment
learnable and lootable.

### Stealth evidence model

Stealth is not a single invisibility stat. Player actions emit stimuli with
position, intensity, type, and time. Clothing, stance, movement speed, surface,
weather, and wounds modify sensory evidence:

- **Sight:** view cone, distance, line-of-sight ray test, light level, fog,
  motion, contrast, and obstruction.
- **Sound:** footfalls, weapons, doors, crafting, impacts, and speech enter an
  acoustic grid. Propagation considers distance, walls, terrain, rain, wind,
  and material absorption. A sound creates a noisy location estimate, not
  omniscient knowledge of the player.
- **Scent:** blood, spoiled food, and player odor create decaying scalar fields.
  Wind advects the field across cells. Rain and elapsed time reduce it. Scent
  guides infected toward a trail; it does not reveal exact coordinates.

Player movement intent emits a stimulus, for example:

```js
emitStimulus({
  kind: "footstep",
  position: player.position,
  intensity: stance === "crouch" ? 0.12 : stance === "walk" ? 0.45 : 1.0,
  surface: world.surfaceAt(player.position),
  sourceId: player.id,
});
```

### Infected sensory state machine

Use evidence with confidence and age. Each infected retains a last-known
position, stimulus type, confidence, and investigation deadline.

```text
IDLE/WANDER
  ├─ weak sound/scent → INVESTIGATE
  ├─ clear sight → PURSUE_SIGHT
  └─ group goal / food source → MOVE_TO_GOAL

INVESTIGATE
  ├─ new evidence → update estimate and investigate
  ├─ sight acquired → PURSUE_SIGHT
  └─ evidence expires → SEARCH_LAST_KNOWN → IDLE/WANDER

PURSUE_SIGHT
  ├─ target obscured → SEARCH_LAST_KNOWN
  ├─ target reachable → ATTACK
  └─ sound/scent stronger than visual track → INVESTIGATE_TRAIL

INVESTIGATE_TRAIL
  ├─ scent gradient continues → follow strongest neighbor cell
  ├─ sound estimate updates → move toward uncertain location
  ├─ sight acquired → PURSUE_SIGHT
  └─ evidence decays → SEARCH_LAST_KNOWN

SEARCH_LAST_KNOWN
  ├─ new evidence → matching investigate/pursue state
  └─ bounded search exhausted → IDLE/WANDER

ATTACK
  ├─ player escapes reach → pursue/search
  └─ player hidden → investigate last known position
```

Run nearby brains at 5–10 Hz with bounded perception queries. Use spatial
indices to find nearby stimuli and a small number of ray tests per tick. Use
group leaders to share weak evidence between nearby infected, with confidence
loss and delay. Infected never receive exact player coordinates solely because
the simulation was unloaded.

## 4. Technology and crafting

### Progression gates

Tiers describe capabilities, not eras forced by a calendar. A player can find
advanced equipment early, but sustaining, repairing, and reproducing it requires
knowledge, facilities, and supply chains.

1. **Stone Age:** stone tools, wooden spear, bow primitive components, plant
   fiber, campfire, basic shelter, and safe cooking.
2. **Scavenger Era:** scrap tools, improvised melee, workbench, repaired
   equipment, crude bow/crossbow, and basic storage.
3. **Industrial Era:** black powder, metalworking, pipe weapons, generators,
   wiring, battery charging, and water purification.
4. **Modern Era:** machined firearms, reliable ammunition, electric defenses,
   advanced medical supplies, and higher-capacity power systems.

Unlocks require a combination of discoveries (manuals, schematics, observed
objects), skill practice, and access to the right station. Tier is not a
global level that blocks scavenging or using found objects.

### Data blueprint

Items and recipes are data-only. Recipe output is committed only after all
requirements have been validated and ingredient quantities reserved.

```json
{
  "schemaVersion": 1,
  "recipes": [
    {
      "id": "tool.stone_knife",
      "name": "Stone Knife",
      "tier": 1,
      "station": null,
      "craftSeconds": 18,
      "unlocks": [],
      "requires": {
        "items": [
          { "id": "resource.stone_sharp", "count": 1 },
          { "id": "resource.plant_fiber", "count": 2 }
        ],
        "discoveries": [],
        "skill": { "id": "survival", "level": 0 }
      },
      "outputs": [{ "id": "tool.stone_knife", "count": 1 }],
      "byproducts": []
    },
    {
      "id": "structure.campfire",
      "name": "Campfire",
      "tier": 1,
      "station": null,
      "craftSeconds": 25,
      "unlocks": ["knowledge.firecraft"],
      "requires": {
        "items": [
          { "id": "resource.branch", "count": 6 },
          { "id": "resource.stone", "count": 4 },
          { "id": "resource.plant_fiber", "count": 1 }
        ],
        "discoveries": ["discovery.fire"],
        "skill": { "id": "survival", "level": 1 }
      },
      "outputs": [{ "id": "structure.campfire_kit", "count": 1 }],
      "byproducts": []
    },
    {
      "id": "weapon.wood_spear",
      "name": "Wooden Spear",
      "tier": 1,
      "station": null,
      "craftSeconds": 30,
      "unlocks": [],
      "requires": {
        "items": [
          { "id": "resource.long_branch", "count": 1 },
          { "id": "resource.stone_sharp", "count": 1 },
          { "id": "resource.plant_fiber", "count": 2 }
        ],
        "discoveries": [],
        "skill": { "id": "survival", "level": 1 }
      },
      "outputs": [{ "id": "weapon.wood_spear", "count": 1 }],
      "byproducts": []
    },
    {
      "id": "station.workbench",
      "name": "Workbench",
      "tier": 2,
      "station": null,
      "craftSeconds": 90,
      "unlocks": ["knowledge.scrap_working"],
      "requires": {
        "items": [
          { "id": "resource.plank", "count": 8 },
          { "id": "resource.scrap_metal", "count": 6 },
          { "id": "resource.rope", "count": 2 }
        ],
        "discoveries": ["discovery.hand_tools"],
        "skill": { "id": "crafting", "level": 2 }
      },
      "outputs": [{ "id": "station.workbench_kit", "count": 1 }],
      "byproducts": []
    },
    {
      "id": "weapon.crude_crossbow",
      "name": "Crude Crossbow",
      "tier": 2,
      "station": "station.workbench",
      "craftSeconds": 180,
      "unlocks": ["knowledge.crossbow"],
      "requires": {
        "items": [
          { "id": "resource.plank", "count": 4 },
          { "id": "resource.scrap_metal", "count": 3 },
          { "id": "resource.rope", "count": 2 }
        ],
        "discoveries": ["discovery.crossbow_diagram"],
        "skill": { "id": "crafting", "level": 3 }
      },
      "outputs": [{ "id": "weapon.crude_crossbow", "count": 1 }],
      "byproducts": []
    },
    {
      "id": "weapon.pipe_gun",
      "name": "Pipe Gun",
      "tier": 3,
      "station": "station.workbench",
      "craftSeconds": 360,
      "unlocks": ["knowledge.black_powder"],
      "requires": {
        "items": [
          { "id": "resource.steel_pipe", "count": 1 },
          { "id": "resource.scrap_metal", "count": 5 },
          { "id": "resource.spring", "count": 1 },
          { "id": "ammo.black_powder_round", "count": 3 }
        ],
        "discoveries": ["discovery.pipe_weapon_design"],
        "skill": { "id": "engineering", "level": 2 }
      },
      "outputs": [{ "id": "weapon.pipe_gun", "count": 1 }],
      "byproducts": []
    },
    {
      "id": "station.generator",
      "name": "Small Generator",
      "tier": 3,
      "station": "station.workbench",
      "craftSeconds": 900,
      "unlocks": ["knowledge.basic_electricity"],
      "requires": {
        "items": [
          { "id": "resource.engine_part", "count": 1 },
          { "id": "resource.copper_wire", "count": 8 },
          { "id": "resource.fuel", "count": 5 },
          { "id": "resource.scrap_metal", "count": 12 }
        ],
        "discoveries": ["discovery.generator_manual"],
        "skill": { "id": "engineering", "level": 3 }
      },
      "outputs": [{ "id": "station.generator_kit", "count": 1 }],
      "byproducts": []
    },
    {
      "id": "utility.water_purifier",
      "name": "Water Purifier",
      "tier": 3,
      "station": "station.workbench",
      "craftSeconds": 300,
      "unlocks": [],
      "requires": {
        "items": [
          { "id": "resource.charcoal", "count": 4 },
          { "id": "resource.cloth", "count": 2 },
          { "id": "resource.metal_container", "count": 1 }
        ],
        "discoveries": ["discovery.water_filtration"],
        "skill": { "id": "crafting", "level": 3 }
      },
      "outputs": [{ "id": "utility.water_purifier", "count": 1 }],
      "byproducts": []
    },
    {
      "id": "weapon.machined_rifle",
      "name": "Machined Rifle",
      "tier": 4,
      "station": "station.machine_shop",
      "craftSeconds": 2400,
      "unlocks": ["knowledge.modern_firearms"],
      "requires": {
        "items": [
          { "id": "resource.machine_barrel", "count": 1 },
          { "id": "resource.receiver_assembly", "count": 1 },
          { "id": "resource.spring_steel", "count": 3 },
          { "id": "resource.precision_tools", "count": 1 }
        ],
        "discoveries": ["discovery.rifle_blueprint"],
        "skill": { "id": "engineering", "level": 5 }
      },
      "outputs": [{ "id": "weapon.machined_rifle", "count": 1 }],
      "byproducts": [{ "id": "resource.metal_shavings", "count": 2 }]
    },
    {
      "id": "defense.electric_fence",
      "name": "Electric Fence Section",
      "tier": 4,
      "station": "station.workbench",
      "craftSeconds": 240,
      "unlocks": [],
      "requires": {
        "items": [
          { "id": "resource.fence_post", "count": 2 },
          { "id": "resource.copper_wire", "count": 4 },
          { "id": "resource.insulator", "count": 2 }
        ],
        "discoveries": ["discovery.electric_defense"],
        "skill": { "id": "engineering", "level": 4 },
        "power": { "watts": 40, "source": "connected_grid" }
      },
      "outputs": [{ "id": "defense.electric_fence", "count": 1 }],
      "byproducts": []
    },
    {
      "id": "medical.advanced_medkit",
      "name": "Advanced Medkit",
      "tier": 4,
      "station": "station.medical_bench",
      "craftSeconds": 300,
      "unlocks": [],
      "requires": {
        "items": [
          { "id": "medical.antibiotic", "count": 1 },
          { "id": "medical.antiseptic", "count": 2 },
          { "id": "medical.bandage_sterile", "count": 3 }
        ],
        "discoveries": ["discovery.advanced_first_aid"],
        "skill": { "id": "medicine", "level": 4 }
      },
      "outputs": [{ "id": "medical.advanced_medkit", "count": 1 }],
      "byproducts": []
    }
  ]
}
```

### Item and inventory model

```ts
type ItemDefinition = {
  id: string;
  category: string;
  maxStack: number;
  massKg: number;
  tags: string[];
  durabilityMax?: number;
  containerSlots?: number;
  perishSeconds?: number;
};

type ItemStack = {
  instanceId: string;
  itemId: string;
  count: number;
  durability?: number;
  condition?: number;
  metadata?: Record<string, string | number | boolean>;
};

type InventoryState = {
  containers: Record<string, {
    slotLimit: number;
    massLimitKg: number;
    slots: Array<ItemStack | null>;
  }>;
};
```

Inventory operations are atomic transactions:

1. Resolve item definitions; reject unknown IDs, invalid quantities, and
   negative counts.
2. Check both slot and mass limits, container restrictions, equipped weight,
   and reserved ingredients.
3. Plan stack merges/splits without mutation.
4. Commit all removals/additions together, or commit nothing.
5. Emit one change event containing affected containers and item deltas.

Crafting follows the same prepare/commit model. Validate recipe unlock,
ingredients, station tags, power, skill, and output capacity first. Reserve
ingredients when a timed job starts. At completion, commit output; on
cancellation, return reserved ingredients according to recipe policy. Persist
job progress and reservations so app suspension cannot duplicate ingredients.

## 5. Weaponry and combat

### Weapon state

```ts
type WeaponState = {
  weaponId: string;
  durability: number;          // 0..1; affects reliability and accuracy
  condition: number;           // fouling/rust/wetness aggregate
  chamberedRound: string | null;
  magazineInstanceId: string | null;
  heat: number;
  jammed: boolean;
  fireMode: "semi" | "burst" | "auto";
  aimProgress: number;         // 0..1
  recoil: { pitch: number; yaw: number };
};
```

Magazines are inventory objects with their own capacity and ordered ammunition
state. Loose rounds and magazines are distinct resources. Weapon definitions
specify caliber, muzzle velocity, projectile mass, sight alignment, recoil,
reload timings, durability wear, and accepted magazine/ammunition IDs.

### Aiming, movement, recoil, and ballistics

- Right virtual stick controls yaw and pitch; the camera supplies the aim ray.
  The left stick controls movement relative to camera facing.
- Aim progress takes time and is interrupted by sprint, large turns, injury,
  and low stamina. Hip-fire has wider spread than a fully aimed shot.
- Recoil adds a deterministic weapon impulse plus bounded seeded variation.
  Recovery is gradual and slower while moving, injured, tired, or using a
  heavier weapon.
- Spread combines weapon base spread, aim progress, stance, movement speed,
  stamina, condition, and recoil. Crouching reduces sway and sound; it does not
  make a moving shot perfectly accurate.
- Projectiles use a bounded lifetime and velocity integration. Gravity
  produces drop; drag can be approximated by ammunition class. Resolve hits
  against collision proxies, not rendered triangles. Penetration is a data
  property and limited by material thickness.
- Standing/walking/sprinting each apply different sway and spread multipliers.
  Crouching lowers the silhouette and sway; prone can be considered after the
  first mobile prototype due to animation/UI complexity.

### Tactical and empty reload state machine

```text
READY → RELOAD_EJECT → RELOAD_INSERT → CHAMBER → READY
```

- Tactical reload preserves a chambered round. Detachable magazines are
  removed as item instances and returned to inventory, retaining their
  ammunition count. If there is no room, the magazine goes to a defined
  temporary/ground destination; it is never silently deleted.
- Empty reload has an explicit empty-magazine path and charging-handle/bolt
  action where the weapon requires it.
- Reload stages can be interrupted by firing only if the weapon is ready and
  a round is chambered; otherwise an interrupt leaves the current physical
  magazine/chamber state intact.
- Starting a reload does not instantly transfer ammunition. Sound stimulus
  occurs at the relevant action stage.

### Jamming and condition

Each shot increments condition wear based on weapon, ammunition, weather, and
heat. A jam roll is made per shot with a bounded reliability curve:

```text
jamChance = baseJam
          + fouling * foulingFactor
          + wetness * wetFactor
          + (1 - durability) * wearFactor
          + overheat * heatFactor
```

Clamp to a small authored maximum, show the malfunction clearly, and provide a
reliable manual clear action. Maintenance uses materials and time at suitable
stations. The player can still use a degraded weapon; avoid durability as a
hidden binary timer that destroys scarce items arbitrarily.

## 6. Mobile controls and UX

Use a landscape-first HUD with safe-area insets. Support portrait only if
playtests confirm target visibility and control reach.

- **Left lower quadrant:** dynamic movement joystick; magnitude controls walk
  speed. A nearby stance/sprint modifier supports crouch and sprint without
  requiring a second movement gesture.
- **Right lower quadrant:** right virtual stick for 360° camera yaw and pitch.
  Dead zone and sensitivity are adjustable; invert Y is an option.
- **Right-side action cluster:** context-sensitive use/interact, fire/melee,
  aim, reload, and jump/climb. Avoid covering the central aiming area.
- **Quick access:** 4–6 configurable hotbar slots for tools, consumables, and
  weapon selection. Long-press opens radial selection.
- **Inventory/crafting:** full-screen panels pause or slow simulation
  according to a user-visible setting. Drag/drop and tap-to-transfer both
  supported. Show mass, stack limits, ingredients, station requirements, and
  unavailable reasons.
- **Camera gestures:** two-finger pinch controls camera distance within
  collision-safe bounds; one-finger drag on the right side controls aim.
  Gesture ownership is captured on pointer-down so input does not jump when
  fingers cross UI boundaries.
- **Accessibility:** left-handed layout, button scale, sensitivity, haptics,
  hold/toggle sprint and aim, reduced screen shake, and readable high-contrast
  status indicators.

The camera uses a spring arm with collision shortening. Camera rotation is
decoupled from character facing until the player moves or fires; movement
direction is camera-relative. Camera zoom is clamped and smoothed, and pinch
does not also trigger aim movement.

## 7. Save, recovery, and content validation

Persist a versioned root snapshot with player state, inventory, discovered
knowledge, world clock, current tile, changed tile summaries, and settings.
Save to a new slot, validate checksum and schema, then atomically promote it as
the active save. Keep one previous valid snapshot for recovery. Never serialize
Three.js objects, functions, textures, meshes, or runtime references.

```ts
type SaveRoot = {
  schemaVersion: number;
  gameVersion: string;
  saveId: string;
  worldSeed: number;
  savedAtUtc: string;
  worldClock: number;
  player: PlayerSave;
  inventory: InventoryState;
  progression: ProgressionSave;
  activeTile: TileId;
  tileDeltas: Record<TileId, TileSummary>;
  settings: SettingsSave;
};
```

Migrations are pure functions from schema N to N+1 and tested against fixture
saves. Invalid saves must surface an error and offer recovery; never silently
start a fresh game over a failed load.

Validate data catalogs at build/test time: unique IDs, valid references,
nonnegative quantities, valid recipe graph, stack limits, known stations,
weapon ammunition compatibility, and no progression recipe cycles. Add
deterministic tests for inventory transactions, crafting cancellation,
vitals rates, perception transitions, tile edge continuity, and save migration.

## 8. Delivery plan

This is a large rebuild, not a patch to the existing wave shooter. Deliver in
playable vertical slices and publish a new APK only when each slice is
integrated and device-tested.

1. **Foundation:** modular runtime, fixed-step clock, seeded tile coordinates,
   save schema, input router, and performance HUD.
2. **Survival slice:** one forest tile, one rural POI, walk/crouch/sprint,
   hunger/thirst/temperature, gathering, campfire, and persistence.
3. **Persistent infected:** authored population in local tiles, sight/sound/
   scent evidence, investigation/search, melee, wounds, and no wave system.
4. **Scavenging and progression:** inventory transactions, Tier 1–2 recipes,
   workbench, discoveries, and finite loot.
5. **World expansion:** town and city biome tiles, streamed roads/interiors,
   rain/fog/day-night, aggregate distant ecology, and memory profiling.
6. **Weapons and industry:** projectile combat, magazines, reload states,
   maintenance/jams, Tier 3–4 power and crafting.
7. **Release hardening:** Android device testing, save migration tests,
   accessibility/input tuning, thermal/performance profiling, and signed
   distribution planning.

The first milestone should replace the existing wave loop entirely and prove
one persistent forest-to-town travel route, survival supplies, and sensory
infected. Megacity scale and late-tier electricity follow after streaming,
saves, and mobile performance are validated.
