import { assertEquals, assertGreater } from "@std/assert";
import { createGameState, dispatchGameAction, jumpToTestLevel, stepGame } from "../../engine.ts";

import { activeState, enemy, idleInput, projectile } from "./support.ts";

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
