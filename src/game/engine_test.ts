import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertGreater,
  assertNotEquals,
} from "@std/assert";
import {
  createGameState,
  createStateFromCheckpoint,
  dispatchGameAction,
  jumpToTestLevel,
  stepGame,
} from "./engine.ts";
import { checkpointFromState } from "./persistence.ts";
import type { ArcadeInput, Enemy, GameState, Projectile } from "./types.ts";

const idleInput: ArcadeInput = {
  movement: { x: 0, y: 0 },
  aim: { x: 300, y: 150 },
  firing: false,
  secondary: false,
  reload: false,
  dash: false,
};

Deno.test("local test level jumps initialize encounters, minibosses, and bosses", () => {
  const state = createGameState(500, 300);

  jumpToTestLevel(state, { actIndex: 1, kind: "encounter", encounterIndex: 2 });
  assertEquals(state.phase, "encounter");
  assertEquals(state.actIndex, 1);
  assertEquals(state.encounterIndex, 2);
  assertEquals(state.banner, "Mirror Storm");

  jumpToTestLevel(state, { actIndex: 0, kind: "miniboss" });
  assertEquals(state.phase, "miniboss");
  assertEquals(state.actIndex, 0);
  assertEquals(state.enemies[0]?.bossKind, "backfill-daemon");

  jumpToTestLevel(state, { actIndex: 2, kind: "boss" });
  assertEquals(state.phase, "boss");
  assertEquals(state.actIndex, 2);
  assertEquals(state.enemies[0]?.bossKind, "admin");
});

function activeState(seed = 7, mode: "normal" | "hard" = "normal") {
  return createGameState(500, 300, { seed, mode, phase: "encounter" });
}

function backlogBossState() {
  const state = activeState();
  state.encounterIndex = 2;
  state.objectiveProgress = state.objectiveTarget;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  dispatchGameAction(state, {
    type: "chooseUpgrade",
    upgradeId: state.offeredUpgrades[0],
  });
  return state;
}

function activateBacklogBoss(state: GameState) {
  while (state.backlogIntroStage < 5) {
    stepGame(state, { ...idleInput, firing: true }, 1 / 60, () => 0.5);
    stepGame(state, idleInput, 1 / 60, () => 0.5);
  }
}

function enemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 1,
    kind: "file",
    x: 160,
    y: 150,
    radius: 11,
    speed: 0,
    health: 1,
    maxHealth: 1,
    points: 12,
    damage: 1,
    aimAngle: 0,
    behaviorCooldown: 10,
    warningFor: 0,
    phase: 0,
    orbitDirection: 1,
    splitGeneration: 0,
    dashFor: 0,
    dashX: 0,
    dashY: 0,
    elite: false,
    ...overrides,
  };
}

function projectile(overrides: Partial<Projectile> = {}): Projectile {
  return {
    id: 1,
    x: 160,
    y: 150,
    previousX: 150,
    previousY: 150,
    vx: 0,
    vy: 0,
    radius: 3,
    damage: 1,
    pierce: 0,
    life: 1,
    friendly: true,
    hitIds: [],
    bouncesRemaining: 0,
    reflected: false,
    ...overrides,
  };
}

function sequenceRandom(values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

Deno.test("arcade runs with the same seed are deterministic", () => {
  const first = activeState(1234);
  const second = activeState(1234);

  for (let frame = 0; frame < 600; frame++) {
    stepGame(first, idleInput, 1 / 60);
    stepGame(second, idleInput, 1 / 60);
  }

  assertEquals(first.rngState, second.rngState);
  assertEquals(first.enemies, second.enemies);
  assertEquals(first.score, second.score);
});

Deno.test("arcade player movement stays inside the arena", () => {
  const state = activeState();
  state.player.x = 490;
  state.spawnCooldown = 10;

  stepGame(state, { ...idleInput, movement: { x: 1, y: 0 } }, 1, () => 0.5);

  assertEquals(state.player.x, 487);
  assertEquals(state.player.y, 150);
});

Deno.test("a new run starts without a shield", () => {
  const state = activeState();

  assertEquals(state.player.shield, 0);
});

Deno.test("fixed timesteps produce stable player movement", () => {
  const sixtyFps = activeState();
  const thirtyFps = activeState();
  sixtyFps.spawnCooldown = 100;
  thirtyFps.spawnCooldown = 100;
  const input = { ...idleInput, movement: { x: 0, y: -1 } };

  for (let frame = 0; frame < 60; frame++) stepGame(sixtyFps, input, 1 / 60);
  for (let frame = 0; frame < 30; frame++) stepGame(thirtyFps, input, 1 / 30);

  assertEquals(Math.round(sixtyFps.player.y), Math.round(thirtyFps.player.y));
});

Deno.test("arcade firing creates weapon projectiles", () => {
  const state = activeState();
  state.spawnCooldown = 10;

  stepGame(state, { ...idleInput, firing: true }, 1 / 60, () => 0.5);

  assertEquals(state.projectiles.length, 1);
  assertGreater(state.projectiles[0].vx, 0);
  assertEquals(state.projectiles[0].friendly, true);
});

Deno.test("dash grants temporary invulnerability and moves quickly", () => {
  const state = activeState();
  state.spawnCooldown = 10;
  const before = state.player.x;

  stepGame(
    state,
    { ...idleInput, movement: { x: 1, y: 0 }, dash: true },
    1 / 60,
    () => 0.5,
  );

  assertGreater(state.player.x - before, 8);
  assertGreater(state.player.invulnerableFor, 0);
  assertGreater(state.player.dashCooldown, 2);
});

Deno.test("swept collision removes an enemy crossed between frames", () => {
  const state = activeState();
  state.spawnCooldown = 10;
  state.enemies = [enemy({ x: 180 })];
  state.projectiles = [
    projectile({ x: 130, previousX: 130, vx: 3600, life: 1 }),
  ];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.enemies.length, 0);
  assertGreater(state.score, 0);
});

Deno.test("hostile projectiles damage the player once", () => {
  const state = activeState();
  state.spawnCooldown = 10;
  state.player.invulnerableFor = 0;
  state.projectiles = [
    projectile({
      x: state.player.x,
      y: state.player.y,
      previousX: state.player.x,
      previousY: state.player.y,
      friendly: false,
    }),
  ];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.player.health, 2);
  assertGreater(state.player.invulnerableFor, 0);
});

Deno.test("finishing an encounter offers three non-maxed upgrades", () => {
  const state = activeState();
  state.spawnCooldown = 10;
  state.objectiveProgress = state.objectiveTarget;

  stepGame(state, idleInput, 1 / 60);

  assertEquals(state.phase, "reward");
  assertEquals(state.offeredUpgrades.length, 3);
  dispatchGameAction(state, {
    type: "chooseUpgrade",
    upgradeId: state.offeredUpgrades[0],
  });
  assertEquals(state.phase, "encounter");
  assertEquals(state.encounterIndex, 1);
});

Deno.test("the Backlog Behemoth organizes a wall before revealing the ruse", () => {
  const state = backlogBossState();
  const boss = state.enemies.find((candidate) => candidate.kind === "boss");
  assert(boss);

  assertEquals(boss.bossKind, "backlog");
  assertEquals(boss.maxHealth, 4);
  assertEquals(state.backlogTiles.length, 32);
  assertEquals(state.backlogIntroStage, 1);
  assertEquals(boss.x, state.width / 2);
  assertEquals(boss.y, state.height / 2);
  assertEquals(state.backlogFightStarts, 0);
  assertEquals(state.bossDialogue?.text, "Oh, good. Cleanup is here.");

  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.backlogIntroStage, 1);

  stepGame(state, { ...idleInput, firing: true }, 1 / 60, () => 0.5);
  assertEquals(state.backlogIntroStage, 2);
  stepGame(state, { ...idleInput, firing: true }, 1 / 60, () => 0.5);
  assertEquals(state.backlogIntroStage, 2);
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  stepGame(state, { ...idleInput, secondary: true }, 1 / 60, () => 0.5);
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.backlogIntroStage, 3);
  assertEquals(
    state.bossDialogue?.text,
    "There. Neat, labeled,\nand absolutely permanent.",
  );
  assertEquals(boss.y, state.height / 2);

  stepGame(state, { ...idleInput, firing: true }, 1 / 60, () => 0.5);
  assertEquals(state.backlogIntroStage, 4);
  assertEquals(state.bossDialogue?.tone, "danger");
  assert(boss.y < state.height / 2);

  activateBacklogBoss(state);
  assertEquals(state.backlogIntroStage, 5);
  assertEquals(state.backlogFightStarts, 1);
  assertEquals(state.banner, "BREAK THE BACKLOG");
  assertEquals(state.backlogTargetColumn, 4);
  assertEquals(
    state.backlogTiles.filter((tile) => tile.column === state.backlogTargetColumn).length,
    4,
  );
  assert(state.bossDialogue?.text.includes("eight to ten years"));
});

Deno.test("ordinary fire is absorbed by the bomb-proof backlog", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const boss = state.enemies[0];
  const tile = state.backlogTiles[0];
  const tileHealth = tile.health;
  state.projectiles = [projectile({
    x: tile.x,
    y: tile.y + tile.height / 2 + 8,
    previousX: tile.x,
    previousY: tile.y + tile.height / 2 + 8,
    vy: -1000,
  })];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(tile.health, tileHealth);
  assertEquals(boss.health, 4);
});

Deno.test("the Backlog Behemoth visibly lobs each bomb over its barricade", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const boss = state.enemies[0];
  state.backlogBombCooldown = 0;

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogBombs.length, 1);
  assertEquals(state.backlogBombs[0].x, boss.x);
  assertGreater(state.backlogBombs[0].lobFor, 0);
  assertEquals(state.backlogBombs[0].returned, false);
});

Deno.test("the Behemoth resumes taunting when it lobs new gold balls", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.bossDialogue = null;
  state.backlogBombCooldown = 0;
  state.backlogRedBombCooldown = 99;

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogBombs.length, 1);
  const dialogue = (state as GameState).bossDialogue;
  assert(dialogue);
  assertEquals(
    dialogue.text,
    "I alphabetized these explosives by blast radius.",
  );
});

Deno.test("the player remains below the backlog blockline", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogBombCooldown = 99;
  state.backlogRedBombCooldown = 99;
  const wallBottom = Math.max(...state.backlogTiles.map((tile) => tile.y + tile.height / 2));

  for (let index = 0; index < 30; index++) {
    stepGame(
      state,
      { ...idleInput, movement: { x: 0, y: -1 }, dash: index === 0 },
      1 / 20,
      () => 0.5,
    );
  }

  assertGreater(state.player.y, wallBottom + 13);
});

Deno.test("Backlog wipe intermissions remove the invisible blockline boundary", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const wallBottom = Math.max(...state.backlogTiles.map((tile) => tile.y + tile.height / 2));
  state.backlogTiles = [];
  state.backlogIntermissionStage = 2;
  state.backlogIntermissionFor = 10;
  state.player.y = wallBottom + 20;

  for (let index = 0; index < 30; index++) {
    stepGame(
      state,
      { ...idleInput, movement: { x: 0, y: -1 } },
      1 / 20,
      () => 0.5,
    );
  }

  assert(state.player.y < wallBottom);
});

Deno.test("gold returns and red bursts run on independent random schedules", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const originalTileX = state.backlogTiles[8].x;
  state.backlogHits = 2;
  state.backlogBombCooldown = 0;
  state.backlogRedBombCooldown = 99;

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogBombs.length, 1);
  assertEquals(state.backlogBombs[0].kind, "returnable");
  assertNotEquals(state.backlogTiles[8].x, originalTileX);

  state.backlogRedBombCooldown = 0;
  stepGame(state, idleInput, 1 / 60, () => 0);
  assertEquals(state.backlogBombs.filter((bomb) => bomb.kind === "returnable").length, 1);
  assertEquals(state.backlogBombs.filter((bomb) => bomb.kind === "red").length, 1);

  state.backlogBombs = state.backlogBombs.filter((bomb) => bomb.kind === "returnable");
  state.backlogRedBombCooldown = 0;
  stepGame(state, idleInput, 1 / 60, () => 0.99);
  assertEquals(state.backlogBombs.filter((bomb) => bomb.kind === "returnable").length, 1);
  assertEquals(state.backlogBombs.filter((bomb) => bomb.kind === "red").length, 3);
});

Deno.test("a missed gold bomb exits through the bottom instead of bouncing", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const boss = state.enemies[0];
  state.backlogBombs = [{
    x: 20,
    y: state.height + 12,
    previousX: 20,
    previousY: state.height + 8,
    vx: 0,
    vy: 300,
    radius: 11,
    kind: "returnable",
    returned: false,
    lobFor: 0,
    lobDuration: 0.78,
    life: 5,
    maxLife: 6,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogBombs.length, 0);
  assertEquals(state.bossDialogue?.text, "Back to the bottom of the queue.");
  assertEquals(boss.health, 4);
});

Deno.test("shooting a gold bomb returns it along the shot trajectory", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogBombs = [{
    x: 250,
    y: 220,
    previousX: 250,
    previousY: 220,
    vx: 0,
    vy: 120,
    radius: 11,
    kind: "returnable",
    returned: false,
    lobFor: 0,
    lobDuration: 0.78,
    life: 5,
    maxLife: 6,
  }];
  state.projectiles = [projectile({
    x: 250,
    y: 232,
    previousX: 250,
    previousY: 232,
    vy: -1000,
  })];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assert(state.backlogBombs[0]?.returned);
  assertAlmostEquals(state.backlogBombs[0].vx, 0);
  assertAlmostEquals(state.backlogBombs[0].vy, -390);
  assertEquals(state.banner, "RETURN TO SENDER");
  assertEquals(state.projectiles.length, 0);
});

Deno.test("a vertical shot catches a gold bomb crossing sideways between frames", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogBombs = [{
    x: 230,
    y: 220,
    previousX: 230,
    previousY: 220,
    vx: 800,
    vy: 0,
    radius: 11,
    kind: "returnable",
    returned: false,
    lobFor: 0,
    lobDuration: 0.78,
    life: 5,
    maxLife: 15,
  }];
  state.projectiles = [projectile({
    x: 250,
    y: 240,
    previousX: 250,
    previousY: 240,
    vx: 0,
    vy: -800,
  })];

  stepGame(state, idleInput, 1 / 20, () => 0.5);

  assert(state.backlogBombs[0]?.returned);
  assertAlmostEquals(state.backlogBombs[0].vx, 0);
  assertAlmostEquals(state.backlogBombs[0].vy, -390);
  assertEquals(state.projectiles.length, 0);
});

Deno.test("crossing bullet and lateral bomb trails register despite different frame timing", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogBombs = [{
    x: 200,
    y: 220,
    previousX: 200,
    previousY: 220,
    vx: 2000,
    vy: 0,
    radius: 11,
    kind: "returnable",
    returned: false,
    lobFor: 0,
    lobDuration: 0.78,
    life: 5,
    maxLife: 15,
  }];
  state.projectiles = [projectile({
    x: 250,
    y: 300,
    previousX: 250,
    previousY: 300,
    vx: 0,
    vy: -2000,
  })];

  stepGame(state, idleInput, 1 / 20, () => 0.5);

  assert(state.backlogBombs[0]?.returned);
  assertAlmostEquals(state.backlogBombs[0].vx, 0);
  assertAlmostEquals(state.backlogBombs[0].vy, -390);
  assertEquals(state.projectiles.length, 0);
});

Deno.test("a returned bomb knocks out one cell and ricochets back into play", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const target = state.backlogTiles.find((tile) =>
    tile.maxHealth === 1 && !tile.special && !tile.drop
  );
  assert(target);
  const originalCount = state.backlogTiles.length;
  state.backlogBombs = [{
    x: target.x,
    y: target.y + target.height / 2 + 10,
    previousX: target.x,
    previousY: target.y + target.height / 2 + 10,
    vx: 0,
    vy: -390,
    radius: 11,
    kind: "returnable",
    returned: true,
    lobFor: 0,
    lobDuration: 0.78,
    life: 4,
    maxLife: 6,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogBombs.length, 1);
  assertEquals(state.backlogTiles.length, originalCount - 1);
  assertEquals(state.backlogBombs[0].returned, false);
  assertGreater(state.backlogBombs[0].vy, 0);
});

Deno.test("a ceiling-returned gold bomb cracks a reinforced red cell from above", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const target = state.backlogTiles.find((tile) => tile.row === 0 && tile.column === 4);
  assert(target);
  const originalCount = state.backlogTiles.length;
  const startY = target.y - target.height / 2 - 13;
  state.backlogBombs = [{
    x: target.x,
    y: startY,
    previousX: target.x,
    previousY: startY,
    vx: 0,
    vy: 390,
    radius: 11,
    kind: "returnable",
    returned: false,
    lobFor: 0,
    lobDuration: 0.78,
    life: 5,
    maxLife: 8,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogTiles.length, originalCount);
  assertEquals(target.health, target.maxHealth - 1);
  assertEquals(target.maxHealth, 3);
  assert(state.backlogBombs[0].vy < 0);
});

Deno.test("Deep Scan redirects a gold bomb like ordinary fire", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogBombs = [{
    x: state.player.x,
    y: state.player.y - 30,
    previousX: state.player.x,
    previousY: state.player.y - 30,
    vx: 80,
    vy: 0,
    radius: 11,
    kind: "returnable",
    returned: false,
    lobFor: 0,
    lobDuration: 0.78,
    life: 5,
    maxLife: 8,
  }];

  stepGame(
    state,
    {
      ...idleInput,
      aim: { x: state.player.x, y: state.player.y - 100 },
      secondary: true,
    },
    1 / 60,
    () => 0.5,
  );

  assert(state.backlogBombs[0].returned);
  assertAlmostEquals(state.backlogBombs[0].vx, 0, 0.001);
  assertAlmostEquals(state.backlogBombs[0].vy, -390, 0.001);
});

Deno.test("Deep Scan catches a gold bomb whose lateral trail crossed the beam", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogBombs = [{
    x: state.player.x + 35,
    y: state.player.y - 50,
    previousX: state.player.x - 35,
    previousY: state.player.y - 50,
    vx: 800,
    vy: 0,
    radius: 11,
    kind: "returnable",
    returned: false,
    lobFor: 0,
    lobDuration: 0.78,
    life: 5,
    maxLife: 15,
  }];

  stepGame(
    state,
    {
      ...idleInput,
      aim: { x: state.player.x, y: state.player.y - 100 },
      secondary: true,
    },
    1 / 60,
    () => 0.5,
  );

  assert(state.backlogBombs[0]?.returned);
  assertAlmostEquals(state.backlogBombs[0].vx, 0, 0.001);
  assertAlmostEquals(state.backlogBombs[0].vy, -390, 0.001);
});

Deno.test("an aging gold bomb flashes toward a damaging fuse explosion", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.player.invulnerableFor = 0;
  const health = state.player.health;
  state.backlogBombs = [{
    x: state.player.x + 50,
    y: state.player.y,
    previousX: state.player.x + 50,
    previousY: state.player.y,
    vx: 0,
    vy: 0,
    radius: 11,
    kind: "returnable",
    returned: false,
    lobFor: 0,
    lobDuration: 0.78,
    life: 0.001,
    maxLife: 8,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogBombs.length, 0);
  assertEquals(state.player.health, health - 1);
});

Deno.test("an expired gold bomb clears every backlog cell in its blast radius", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const target = state.backlogTiles.find((tile) => tile.row === 3 && tile.column === 4);
  assert(target);
  for (const tile of state.backlogTiles) tile.health = 1;
  const originalCount = state.backlogTiles.length;
  state.backlogBombs = [{
    x: target.x,
    y: target.y + target.height / 2 + 24,
    previousX: target.x,
    previousY: target.y + target.height / 2 + 24,
    vx: 0,
    vy: 0,
    radius: 11,
    kind: "returnable",
    returned: false,
    lobFor: 0,
    lobDuration: 0.78,
    life: 0.001,
    maxLife: 15,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assert(state.backlogTiles.length < originalCount - 1);
  assertEquals(state.banner, "BACKLOG BLAST");
});

Deno.test("a returned bomb through the wall lands one large boss hit", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const boss = state.enemies[0];
  state.backlogTiles = [];
  state.backlogBombs = [{
    x: boss.x,
    y: boss.y + boss.radius + 3,
    previousX: boss.x,
    previousY: boss.y + boss.radius + 3,
    vx: 0,
    vy: -390,
    radius: 11,
    kind: "returnable",
    returned: true,
    lobFor: 0,
    lobDuration: 0.78,
    life: 4,
    maxLife: 6,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogHits, 1);
  assertEquals(boss.health, 3);
  assertEquals(state.backlogIntermissionStage, 4);
  assertEquals(state.bossDialogue?.text, "That was still in theaters!");
  assertEquals(state.backlogTiles.length, 0);

  state.backlogIntermissionFor = 0.001;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.backlogIntermissionStage, 1);
  assertGreater(state.backlogFirewallWarningFor, 0);
  assertEquals(state.bossDialogue?.text, "Let's see how you like being wiped.");
});

Deno.test("the Behemoth grants a forgiving near-edge bomb hit", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const boss = state.enemies[0];
  state.backlogTiles = [];
  const x = boss.x + boss.radius + 20;
  state.backlogBombs = [{
    x,
    y: boss.y,
    previousX: x,
    previousY: boss.y,
    vx: 0,
    vy: 0,
    radius: 11,
    kind: "returnable",
    returned: true,
    lobFor: 0,
    lobDuration: 0.78,
    life: 4,
    maxLife: 8,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogHits, 1);
});

Deno.test("the second-hit joke and twelve-season warning linger long enough to read", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const boss = state.enemies[0];
  state.backlogHits = 1;
  boss.health = 3;
  state.backlogTiles = [];
  state.backlogBombs = [{
    x: boss.x,
    y: boss.y + boss.radius + 3,
    previousX: boss.x,
    previousY: boss.y + boss.radius + 3,
    vx: 0,
    vy: -390,
    radius: 11,
    kind: "returnable",
    returned: true,
    lobFor: 0,
    lobDuration: 0.78,
    life: 4,
    maxLife: 15,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.bossDialogue?.text, "That was the episode where it gets good!");
  assertGreater(state.backlogIntermissionFor, 2.9);

  state.backlogIntermissionFor = 0.001;
  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.bossDialogue?.text, "Good news! It was renewed for twelve seasons.");
  assertGreater(state.backlogFirewallWarningFor, 2.9);
});

Deno.test("a fast returned bomb crossing the Behemoth laterally lands its hit", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const boss = state.enemies[0];
  boss.x = 250;
  boss.y = 62;
  state.backlogTiles = [];
  state.backlogBombs = [{
    x: 170,
    y: boss.y,
    previousX: 170,
    previousY: boss.y,
    vx: 1800,
    vy: 0,
    radius: 11,
    kind: "returnable",
    returned: true,
    lobFor: 0,
    lobDuration: 0.78,
    life: 4,
    maxLife: 15,
  }];

  stepGame(state, idleInput, 1 / 20, () => 0.5);

  assertEquals(state.backlogHits, 1);
  assertEquals(boss.health, 3);
});

Deno.test("a red bomb cannot be returned and damages players who ignore its fuse", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.player.invulnerableFor = 0;
  const health = state.player.health;
  state.backlogBombs = [{
    x: state.player.x,
    y: state.player.y,
    previousX: state.player.x,
    previousY: state.player.y,
    vx: 0,
    vy: 0,
    radius: 13,
    kind: "red",
    returned: false,
    lobFor: 0,
    lobDuration: 0.78,
    life: 0.001,
    maxLife: 2.8,
  }];
  state.projectiles = [projectile({
    x: state.player.x,
    y: state.player.y,
    previousX: state.player.x,
    previousY: state.player.y,
  })];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogBombs.length, 0);
  assertEquals(state.player.health, health - 1);
});

Deno.test("lobbed red bombs settle as untargeted hazards instead of chasing the player", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogBombs = [{
    x: 100,
    y: 230,
    previousX: 100,
    previousY: 230,
    vx: 300,
    vy: 120,
    radius: 13,
    kind: "red",
    returned: false,
    lobFor: 0.001,
    lobDuration: 0.78,
    life: 2,
    maxLife: 3.2,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogBombs[0].lobFor, 0);
  assertEquals(state.backlogBombs[0].vx, 0);
  assertEquals(state.backlogBombs[0].vy, 0);
});

Deno.test("the second Backlog wipe intervals ten reachable gaps with autoplay jokes", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogHits = 2;
  state.backlogRebuildAfterWall = true;
  state.backlogIntermissionStage = 1;
  state.backlogIntermissionFor = 0.001;
  state.backlogFirewallWarningFor = 0.001;
  state.backlogFirewallDirection = 0;
  state.backlogFirewallGaps = [100, 400, 110, 390, 90, 410, 120, 380, 80, 420];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  const firewall = state.projectiles.filter(
    (candidate) => candidate.pattern === "backlog-firewall",
  );
  assertGreater(firewall.length, 20);
  assert(firewall.every((shot) => shot.vx === 0));
  assert(firewall.every((shot) => Math.abs(shot.x - state.backlogFirewallGaps[0]) >= 40));
  assertEquals(state.backlogMazeWallIndex, 1);
  assertEquals(state.bossDialogue, null);
  assertEquals(state.banner, "UP NEXT: MORE BACKLOG");
  assertGreater(state.backlogIntermissionFor, 20);
  for (let wall = 1; wall < state.backlogFirewallGaps.length; wall++) {
    state.projectiles = [];
    state.backlogMazeNextWallFor = 0.001;
    stepGame(state, idleInput, 1 / 60, () => 0.5);
    assertGreater(state.projectiles.length, 20);
    const wallVelocity = state.projectiles[0].vx;
    assert(state.projectiles.every((shot) => shot.vx === wallVelocity));
    if (wall < 6) assertEquals(wallVelocity, 0);
    else {
      assertNotEquals(wallVelocity, 0);
      assertEquals(Math.sign(wallVelocity), wall % 2 === 0 ? -1 : 1);
      assertEquals(Math.abs(wallVelocity), 42 + (wall - 6) * 10);
    }
    const movedGap = state.backlogFirewallGaps[wall] + wallVelocity / 60;
    const safeDistance = wall < 6 ? 40 : 49;
    assert(
      state.projectiles.every((shot) => Math.abs(shot.x - movedGap) >= safeDistance),
    );
  }
  assertEquals(state.backlogMazeWallIndex, 10);
  assertEquals(state.banner, "SEASON FINALE (PART 1 OF 6)");
  assertEquals(state.backlogIntermissionStage, 2);
  assertEquals(state.backlogTiles.length, 0);

  state.backlogIntermissionFor = 0.001;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.backlogIntermissionStage, 0);
  assertEquals(state.backlogTiles.length, 32);
});

Deno.test("the third Backlog wipe becomes a paced directional deep-clean cycle", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogHits = 3;
  state.backlogRebuildAfterWall = true;
  state.backlogIntermissionStage = 1;
  state.backlogIntermissionFor = 0.001;

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  const firewall = state.projectiles.filter(
    (candidate) => candidate.pattern === "backlog-firewall",
  );
  assertGreater(firewall.length, 20);
  assert(firewall.every((shot) => shot.vx < 0 && shot.vy === 0));
  assertEquals(state.backlogScanStep, 1);
  assertEquals(state.banner, "DEEP CLEAN: 17%");
  assertEquals(state.backlogFirewallDirection, 3);

  state.backlogScanNextFor = 0.001;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  const rebound = state.projectiles.filter(
    (candidate) => candidate.pattern === "backlog-firewall" && candidate.vx > 0,
  );
  assertGreater(rebound.length, 20);
  assertEquals(state.backlogScanStep, 2);
  assertEquals(state.banner, "DEEP CLEAN: 34%");
  assertEquals(state.backlogFirewallDirection, 0);
});

Deno.test("ordinary fire can carve a passage through Backlog firewall segments", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogHits = 3;
  state.backlogRebuildAfterWall = true;
  state.backlogIntermissionStage = 1;
  state.backlogIntermissionFor = 0.001;

  stepGame(state, idleInput, 1 / 60, () => 0.5);
  const segment = state.projectiles.find(
    (candidate) => candidate.pattern === "backlog-firewall",
  );
  assert(segment);
  const wallCount = state.projectiles.filter(
    (candidate) => candidate.pattern === "backlog-firewall" && candidate.life > 0,
  ).length;
  state.projectiles.push(projectile({
    id: state.nextProjectileId++,
    x: segment.x,
    y: segment.y,
    previousX: segment.previousX,
    previousY: segment.previousY,
  }));

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(
    state.projectiles.filter(
      (candidate) => candidate.pattern === "backlog-firewall" && candidate.life > 0,
    ).length,
    wallCount - 1,
  );
  assertEquals(state.projectiles.some((candidate) => candidate.friendly), false);
});

Deno.test("Deep Scan carves a corridor through Backlog firewall segments", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogHits = 3;
  state.backlogIntermissionStage = 2;
  state.backlogIntermissionFor = 10;
  state.backlogScanStep = 6;
  const segmentId = state.nextProjectileId++;
  state.projectiles = [projectile({
    id: segmentId,
    x: state.player.x,
    y: state.player.y - 60,
    previousX: state.player.x,
    previousY: state.player.y - 60,
    friendly: false,
    pattern: "backlog-firewall",
    radius: 8,
  })];

  stepGame(
    state,
    {
      ...idleInput,
      aim: { x: state.player.x, y: state.player.y - 100 },
      secondary: true,
    },
    1 / 60,
    () => 0.5,
  );

  assertEquals(state.projectiles.some((candidate) => candidate.id === segmentId), false);
});

Deno.test("Backlog walls mix durability and authored breakout rewards", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const redTiles = state.backlogTiles.filter((tile) => tile.column === state.backlogTargetColumn);
  assert(redTiles.length > 0);
  assert(redTiles.every((tile) => tile.maxHealth === 3));
  assert(state.backlogTiles.some((tile) => tile.maxHealth === 1));
  assert(state.backlogTiles.some((tile) => tile.maxHealth === 2));
  const drops = new Set<string>(
    state.backlogTiles.map((tile) => tile.drop).filter(Boolean).map(String),
  );
  assertEquals(
    drops,
    new Set<string>(["enemy", "powerup", "repair", "bomb"]),
  );

  const multiball = state.backlogTiles.find((tile) => tile.drop === "bomb");
  assert(multiball);
  multiball.health = 1;
  state.backlogBombs = [{
    x: multiball.x,
    y: multiball.y + multiball.height / 2 + 10,
    previousX: multiball.x,
    previousY: multiball.y + multiball.height / 2 + 10,
    vx: 0,
    vy: -390,
    radius: 11,
    kind: "returnable",
    returned: true,
    lobFor: 0,
    lobDuration: 0.78,
    life: 5,
    maxLife: 15,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogBombs.length, 2);
  assertEquals(state.banner, "MULTIBALL-ISH");
  const bonusBall = state.backlogBombs.find((bomb) => bomb.bonusDrop);
  assert(bonusBall);
  bonusBall.x = state.player.x;
  bonusBall.y = state.player.y - 4;
  bonusBall.previousX = bonusBall.x;
  bonusBall.previousY = bonusBall.y;

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(bonusBall.bonusDrop, false);
  assert(bonusBall.returned);
  assert(bonusBall.vy < 0);
  assertEquals(state.banner, "MULTIBALL CAUGHT");
});

Deno.test("brick powerups fall toward the player and expire below the arena", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const tile = state.backlogTiles.find((candidate) => candidate.drop === "powerup");
  assert(tile);
  tile.health = 1;
  state.backlogBombs = [{
    x: tile.x,
    y: tile.y + tile.height / 2 + 10,
    previousX: tile.x,
    previousY: tile.y + tile.height / 2 + 10,
    vx: 0,
    vy: -390,
    radius: 11,
    kind: "returnable",
    returned: true,
    lobFor: 0,
    lobDuration: 0.78,
    life: 5,
    maxLife: 15,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  const drop = state.powerupDrops[0];
  assert(drop);
  assertEquals(drop.fallSpeed, 145);
  const originalY = drop.y;
  state.player.x = drop.x < state.width / 2 ? state.width - 20 : 20;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assert(drop.y > originalY);

  drop.y = state.height + drop.radius + 1;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.powerupDrops.some((candidate) => candidate.id === drop.id), false);
});

Deno.test("the fourth returned bomb pauses for the Maybe Later punchline", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const boss = state.enemies[0];
  state.backlogHits = 3;
  boss.health = 1;
  state.backlogTiles = [];
  state.backlogBombs = [{
    x: boss.x,
    y: boss.y + boss.radius + 3,
    previousX: boss.x,
    previousY: boss.y + boss.radius + 3,
    vx: 0,
    vy: -1000,
    radius: 11,
    kind: "returnable",
    returned: true,
    lobFor: 0,
    lobDuration: 0.78,
    life: 4,
    maxLife: 6,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogHits, 4);
  assertEquals(boss.health, 1);
  assertEquals(state.backlogIntermissionStage, 3);
  assert(state.bossDialogue?.text.includes("Maybe Later"));

  state.backlogIntermissionFor = 0.001;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.phase, "actComplete");
});

Deno.test("the duplicate boss summons its 2x adds at a gentler cadence", () => {
  const state = activeState();
  state.actIndex = 1;
  state.phase = "boss";
  state.enemies = [enemy({
    kind: "boss",
    bossKind: "hydra",
    health: 100,
    maxHealth: 100,
    radius: 34,
    behaviorCooldown: 0,
    phase: 1,
  })];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertGreater(state.enemies[0].behaviorCooldown, 1.4);
  assertEquals(state.enemies.filter((candidate) => candidate.kind === "duplicate").length, 1);
});

Deno.test("the duplicate boss caps its late-phase 2x summon burst", () => {
  const state = activeState();
  state.actIndex = 1;
  state.phase = "boss";
  state.enemies = [enemy({
    kind: "boss",
    bossKind: "hydra",
    health: 30,
    maxHealth: 100,
    radius: 34,
    behaviorCooldown: 0,
    phase: 3,
  })];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertGreater(state.enemies[0].behaviorCooldown, 1);
  assertEquals(state.enemies.filter((candidate) => candidate.kind === "duplicate").length, 2);
});

Deno.test("hard mode applies stronger spawn tuning", () => {
  const normal = activeState(9, "normal");
  const hard = activeState(9, "hard");
  normal.enemies = [];
  hard.enemies = [];
  normal.spawnCooldown = 0;
  hard.spawnCooldown = 0;

  stepGame(normal, idleInput, 1 / 60, () => 0.1);
  stepGame(hard, idleInput, 1 / 60, () => 0.1);

  assertEquals(normal.enemies.length, 1);
  assertEquals(hard.enemies.length, 1);
  assertGreater(hard.enemies[0].speed, normal.enemies[0].speed);
  assertGreater(hard.spawnBudgetRemaining, normal.spawnBudgetRemaining);
});

Deno.test("act checkpoints rebuild a clean deterministic arena", () => {
  const state = activeState(42);
  state.actIndex = 1;
  state.score = 3210;
  state.upgrades["rapid-index"] = 2;
  state.player.health = 2;
  const checkpoint = checkpointFromState(state);

  const restored = createStateFromCheckpoint(500, 300, checkpoint);

  assertEquals(restored.actIndex, 1);
  assertEquals(restored.score, 3210);
  assertEquals(restored.upgrades["rapid-index"], 2);
  assertEquals(restored.player.health, 2);
  assertGreater(restored.enemies.length, 0);
  assertEquals(restored.projectiles.length, 0);
  assertEquals(restored.powerupDrops.length, 0);
  assertNotEquals(restored.rngState, 0);
});

Deno.test("a boss defeat advances to an act-complete checkpoint", () => {
  const state = activeState();
  state.phase = "boss";
  state.enemies = [
    enemy({
      kind: "boss",
      bossKind: "backlog",
      health: 0,
      maxHealth: 100,
      radius: 34,
    }),
  ];

  stepGame(state, idleInput, 1 / 60);

  assertEquals(state.phase, "actComplete");
  assertEquals(state.enemies.length, 0);
});

Deno.test("magazines empty and automatically reload", () => {
  const state = activeState();
  state.enemies = [];
  state.spawnCooldown = 100;
  state.player.ammo = 1;

  stepGame(state, { ...idleInput, firing: true }, 1 / 60, () => 0.5);

  assertEquals(state.player.ammo, 0);
  assertGreater(state.player.reloadFor, 0);
  for (let frame = 0; frame < 70; frame++) stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.player.ammo, state.player.magazineSize);
  assertEquals(state.player.reloadFor, 0);
});

Deno.test("Deep Scan pierces regular enemies but has bounded boss damage", () => {
  const state = activeState();
  state.enemies = [
    enemy({ id: 1, x: 330, health: 3, maxHealth: 3 }),
    enemy({
      id: 2,
      kind: "boss",
      bossKind: "backlog",
      x: 400,
      health: 100,
      maxHealth: 100,
      radius: 34,
    }),
  ];
  state.player.x = 250;
  state.player.y = 150;

  stepGame(state, { ...idleInput, aim: { x: 500, y: 150 }, secondary: true }, 1 / 60);

  assertEquals(state.enemies.find((candidate) => candidate.id === 1)?.health, undefined);
  assertEquals(state.enemies.find((candidate) => candidate.id === 2)?.health, 96);
  assertEquals(state.enemies.find((candidate) => candidate.id === 2)?.x, 448);
  assertGreater(state.player.secondaryCooldown, 7);
});

Deno.test("Deep Scan uses the wider hit area and forked side-beam damage", () => {
  const state = activeState();
  state.upgrades["forked-scan"] = 1;
  state.enemies = [
    enemy({ id: 1, x: 390, y: 176, health: 6, maxHealth: 6 }),
  ];
  state.player.x = 250;
  state.player.y = 150;

  stepGame(state, { ...idleInput, aim: { x: 500, y: 150 }, secondary: true }, 1 / 60);

  assertEquals(state.enemies[0].health, 3);
});

Deno.test("Deep Scan applies the bounded four-damage hit to a miniboss", () => {
  const state = activeState();
  state.phase = "miniboss";
  state.minibossIntroStage = 8;
  state.enemies = [enemy({
    kind: "boss",
    bossKind: "backfill-daemon",
    x: 400,
    health: 50,
    maxHealth: 50,
    radius: 27,
  })];
  state.player.x = 250;
  state.player.y = 150;

  stepGame(state, { ...idleInput, aim: { x: 500, y: 150 }, secondary: true }, 1 / 60);

  assertEquals(state.enemies[0].health, 46);
});

Deno.test("relay caches move after collection and expiry resets the streak without damage", () => {
  const state = activeState();
  state.objectiveProgress = state.objectiveTarget;
  stepGame(state, idleInput, 1 / 60);
  dispatchGameAction(state, {
    type: "chooseUpgrade",
    upgradeId: state.offeredUpgrades[0],
  });
  assertEquals(state.encounterIndex, 1);
  assert(state.relayCache);
  state.player.x = state.relayCache.x;
  state.player.y = state.relayCache.y;

  stepGame(state, idleInput, 1 / 60);

  assertEquals(state.objectiveProgress, 1);
  assert(state.relayCache);
  state.player.invulnerableFor = 0;
  state.relayStreak = 3;
  state.relayCache.timeRemaining = 0.001;
  const health = state.player.health;
  stepGame(state, idleInput, 1 / 60);
  assertEquals(state.player.health, health);
  assertEquals(state.objectiveProgress, 1);
  assertEquals(state.relayStreak, 0);
  assertEquals(state.relayMisses, 1);
  assert(state.relayCache);
});

Deno.test("shooting one physical patch installs only that upgrade", () => {
  const state = activeState();
  state.player.x = 70;
  state.player.y = 245;
  state.objectiveProgress = state.objectiveTarget;
  stepGame(state, idleInput, 1 / 60);
  assertEquals(state.upgradeTargets.length, 0);

  const heldFire = { ...idleInput, firing: true };
  for (let index = 0; index < 75; index++) {
    stepGame(state, heldFire, 1 / 60);
  }
  assertEquals(state.upgradeTargets.length, 3);
  assertAlmostEquals(
    state.upgradeTargets.reduce((sum, target) => sum + target.x, 0) / 3,
    state.width / 2,
    0.001,
  );
  assertAlmostEquals(
    state.upgradeTargets.reduce((sum, target) => sum + target.y, 0) / 3,
    state.height / 2,
    0.001,
  );
  assertEquals(Object.keys(state.upgrades).length, 0);

  stepGame(state, idleInput, 1 / 60);
  const target = state.upgradeTargets[0];
  target.entranceFor = 0;
  state.projectiles = [
    projectile({
      x: target.x - 24,
      y: target.y,
      previousX: target.x - 40,
      previousY: target.y,
      vx: 1800,
    }),
  ];

  stepGame(state, idleInput, 1 / 60);

  assertEquals(state.upgrades[target.id], 1);
  assertEquals(state.upgradeTargets.length, 0);
  assertGreater(state.rewardTransitionFor, 0);
});

Deno.test("destroyed red documents telegraph a small damaging burst", () => {
  const state = activeState();
  state.enemies = [enemy({ x: 160, y: 150 })];
  state.spawnCooldown = 100;
  state.player.x = 160;
  state.player.y = 150;
  state.player.invulnerableFor = 0;
  state.projectiles = [projectile()];
  const health = state.player.health;

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  const burst = state.hazards.find((hazard) => hazard.kind === "document-burst");
  assert(burst);
  assertGreater(burst.armFor, 0);
  assertEquals(state.player.health, health);

  for (let index = 0; index < 30; index++) {
    stepGame(state, idleInput, 1 / 60, () => 0.5);
  }
  assertEquals(state.player.health, health - 1);
});

Deno.test("2x enemies primarily split into red explosives", () => {
  const state = activeState();
  state.enemies = [enemy({ kind: "duplicate" })];
  state.projectiles = [projectile()];
  state.spawnCooldown = 100;
  state.dropCooldown = 100;

  stepGame(state, idleInput, 1 / 60, () => 0.2);

  const children = state.enemies.filter((candidate) => candidate.splitGeneration === 1);
  assertEquals(children.map((candidate) => candidate.kind), ["file", "file"]);
});

Deno.test("2x enemies split into two of the same seeded enemy variant", () => {
  const state = activeState();
  state.actIndex = 1;
  state.enemies = [enemy({ kind: "duplicate" })];
  state.projectiles = [projectile()];
  state.spawnCooldown = 100;
  state.dropCooldown = 100;

  stepGame(
    state,
    idleInput,
    1 / 60,
    sequenceRandom([0.7, 0.99, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
  );

  const children = state.enemies.filter((candidate) => candidate.splitGeneration === 1);
  assertEquals(children.map((candidate) => candidate.kind), ["buffering", "buffering"]);
});

Deno.test("2x enemies can drop a powerup or a repair pack", () => {
  const powered = activeState();
  powered.enemies = [enemy({ kind: "duplicate" })];
  powered.projectiles = [projectile()];
  powered.spawnCooldown = 100;
  powered.dropCooldown = 100;
  stepGame(powered, idleInput, 1 / 60, sequenceRandom([0.86, 0, 0.5]));
  assertEquals(powered.powerupDrops.length, 1);
  assertEquals(powered.powerupDrops[0].kind, "machine-gun");
  assertEquals(powered.enemies.filter((candidate) => candidate.splitGeneration === 1).length, 0);

  const wounded = activeState();
  wounded.player.health -= 1;
  wounded.enemies = [enemy({ kind: "duplicate" })];
  wounded.projectiles = [projectile()];
  wounded.spawnCooldown = 100;
  wounded.dropCooldown = 100;
  stepGame(wounded, idleInput, 1 / 60, () => 0.95);
  assertEquals(wounded.powerupDrops.length, 1);
  assertEquals(wounded.powerupDrops[0].kind, "repair");
  assertEquals(wounded.enemies.filter((candidate) => candidate.splitGeneration === 1).length, 0);
});

Deno.test("reflected projectiles bounce from arena walls", () => {
  const state = activeState();
  state.enemies = [];
  state.spawnCooldown = 100;
  state.projectiles = [
    projectile({
      x: 495,
      previousX: 490,
      vx: 600,
      bouncesRemaining: 1,
      reflected: true,
    }),
  ];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assert(state.projectiles[0].vx < 0);
  assertEquals(state.projectiles[0].bouncesRemaining, 0);
});

Deno.test("Reflect grants fired rounds extended life and eight wall bounces", () => {
  const state = activeState();
  state.enemies = [];
  state.spawnCooldown = 100;
  state.activePowerups.reflect = 1;

  stepGame(state, { ...idleInput, firing: true }, 1 / 60, () => 0.5);

  assertEquals(state.projectiles[0].reflected, true);
  assertEquals(state.projectiles[0].bouncesRemaining, 8);
  assertAlmostEquals(state.projectiles[0].life, 1.18 * 3.5 - 1 / 60, 0.001);

  for (let frame = 0; frame < 90; frame++) stepGame(state, idleInput, 1 / 20, () => 0.5);
  assertEquals(state.projectiles.length, 0);
});

Deno.test("elite drops use the seeded pure RNG roll", () => {
  const state = activeState();
  state.spawnCooldown = 100;
  state.enemies = [enemy({ x: 180, elite: true })];
  state.projectiles = [projectile({ x: 170, previousX: 160, vx: 1200 })];

  stepGame(state, idleInput, 1 / 60, () => 0);

  assertEquals(state.powerupDrops.length, 1);
  assertEquals(state.powerupDrops[0].kind, "machine-gun");
});

Deno.test("machine gun pickup reloads its magazine and preserves the selected weapon ammo", () => {
  const state = activeState();
  state.enemies = [];
  state.spawnCooldown = 100;
  state.powerupDrops = [{
    id: 1,
    kind: "machine-gun",
    x: state.player.x,
    y: state.player.y,
    radius: 13,
    life: 10,
  }];
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  const baseAmmo = state.player.ammo;
  stepGame(state, { ...idleInput, firing: true }, 1 / 60, () => 0.5);

  assertEquals(state.temporaryWeapon, { kind: "machine-gun", ammo: 47 });
  assertEquals(state.player.ammo, baseAmmo);
  assertEquals(state.projectiles[0].damage, 1);

  if (!state.temporaryWeapon) throw new Error("machine gun pickup was not retained");
  state.temporaryWeapon.ammo = 1;
  state.player.fireCooldown = 0;
  stepGame(state, { ...idleInput, firing: true }, 1 / 60, () => 0.5);
  assertEquals(state.temporaryWeapon, { kind: "machine-gun", ammo: 0 });
  assertGreater(state.player.reloadFor, 1);

  state.player.invulnerableFor = 100;
  for (let frame = 0; frame < 30; frame++) stepGame(state, idleInput, 1 / 20, () => 0.5);
  assertEquals(state.temporaryWeapon, { kind: "machine-gun", ammo: 48 });
  assertEquals(state.player.reloadFor, 0);
  assertEquals(state.player.ammo, baseAmmo);
});

Deno.test("buffed super shots reload after eight heavy rounds instead of expiring", () => {
  const state = activeState();
  state.enemies = [];
  state.spawnCooldown = 100;
  state.powerupDrops = [{
    id: 1,
    kind: "super-shot",
    x: state.player.x,
    y: state.player.y,
    radius: 13,
    life: 10,
  }];
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  const baseAmmo = state.player.ammo;
  for (let shot = 0; shot < 8; shot++) {
    state.player.fireCooldown = 0;
    stepGame(state, { ...idleInput, firing: true }, 1 / 60, () => 0.5);
  }

  assertEquals(state.temporaryWeapon, { kind: "super-shot", ammo: 0 });
  assertEquals(state.player.ammo, baseAmmo);
  assertEquals(state.projectiles[0].damage, 8);
  assertEquals(state.projectiles[0].pierce, 6);
  assertEquals(state.projectiles[0].radius, 9);
  assertGreater(state.player.reloadFor, 1.6);

  state.player.invulnerableFor = 100;
  for (let frame = 0; frame < 36; frame++) stepGame(state, idleInput, 1 / 20, () => 0.5);
  assertEquals(state.temporaryWeapon, { kind: "super-shot", ammo: 8 });
  assertEquals(state.player.reloadFor, 0);
  assertEquals(state.player.ammo, baseAmmo);
});

Deno.test("Pause All Streams freezes threats and opens a bonus-damage shatter window", () => {
  const state = activeState();
  state.spawnCooldown = 100;
  state.enemies = [enemy({ x: 120, health: 10, maxHealth: 10, behaviorCooldown: 2 })];
  state.projectiles = [projectile({
    id: 1,
    x: 90,
    previousX: 90,
    vx: 120,
    friendly: false,
  })];
  state.powerupDrops = [{
    id: 1,
    kind: "freeze",
    x: state.player.x,
    y: state.player.y,
    radius: 13,
    life: 10,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertGreater(state.activePowerups.freezeFor, 3.9);
  const frozenEnemyX = state.enemies[0].x;
  const frozenProjectileX = state.projectiles[0].x;
  const frozenCooldown = state.enemies[0].behaviorCooldown;
  state.projectiles.push(projectile({
    id: 2,
    x: frozenEnemyX,
    previousX: frozenEnemyX - 5,
    damage: 2,
  }));

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.enemies[0].x, frozenEnemyX);
  assertEquals(state.enemies[0].behaviorCooldown, frozenCooldown);
  assertEquals(state.projectiles[0].x, frozenProjectileX);
  assertAlmostEquals(state.enemies[0].health, 6.5, 0.001);
});

Deno.test("Database Vacuum pulls enemies, consumes hostile shots, and collapses", () => {
  const state = activeState();
  state.spawnCooldown = 100;
  state.enemies = [enemy({ x: 100, health: 10, maxHealth: 10 })];
  state.powerupDrops = [{
    id: 1,
    kind: "singularity",
    x: state.player.x,
    y: state.player.y,
    radius: 13,
    life: 10,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assert(state.singularity);
  const enemyX = state.enemies[0].x;
  state.projectiles = [projectile({
    x: state.singularity.x,
    y: state.singularity.y,
    previousX: state.singularity.x,
    previousY: state.singularity.y,
    friendly: false,
  })];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertGreater(state.enemies[0].x, enemyX);
  assertEquals(state.projectiles.length, 0);
  assert(state.singularity);
  state.enemies[0].x = state.singularity.x - 50;
  state.enemies[0].y = state.singularity.y;
  state.singularity.life = 0.001;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.singularity, null);
  assert(state.enemies[0].health < 3);
});

Deno.test("Act 1 Job 2 ends with the talking Backfill Daemon", () => {
  const state = activeState();
  state.encounterIndex = 1;
  state.objectiveProgress = state.objectiveTarget;

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.phase, "miniboss");
  assertEquals(state.enemies.length, 1);
  assertEquals(state.enemies[0].bossKind, "backfill-daemon");
  assertEquals(state.enemies[0].maxHealth, 175);
  assert(state.bossDialogue?.text.includes("47 identical remuxes"));
});

Deno.test("Backfill Daemon stages NEVER, the opening wall, and its music-start beat", () => {
  const state = activeState();
  state.encounterIndex = 1;
  state.objectiveProgress = state.objectiveTarget;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  const miniboss = state.enemies[0];

  assertEquals(state.minibossIntroStage, 1);
  assert(miniboss.y >= miniboss.radius);
  assertEquals(state.bossDialogue?.revealRate, 17);

  const healthBeforeInput = miniboss.health;
  const activeInput: ArcadeInput = {
    ...idleInput,
    movement: { x: 1, y: 0 },
    aim: { x: miniboss.x, y: miniboss.y },
    firing: true,
  };
  for (let frame = 0; frame < 60; frame++) {
    stepGame(state, activeInput, 1 / 60, () => 0.5);
  }
  assertEquals(state.minibossIntroStage, 1);
  assertEquals(state.minibossFightStarts, 0);
  assertEquals(miniboss.health, healthBeforeInput);

  state.minibossIntroFor = 0;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.minibossIntroStage, 2);
  assert(state.bossDialogue?.text.endsWith("."));
  assertEquals(state.bossImpactCues, 0);

  state.minibossIntroFor = 0;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.minibossIntroStage, 3);
  assert(state.bossDialogue?.text.endsWith(".."));

  state.minibossIntroFor = 0;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.minibossIntroStage, 4);
  assert(state.bossDialogue?.text.endsWith("..."));

  state.minibossIntroFor = 0;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.minibossIntroStage, 5);
  assertEquals(state.bossDialogue?.text, "NEVER!");
  assertEquals(state.bossDialogue?.tone, "danger");
  assertEquals(state.bossImpactCues, 1);

  state.minibossIntroFor = 0;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.minibossIntroStage, 6);
  const openingWall = state.projectiles.filter((shot) => shot.pattern === "backfill-wall");
  assertGreater(openingWall.length, 25);
  assert(openingWall.every((shot) => shot.vy > 0 && shot.vx === 0));

  state.minibossIntroFor = 0;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.minibossIntroStage, 7);
  assertEquals(state.bossDialogue?.text, "Oh. Not enough files. That's fixable.");

  state.minibossIntroFor = 0;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.minibossIntroStage, 8);
  assertEquals(state.minibossFightStarts, 1);
});

Deno.test("Mandatory Backfill warns from a safe edge before joining the active fight", () => {
  const state = activeState();
  state.encounterIndex = 1;
  state.objectiveProgress = state.objectiveTarget;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  const miniboss = state.enemies[0];
  state.minibossIntroStage = 8;
  state.player.invulnerableFor = 100;
  state.player.y = 20;
  miniboss.health = miniboss.maxHealth * 0.65;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  state.projectiles = [];
  state.backfillWallCooldown = 0;

  stepGame(state, idleInput, 1 / 60, () => 0.1);

  assertGreater(state.backfillWallWarningFor, 0);
  assertEquals(state.backfillWallDirection, 2);
  assertEquals(state.bossDialogue?.text, "MANDATORY BACKFILL!");
  assertEquals(state.bossDialogue?.tone, "danger");
  assertEquals(state.projectiles.length, 0);

  state.backfillWallWarningFor = 0.001;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  const wall = state.projectiles.filter((shot) => shot.pattern === "backfill-wall");
  assertGreater(wall.length, 25);
  assert(wall.every((shot) => shot.vy < 0 && shot.vx === 0));
});

Deno.test("Backfill Daemon quotes its phases once while combat continues", () => {
  const state = activeState();
  state.encounterIndex = 1;
  state.objectiveProgress = state.objectiveTarget;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  const miniboss = state.enemies[0];
  state.minibossIntroStage = 8;
  state.player.invulnerableFor = 100;
  miniboss.behaviorCooldown = 100;

  miniboss.health = miniboss.maxHealth * 0.65;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.bossDialogue?.text, "Free space is just storage I haven't filled yet.");

  miniboss.health = miniboss.maxHealth * 0.32;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.bossDialogue?.text, "Delete nothing! You might watch it someday!");

  const remaining = state.bossDialogue?.life;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assert((state.bossDialogue?.life ?? 0) < (remaining ?? 0));
});

Deno.test("Backfill Daemon telegraphs a patterned ring with a path toward the player", () => {
  const state = activeState();
  state.encounterIndex = 1;
  state.objectiveProgress = state.objectiveTarget;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  const miniboss = state.enemies[0];
  state.minibossIntroStage = 8;
  state.player.invulnerableFor = 100;
  miniboss.health = miniboss.maxHealth * 0.65;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  state.projectiles = [];

  miniboss.bossAttackStep = 1;
  miniboss.bossAttackPending = undefined;
  miniboss.behaviorCooldown = 0;
  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.projectiles.length, 0);
  assertEquals(miniboss.bossAttackPending, 1);
  assertGreater(miniboss.warningFor, 0);

  miniboss.behaviorCooldown = 0;
  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertGreater(state.projectiles.length, 8);
  for (const shot of state.projectiles) {
    const angle = Math.atan2(shot.vy, shot.vx);
    const distanceFromPlayerAngle = Math.abs(
      Math.atan2(
        Math.sin(angle - miniboss.aimAngle),
        Math.cos(angle - miniboss.aimAngle),
      ),
    );
    assertGreater(distanceFromPlayerAngle, 0.61);
  }
});

Deno.test("Backfill Daemon announces summons and never keeps more than three adds", () => {
  const state = activeState();
  state.encounterIndex = 1;
  state.objectiveProgress = state.objectiveTarget;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  const miniboss = state.enemies[0];
  state.minibossIntroStage = 8;
  state.player.invulnerableFor = 100;
  miniboss.health = miniboss.maxHealth * 0.65;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  state.projectiles = [];

  for (let summon = 0; summon < 3; summon++) {
    miniboss.bossAttackStep = 2;
    miniboss.bossAttackPending = undefined;
    miniboss.behaviorCooldown = 0;
    stepGame(state, idleInput, 1 / 60, () => 0.5);
    assertEquals(state.bossDialogue?.text, "Good news! I found a few more copies.");
    miniboss.behaviorCooldown = 0;
    stepGame(state, idleInput, 1 / 60, () => 0.5);
  }

  assertEquals(
    state.enemies.filter((candidate) => candidate.kind !== "boss" && candidate.health > 0).length,
    3,
  );
});

Deno.test("Backfill Daemon defeat grants one heart, fully heals, and preserves Job 2 reward", () => {
  const state = activeState();
  state.encounterIndex = 1;
  state.objectiveProgress = state.objectiveTarget;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  const miniboss = state.enemies[0];
  state.minibossIntroStage = 8;
  miniboss.y = 48;
  const previousMaxHealth = state.player.maxHealth;
  state.player.health = 1;
  state.player.invulnerableFor = 100;
  miniboss.health = 1;
  miniboss.behaviorCooldown = 100;
  state.projectiles = [projectile({
    x: miniboss.x,
    y: miniboss.y,
    previousX: miniboss.x,
    previousY: miniboss.y,
  })];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.phase, "miniboss");
  assertEquals(state.player.maxHealth, previousMaxHealth + 1);
  assertEquals(state.player.health, state.player.maxHealth);
  assertEquals(state.bossDialogue?.text, "Fine... but keep the director's cut?");
  assertGreater(state.score, 0);

  for (let frame = 0; frame < 55; frame++) stepGame(state, idleInput, 1 / 20, () => 0.5);
  assertEquals(state.phase, "reward");
  assertEquals(state.offeredUpgrades.length, 3);
  dispatchGameAction(state, { type: "chooseUpgrade", upgradeId: state.offeredUpgrades[0] });
  assertEquals(state.phase, "encounter");
  assertEquals(state.encounterIndex, 2);
  assertEquals(state.player.maxHealth, previousMaxHealth + 1);
});

Deno.test("hard mode scales Backfill Daemon health", () => {
  const state = activeState(7, "hard");
  state.encounterIndex = 1;
  state.objectiveProgress = state.objectiveTarget;

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.phase, "miniboss");
  assertEquals(state.enemies[0].maxHealth, 207);
});

Deno.test("retained powerups persist until a shielded hit clears the streak", () => {
  const state = activeState();
  state.enemies = [];
  state.spawnCooldown = 100;
  state.projectiles = [
    projectile({
      x: state.player.x + 100,
      y: state.player.y,
      previousX: state.player.x + 100,
      previousY: state.player.y,
      friendly: false,
    }),
  ];
  state.powerupDrops = [{
    id: 1,
    kind: "shield",
    x: state.player.x,
    y: state.player.y,
    radius: 13,
    life: 10,
  }];
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.activePowerups.shieldHits, 1);
  assertEquals(state.activePowerups.shieldFor, 1);
  assertEquals(state.projectiles.length, 0);

  state.activePowerups.reflect = 1;
  state.activePowerups.prism = 1;
  state.temporaryWeapon = { kind: "machine-gun", ammo: 12 };
  state.player.invulnerableFor = 100;
  for (let frame = 0; frame < 240; frame++) stepGame(state, idleInput, 1 / 20, () => 0.5);
  assertEquals(state.activePowerups.reflect, 1);
  assertEquals(state.activePowerups.prism, 1);
  assertEquals(state.activePowerups.shieldHits, 1);
  assertEquals(state.temporaryWeapon, { kind: "machine-gun", ammo: 12 });

  const health = state.player.health;
  state.player.invulnerableFor = 0;
  state.projectiles = [projectile({
    x: state.player.x,
    y: state.player.y,
    previousX: state.player.x,
    previousY: state.player.y,
    friendly: false,
  })];
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.player.health, health);
  assertEquals(state.activePowerups.reflect, 0);
  assertEquals(state.activePowerups.prism, 0);
  assertEquals(state.activePowerups.shieldFor, 0);
  assertEquals(state.activePowerups.shieldHits, 0);
  assertEquals(state.temporaryWeapon, null);
});

Deno.test("drop director guarantees a pickup after twelve kills and caps each encounter", () => {
  const pity = activeState();
  pity.spawnCooldown = 100;
  for (let kill = 0; kill < 12; kill++) {
    pity.enemies = [enemy({ id: kill + 1, x: 180 })];
    pity.projectiles = [projectile({ id: kill + 1, x: 170, previousX: 160, vx: 1200 })];
    stepGame(pity, idleInput, 1 / 60, () => 0.99);
  }
  assertEquals(pity.powerupDrops.length, 1);
  assertEquals(pity.killsSincePowerupDrop, 0);

  const capped = activeState();
  capped.spawnCooldown = 100;
  for (let kill = 0; kill < 7; kill++) {
    capped.dropCooldown = 0;
    capped.enemies = [enemy({ id: kill + 1, x: 180 })];
    capped.projectiles = [projectile({ id: kill + 1, x: 170, previousX: 160, vx: 1200 })];
    stepGame(capped, idleInput, 1 / 60, () => 0);
  }
  assertEquals(capped.powerupDrops.length, 4);
  assertEquals(capped.powerupsDroppedThisPhase, 4);
  assertNotEquals(capped.powerupDrops[0].kind, capped.powerupDrops[1].kind);
});

Deno.test("repair drops are excluded at full health and heal when eligible", () => {
  const full = activeState();
  full.spawnCooldown = 100;
  full.enemies = [enemy({ x: 180, elite: true })];
  full.projectiles = [projectile({ x: 170, previousX: 160, vx: 1200 })];
  const fullRolls = [0, 0.999];
  stepGame(full, idleInput, 1 / 60, () => fullRolls.shift() ?? 0.999);
  assertNotEquals(full.powerupDrops[0].kind, "repair");

  const wounded = activeState();
  wounded.spawnCooldown = 100;
  wounded.player.health = wounded.player.maxHealth - 1;
  wounded.enemies = [enemy({ x: 180, elite: true })];
  wounded.projectiles = [projectile({ x: 170, previousX: 160, vx: 1200 })];
  const woundedRolls = [0, 0.999];
  stepGame(wounded, idleInput, 1 / 60, () => woundedRolls.shift() ?? 0.999);
  assertEquals(wounded.powerupDrops[0].kind, "repair");
  wounded.powerupDrops[0].x = wounded.player.x;
  wounded.powerupDrops[0].y = wounded.player.y;
  stepGame(wounded, idleInput, 1 / 60, () => 0.5);
  assertEquals(wounded.player.health, wounded.player.maxHealth);
});

Deno.test("pressure director rapidly rebuilds an emptied encounter", () => {
  const state = activeState();
  state.enemies = [];
  state.spawnBudgetRemaining = 0;
  state.spawnCooldown = 0;
  state.player.invulnerableFor = 100;

  for (let frame = 0; frame < 180; frame++) stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertGreater(state.enemies.length, 2);
});

// Keep this type referenced so changes to the public state shape remain visible in tests.
const _gameStateContract: GameState | null = null;
void _gameStateContract;
