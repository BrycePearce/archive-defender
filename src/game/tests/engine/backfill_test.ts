import { assert, assertEquals, assertGreater } from "@std/assert";
import { dispatchGameAction, stepGame } from "../../engine.ts";

import type { ArcadeInput } from "../../types.ts";
import { activeState, idleInput, projectile } from "./support.ts";

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
