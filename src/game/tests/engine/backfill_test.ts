import { assert, assertEquals, assertGreater } from "@std/assert";
import { dispatchGameAction, stepGame } from "../../engine.ts";

import { beginEncounter, beginMiniboss } from "../../engine/systems/progression.ts";
import { damageEnemy } from "../../engine/damage.ts";
import { activeState, idleInput, projectile } from "./support.ts";

Deno.test("Act 1 Job 2 ends with the talking Backfill Daemon", () => {
  const state = activeState();
  state.encounterIndex = 1;
  beginEncounter(state);
  state.objectiveProgress = state.objectiveTarget;
  for (let frame = 0; frame < 90; frame++) stepGame(state, idleInput, 1 / 60);

  assertEquals(state.phase, "miniboss");
  assertEquals(state.enemies.length, 1);
  assertEquals(state.enemies[0].bossKind, "backfill-daemon");
  assertEquals(state.enemies[0].maxHealth, 175);
  assert(state.bossDialogue?.text.includes("47 identical remuxes"));
});

Deno.test("Backfill dialogue waits for fresh presses and preserves powerups", () => {
  const state = activeState();
  beginMiniboss(state);
  state.activePowerups.prism = 10;
  for (let i = 0; i < 600; i++) stepGame(state, idleInput, 1 / 60);
  assertEquals(state.minibossIntroStage, 1);
  assertEquals(state.activePowerups.prism, 10);
  const press = { ...idleInput, firing: true };
  for (let i = 0; i < 360; i++) stepGame(state, press, 1 / 60);
  assertEquals(state.minibossIntroStage, 5);
  assertEquals(state.bossDialogue?.text, "NEVER!");
  assertEquals(state.player.ammo, state.player.magazineSize);
  stepGame(state, idleInput, 1 / 60);
  state.player.dashCooldown = 2;
  stepGame(state, press, 1 / 60);
  assertEquals(state.minibossIntroStage, 5);
  for (let i = 0; i < 180 && state.minibossIntroStage === 5; i++) {
    stepGame(state, idleInput, 1 / 60);
  }
  assertEquals(state.minibossIntroStage, 6);
  assertEquals(state.player.dashCooldown, 0);
  assert(state.projectiles.some((shot) => shot.pattern === "backfill-wall" && shot.vy === 220));
  state.player.health = 1;
  for (let i = 0; i < 600 && state.minibossIntroStage === 6; i++) {
    stepGame(state, idleInput, 1 / 60);
  }
  assertEquals(state.minibossIntroStage, 7);
  assertEquals(state.player.health, 1);
  assertEquals(state.minibossFightStarts, 0);
  assertGreater(state.projectiles.length, 0);
  stepGame(state, press, 1 / 60);
  assertEquals(state.minibossFightStarts, 0);
  for (let i = 0; i < 120; i++) stepGame(state, idleInput, 1 / 60);
  assertEquals(state.minibossFightStarts, 0);
  for (let i = 0; i < 120; i++) stepGame(state, idleInput, 1 / 60);
  assertEquals(state.minibossFightStarts, 1);
  assertEquals(state.minibossIntroStage, 8);
});

Deno.test("opening wall resolves after a dodge crosses it", () => {
  const state = activeState();
  beginMiniboss(state);
  state.minibossIntroStage = 5;
  state.backfillDialogueAdvanceHeld = false;
  state.bossDialogue = null;
  stepGame(state, { ...idleInput, firing: true }, 1 / 60);
  for (const shot of state.projectiles) {
    shot.y = state.player.y - 60;
    shot.previousY = shot.y;
  }
  for (let i = 0; i < 12; i++) {
    stepGame(state, { ...idleInput, dash: true, movement: { x: 0, y: -1 } }, 1 / 60);
  }
  assertEquals(state.minibossIntroStage, 7);
  assertEquals(state.player.health, state.player.maxHealth);
  assertGreater(state.projectiles.filter((shot) => shot.pattern === "backfill-wall").length, 0);
});

Deno.test("burst damage preserves exactly one combat wall then allows a quick kill", () => {
  const state = activeState();
  beginMiniboss(state);
  state.minibossIntroStage = 8;
  const boss = state.enemies[0];
  damageEnemy(state, boss, 1000);
  assertEquals(boss.health, boss.maxHealth * 0.66);
  assert(state.backfillShielded);
  damageEnemy(state, boss, 1000);
  assertEquals(boss.health, boss.maxHealth * 0.66);
  stepGame(state, idleInput, 1 / 60);
  assertGreater(state.backfillWallWarningFor, 0);
  state.backfillWallWarningFor = 0.001;
  stepGame(state, idleInput, 1 / 60);
  assert(state.backfillWallActive);
  assert(state.projectiles.every((shot) => shot.pattern === "backfill-wall"));
  state.player.invulnerableFor = 100;
  for (let i = 0; i < 600 && state.backfillWallActive; i++) stepGame(state, idleInput, 1 / 60);
  assert(state.backfillWallCompleted);
  assertEquals(state.backfillShielded, false);
  damageEnemy(state, boss, 1000);
  assert(boss.health <= 0);
});

Deno.test("Mandatory Backfill warns from a safe edge before joining the active fight", () => {
  const state = activeState();
  state.encounterIndex = 1;
  beginMiniboss(state);
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
  assertEquals(state.bossDialogue?.text, "MANDATORY BACKFILL! Covering fire!");
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
  beginMiniboss(state);
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
  beginMiniboss(state);
  const miniboss = state.enemies[0];
  state.minibossIntroStage = 8;
  state.player.invulnerableFor = 100;
  miniboss.health = miniboss.maxHealth * 0.65;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  state.projectiles = [];

  miniboss.bossAttackStep = 3;
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
  beginMiniboss(state);
  const miniboss = state.enemies[0];
  state.minibossIntroStage = 8;
  state.player.invulnerableFor = 100;
  miniboss.health = miniboss.maxHealth * 0.65;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  state.projectiles = [];

  for (let summon = 0; summon < 3; summon++) {
    state.backfillWallCooldown = 999;
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

Deno.test("Backfill Daemon defeat grants one heart, fully heals, and offers a reward before Retention Window", () => {
  const state = activeState();
  state.encounterIndex = 1;
  beginMiniboss(state);
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

Deno.test("Backfill Daemon defeat clears an active wall warning", () => {
  const state = activeState();
  state.encounterIndex = 1;
  beginMiniboss(state);
  const miniboss = state.enemies[0];
  state.minibossIntroStage = 8;
  state.player.invulnerableFor = 100;
  miniboss.health = 0;
  state.backfillWallCooldown = 4;
  state.backfillWallWarningFor = 1;
  state.backfillWallDirection = 1;

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertGreater(state.minibossDefeatFor, 0);
  assertEquals(state.backfillWallCooldown, 0);
  assertEquals(state.backfillWallWarningFor, 0);
  assertEquals(state.backfillWallDirection, 0);

  for (let frame = 0; frame < 55; frame++) stepGame(state, idleInput, 1 / 20, () => 0.5);
  assertEquals(state.phase, "reward");
  assertEquals(state.backfillWallWarningFor, 0);
});

Deno.test("uncollected enemy powerups survive the miniboss defeat and reward screen", () => {
  const state = activeState();
  state.encounterIndex = 1;
  beginMiniboss(state);
  const miniboss = state.enemies[0];
  state.minibossIntroStage = 8;
  state.player.invulnerableFor = 100;
  miniboss.health = 0;
  state.powerupDrops = [{
    id: 1,
    kind: "machine-gun",
    x: 80,
    y: 90,
    radius: 13,
    life: 1,
    fallSpeed: 145,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertGreater(state.minibossDefeatFor, 0);
  assertEquals(state.powerupDrops[0].life, 1);
  assertEquals(state.powerupDrops[0].y, 90);

  for (let frame = 0; frame < 55; frame++) stepGame(state, idleInput, 1 / 20, () => 0.5);
  assertEquals(state.phase, "reward");
  assertEquals(state.powerupDrops[0].life, 1);
  assertEquals(state.powerupDrops[0].y, 90);

  state.player.x = 80;
  state.player.y = 90;
  stepGame(state, idleInput, 1 / 20, () => 0.5);
  assertEquals(state.powerupDrops.length, 0);
  assertEquals(state.temporaryWeapon, { kind: "machine-gun", ammo: 48 });
});

Deno.test("hard mode scales Backfill Daemon health", () => {
  const state = activeState(7, "hard");
  state.encounterIndex = 1;
  beginMiniboss(state);

  assertEquals(state.phase, "miniboss");
  assertEquals(state.enemies[0].maxHealth, 207);
});

Deno.test("combat backfill preserves threats and provides covering fire", () => {
  const state = activeState();
  beginMiniboss(state);
  state.minibossIntroStage = 8;
  state.player.invulnerableFor = 100;
  const boss = state.enemies[0];
  for (let i = 0; i < 600 && state.backfillWallWarningFor === 0; i++) {
    stepGame(state, idleInput, 1 / 60);
  }
  assertGreater(state.backfillWallWarningFor, 0);
  assertEquals(boss.bossAttackStep, 3);
  assertGreater(state.projectiles.filter((shot) => !shot.friendly).length, 0);
  state.backfillWallWarningFor = 0.001;
  stepGame(state, idleInput, 1 / 60);
  for (let i = 0; i < 30; i++) stepGame(state, idleInput, 1 / 60);
  assert(state.backfillWallActive);
  assertEquals(boss.bossAttackStep, 3);
  for (let i = 0; i < 42; i++) stepGame(state, idleInput, 1 / 60);
  assert(state.projectiles.some((shot) => !shot.friendly && shot.pattern !== "backfill-wall"));
  for (let i = 0; i < 600 && state.backfillWallActive; i++) stepGame(state, idleInput, 1 / 60);
  assert(state.backfillWallCompleted);
  assertGreater(boss.behaviorCooldown, 0.8);
});

Deno.test("typing and punchline animations cannot be skipped or queue an advance", () => {
  const state = activeState();
  beginMiniboss(state);
  stepGame(state, idleInput, 1 / 60);
  for (let i = 0; i < 60; i++) stepGame(state, { ...idleInput, secondary: i % 2 === 0 }, 1 / 60);
  assertEquals(state.minibossIntroStage, 1);
  assertEquals(state.bossDialogue?.revealRate, 17);
  for (let i = 0; i < 300; i++) stepGame(state, { ...idleInput, secondary: true }, 1 / 60);
  assertEquals(state.minibossIntroStage, 1);
  stepGame(state, idleInput, 1 / 60);
  stepGame(state, { ...idleInput, secondary: true }, 1 / 60);
  for (let i = 0; i < 360; i++) stepGame(state, { ...idleInput, secondary: true }, 1 / 60);
  assertEquals(state.minibossIntroStage, 5);
});

Deno.test("new attacks announce themselves and fire a delayed second volley", () => {
  for (const attackStep of [0, 2]) {
    const state = activeState();
    beginMiniboss(state);
    state.minibossIntroStage = 8;
    state.player.invulnerableFor = 100;
    const boss = state.enemies[0];
    boss.bossAttackStep = attackStep;
    boss.behaviorCooldown = 0;
    stepGame(state, idleInput, 1 / 60);
    assert(
      state.bossDialogue?.text.startsWith(attackStep === 0 ? "DOUBLE STAMP" : "ROTATING BACKUP"),
    );
    assertEquals(state.projectiles.length, 0);
    boss.behaviorCooldown = 0;
    stepGame(state, idleInput, 1 / 60);
    const firstVolleyIds = state.projectiles.map((shot) => shot.id);
    assertGreater(firstVolleyIds.length, 0);
    for (let i = 0; i < 42; i++) stepGame(state, idleInput, 1 / 60);
    assertEquals(state.backfillFollowupAttack, null);
    assert(state.projectiles.some((shot) => !firstVolleyIds.includes(shot.id)));
  }
});

Deno.test("completion-time animation keeps the full sentence readable and ignores presses", () => {
  const state = activeState();
  beginMiniboss(state);
  for (let i = 0; i < 300; i++) stepGame(state, idleInput, 1 / 60);
  stepGame(state, { ...idleInput, secondary: true }, 1 / 60);
  assertEquals(state.minibossIntroStage, 2);
  assertEquals(state.bossDialogue?.revealRate, undefined);
  assert(state.bossDialogue?.text.includes("Estimated completion time."));
  for (let i = 0; i < 55; i++) stepGame(state, { ...idleInput, secondary: i % 2 === 0 }, 1 / 60);
  assertEquals(state.minibossIntroStage, 2);
  for (let i = 0; i < 120; i++) stepGame(state, { ...idleInput, secondary: i % 2 === 0 }, 1 / 60);
  assertEquals(state.minibossIntroStage, 4);
  assert(state.bossDialogue?.text.endsWith("..."));
});

Deno.test("backfill never deletes summoned enemies or their existing projectiles", () => {
  const state = activeState();
  beginMiniboss(state);
  state.minibossIntroStage = 8;
  state.player.invulnerableFor = 100;
  const boss = state.enemies[0];
  boss.health = boss.maxHealth * 0.5;
  stepGame(state, idleInput, 1 / 60);
  boss.bossAttackStep = 2;
  boss.behaviorCooldown = 0;
  stepGame(state, idleInput, 1 / 60);
  boss.behaviorCooldown = 0;
  stepGame(state, idleInput, 1 / 60);
  const adds = state.enemies.filter((enemy) => enemy.kind !== "boss");
  assertEquals(adds.length, 2);
  const shot = projectile({
    friendly: false,
    x: 100,
    y: 100,
    previousX: 100,
    previousY: 100,
    vx: 0,
    vy: 0,
    life: 10,
  });
  state.projectiles.push(shot);
  state.backfillWallCooldown = 0;
  stepGame(state, idleInput, 1 / 60);
  assert(adds.every((add) => state.enemies.includes(add)));
  assert(state.projectiles.includes(shot));
  state.backfillWallWarningFor = 0.001;
  stepGame(state, idleInput, 1 / 60);
  assert(adds.every((add) => state.enemies.includes(add)));
  assert(state.projectiles.includes(shot));
});

Deno.test("the player can move and dodge during the automatic post-wall reaction", () => {
  const state = activeState();
  beginMiniboss(state);
  state.minibossIntroStage = 7;
  state.minibossIntroFor = 3;
  const startX = state.player.x;
  stepGame(state, { ...idleInput, movement: { x: 1, y: 0 } }, 1 / 60);
  assertGreater(state.player.x, startX);
  state.player.dashCooldown = 0;
  stepGame(state, { ...idleInput, movement: { x: 1, y: 0 }, dash: true }, 1 / 60);
  assertGreater(state.player.dashFor, 0);
  assertEquals(state.minibossIntroStage, 7);
  for (let i = 0; i < 200; i++) stepGame(state, idleInput, 1 / 60);
  assertEquals(state.minibossFightStarts, 1);
});

Deno.test("NEVER holds for its full beat before automatically launching the teaching wall", () => {
  const state = activeState();
  beginMiniboss(state);
  state.minibossIntroStage = 4;
  state.minibossIntroFor = 0;
  stepGame(state, idleInput, 1 / 60);
  assertEquals(state.bossDialogue?.text, "NEVER!");
  for (let i = 0; i < 120; i++) stepGame(state, { ...idleInput, secondary: i % 2 === 0 }, 1 / 60);
  assertEquals(state.minibossIntroStage, 5);
  assertEquals(state.projectiles.length, 0);
  for (let i = 0; i < 30; i++) stepGame(state, idleInput, 1 / 60);
  assertEquals(state.minibossIntroStage, 6);
  assert(state.projectiles.some((shot) => shot.pattern === "backfill-wall"));
});

Deno.test("Backfill keeps moving through the wall warning and covering fire", () => {
  const state = activeState();
  beginMiniboss(state);
  state.minibossIntroStage = 8;
  state.player.invulnerableFor = 100;
  const boss = state.enemies[0];
  boss.x = 140;
  boss.y = 80;
  state.backfillWallCooldown = 0;
  const initial = { x: boss.x, y: boss.y };
  stepGame(state, idleInput, 1 / 60);
  assertGreater(Math.hypot(boss.x - initial.x, boss.y - initial.y), 0);
  state.backfillWallWarningFor = 0.001;
  stepGame(state, idleInput, 1 / 60);
  const wall = state.projectiles.find((shot) => shot.pattern === "backfill-wall")!;
  assertEquals(Math.hypot(wall.vx, wall.vy), 260);
  const duringWall = { x: boss.x, y: boss.y };
  for (let i = 0; i < 65; i++) stepGame(state, idleInput, 1 / 60);
  assertGreater(Math.hypot(boss.x - duringWall.x, boss.y - duringWall.y), 10);
  assertGreater(state.projectiles.filter((shot) => !shot.friendly && !shot.pattern).length, 1);
});

Deno.test("Backfill attacks recover sooner while retaining a readable warning", () => {
  const state = activeState();
  beginMiniboss(state);
  state.minibossIntroStage = 8;
  const boss = state.enemies[0];
  boss.bossAttackStep = 1;
  boss.behaviorCooldown = 0;
  stepGame(state, idleInput, 1 / 60);
  assertGreater(boss.warningFor, 0.6);
  boss.behaviorCooldown = 0;
  stepGame(state, idleInput, 1 / 60);
  assert(boss.behaviorCooldown <= 0.55);
  assertEquals(boss.maxHealth, 175);
});

Deno.test("Space advances a ready miniboss line even while primary fire is held", () => {
  const state = activeState();
  beginMiniboss(state);
  for (let i = 0; i < 300; i++) stepGame(state, { ...idleInput, firing: true }, 1 / 60);
  assertEquals(state.minibossIntroStage, 1);
  stepGame(state, { ...idleInput, firing: true, secondary: true }, 1 / 60);
  assertEquals(state.minibossIntroStage, 2);
});
