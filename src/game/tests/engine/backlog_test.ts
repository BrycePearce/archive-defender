import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertGreater,
  assertNotEquals,
} from "@std/assert";
import { stepGame } from "../../engine.ts";

import type { GameState } from "../../types.ts";
import { activateBacklogBoss, backlogBossState, idleInput, projectile } from "./support.ts";

Deno.test("the Backlog Behemoth organizes a wall before revealing the ruse", () => {
  const state = backlogBossState();
  const boss = state.enemies.find((candidate) => candidate.kind === "boss");
  assert(boss);

  assertEquals(boss.bossKind, "backlog");
  assertEquals(boss.maxHealth, 3);
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
  assertEquals(boss.health, 3);
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
  assertEquals(boss.health, 3);
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
  assertEquals(target.maxHealth, 2);
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
  assertEquals(boss.health, 2);
  assertEquals(state.backlogIntermissionStage, 4);
  assertEquals(state.bossDialogue?.text, "That was still in theaters!");
  assertEquals(state.backlogTiles.length, 0);

  state.backlogIntermissionFor = 0.001;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.backlogIntermissionStage, 1);
  assertGreater(state.backlogFirewallWarningFor, 0);
  assertEquals(state.bossDialogue?.text, "Let's see how you like being wiped.");
});

Deno.test("a boss hit recalls every remaining gold ball with a visible trail", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const boss = state.enemies[0];
  state.backlogTiles = [];
  state.particles = [];
  state.backlogBombs = [
    {
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
    },
    {
      x: 55,
      y: 210,
      previousX: 55,
      previousY: 210,
      vx: 120,
      vy: -80,
      radius: 11,
      kind: "returnable",
      returned: true,
      lobFor: 0,
      lobDuration: 0,
      life: 8,
      maxLife: 15,
    },
  ];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.backlogBombs.length, 0);
  const recalledTrail = state.particles.filter((particle) =>
    particle.color === "#9defff" && particle.x < 180
  );
  assertGreater(recalledTrail.length, 3);
  assert(recalledTrail.every((particle) => particle.vx > 0 && particle.vy < 0));
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

Deno.test("the second hit announces emergency restoration before its attacks", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const boss = state.enemies[0];
  state.backlogHits = 1;
  boss.health = 2;
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

  assertEquals(state.bossDialogue?.text, "My backups have backups! Emergency restoration!");
  assertGreater(state.backlogIntermissionFor, 1.4);

  state.backlogIntermissionFor = 0.001;
  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(state.bossDialogue?.text, "RESTORE EVERYTHING. Especially the things you deleted.");
  assertGreater(state.backlogFirewallWarningFor, 1.9);
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
  assertEquals(boss.health, 2);
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

Deno.test("emergency restoration escalates through eight waves before a sparse final board", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogHits = 2;
  state.backlogRebuildAfterWall = true;
  state.backlogIntermissionStage = 1;
  state.backlogIntermissionFor = 0.001;
  state.backlogFirewallWarningFor = 0.001;
  state.backlogFirewallDirection = 0;
  state.backlogFirewallGaps = [100, 400, 110, 390, 90, 410, 120, 380];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  const firewall = state.projectiles.filter(
    (candidate) => candidate.pattern === "backlog-firewall",
  );
  assertGreater(firewall.length, 20);
  assert(firewall.every((shot) => shot.vx === 0));
  assert(firewall.every((shot) => Math.abs(shot.x - state.backlogFirewallGaps[0]) >= 40));
  assertEquals(state.backlogMazeWallIndex, 1);
  assertEquals(state.bossDialogue, null);
  assert(state.banner.includes("RESTORATION"));
  assertGreater(state.backlogIntermissionFor, 15);
  for (let wall = 1; wall < state.backlogFirewallGaps.length; wall++) {
    state.projectiles = [];
    state.backlogMazeNextWallFor = 0.001;
    stepGame(state, idleInput, 1 / 60, () => 0.5);
    assertGreater(state.projectiles.length, 20);
    const wallVelocity = state.projectiles[0].vx;
    const redWall = wall === 6;
    assert(
      state.projectiles.every((shot) =>
        shot.pattern === (redWall ? "backlog-firewall-red" : "backlog-firewall")
      ),
    );
    if (redWall) assertGreater(state.projectiles[0].warningFor ?? 0, 0.8);
    assert(state.projectiles.every((shot) => shot.vx === wallVelocity));
    if (wall < 2 || redWall) assertEquals(wallVelocity, 0);
    else {
      assertNotEquals(wallVelocity, 0);
      assertEquals(Math.sign(wallVelocity), wall % 2 === 0 ? -1 : 1);
    }
    if (!redWall) {
      const positions = state.projectiles.map((shot) => shot.x).sort((a, b) => a - b);
      const gapIndex = positions.findIndex((x, index) =>
        index > 0 && x - positions[index - 1] > 70
      );
      assertGreater(gapIndex, 0);
      const gapCenter = (positions[gapIndex] + positions[gapIndex - 1]) / 2;
      const finalCenter = gapCenter + wallVelocity * state.projectiles[0].life;
      assert(gapCenter > 35 && gapCenter < state.width - 35);
      assert(finalCenter > 35 && finalCenter < state.width - 35);
    }
  }
  assertEquals(state.backlogMazeWallIndex, 8);
  assert(state.banner.includes("RESTORATION"));
  assertEquals(state.backlogIntermissionStage, 2);
  assertEquals(state.backlogTiles.length, 0);

  state.backlogIntermissionFor = 0.001;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.backlogIntermissionStage, 0);
  assert(state.backlogTiles.length > 0 && state.backlogTiles.length < 16);
});

Deno.test("restoration fans telegraph a fixed aim and intensify for the last wave", () => {
  for (const [wave, count] of [[2, 3], [4, 3], [7, 5]]) {
    const state = backlogBossState();
    activateBacklogBoss(state);
    const boss = state.enemies[0];
    state.backlogHits = 2;
    state.backlogTiles = [];
    state.backlogIntermissionStage = 2;
    state.backlogIntermissionFor = 10;
    state.backlogFirewallGaps = Array(8).fill(state.width / 2);
    state.backlogMazeWallIndex = wave;
    state.backlogMazeNextWallFor = 0.001;
    stepGame(state, idleInput, 1 / 60, () => 0.5);
    const lockedAngle = state.backlogRetaliationAngle;
    assert(lockedAngle !== null);
    assertGreater(state.backlogRetaliationFor, 0.8);
    state.projectiles = [];
    state.player.x = 20;
    for (let frame = 0; frame < 12; frame++) {
      stepGame(state, idleInput, 1 / 20, () => 0.5);
      assertEquals(state.backlogRetaliationAngle, lockedAngle);
      assertEquals(state.projectiles.length, 0);
    }
    assertNotEquals(Math.atan2(state.player.y - boss.y, state.player.x - boss.x), lockedAngle);
    for (let frame = 0; frame < 6; frame++) stepGame(state, idleInput, 1 / 20, () => 0.5);
    assertEquals(state.projectiles.length, count);
    const center = state.projectiles[Math.floor(count / 2)];
    assertAlmostEquals(Math.atan2(center.vy, center.vx), lockedAngle);
    assertEquals(state.backlogRetaliationAngle, null);
    assertEquals(state.backlogRetaliationFor, 0);
    state.backlogIntermissionFor = 0.001;
    stepGame(state, idleInput, 1 / 60, () => 0.5);
    assertEquals(state.projectiles.length, 0);
  }
});

Deno.test("emergency restoration lasts twenty to twenty-five seconds including transitions", () => {
  const state = backlogBossState();
  state.width = 960;
  state.height = 600;
  activateBacklogBoss(state);
  const boss = state.enemies[0];
  state.backlogHits = 1;
  boss.health = 2;
  state.backlogTiles = [];
  state.player.invulnerableFor = 60;
  state.backlogBombs = [{
    x: boss.x,
    y: boss.y,
    previousX: boss.x,
    previousY: boss.y,
    vx: 0,
    vy: 0,
    radius: 11,
    kind: "returnable",
    returned: true,
    lobFor: 0,
    lobDuration: 0,
    life: 4,
    maxLife: 6,
  }];
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  let duration = 0;
  while (state.backlogIntermissionStage !== 0 && duration < 30) {
    stepGame(state, idleInput, 1 / 20, () => 0.5);
    duration += 1 / 20;
  }
  assert(duration >= 20 && duration <= 25, `Restoration lasted ${duration} seconds`);
  assertEquals(state.backlogIntermissionStage, 0);
  assertEquals(state.backlogMazeWallIndex, 8);
  assertEquals(state.projectiles.length, 0);
});

Deno.test("three breakout rounds shed armor and finish after only two wipes", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const boss = state.enemies[0];
  let previousCount = Infinity;
  let previousDurability = Infinity;
  let previousTargetDurability = Infinity;
  for (let round = 0; round < 3; round++) {
    const durability = state.backlogTiles.reduce((total, tile) => total + tile.health, 0);
    const targetDurability = state.backlogTiles
      .filter((tile) => tile.column === state.backlogTargetColumn)
      .reduce((total, tile) => total + tile.health, 0);
    assert(state.backlogTiles.length > 0 && state.backlogTiles.length < previousCount);
    assert(durability < previousDurability);
    assert(targetDurability > 0 && targetDurability < previousTargetDurability);
    previousCount = state.backlogTiles.length;
    previousDurability = durability;
    previousTargetDurability = targetDurability;
    state.backlogTiles = [];
    state.backlogBombs = [{
      x: boss.x,
      y: boss.y,
      previousX: boss.x,
      previousY: boss.y,
      vx: 0,
      vy: 0,
      radius: 11,
      kind: "returnable",
      returned: true,
      lobFor: 0,
      lobDuration: 0,
      life: 4,
      maxLife: 6,
    }];
    stepGame(state, idleInput, 1 / 60, () => 0.5);
    assertEquals(state.backlogHits, round + 1);
    if (round === 2) {
      assertEquals(state.backlogIntermissionStage, 3);
      assertEquals(state.backlogRebuildAfterWall, false);
      state.backlogIntermissionFor = 0.001;
      stepGame(state, idleInput, 1 / 60, () => 0.5);
      assertEquals(state.phase, "actComplete");
      assertEquals(state.backlogTiles.length, 0);
      continue;
    }
    assertEquals(state.backlogIntermissionStage, 4);
    for (const nextStage of [1, 2, 0]) {
      state.backlogIntermissionFor = 0.001;
      stepGame(state, idleInput, 1 / 60, () => 0.5);
      assertEquals(state.backlogIntermissionStage, nextStage);
    }
  }
});

Deno.test("ordinary fire can carve a passage through Backlog firewall segments", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogHits = 1;
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

Deno.test("red Backlog walls resist gunfire and Deep Scan", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogHits = 2;
  state.backlogTiles = [];
  state.backlogIntermissionStage = 2;
  state.backlogIntermissionFor = 10;
  state.backlogMazeWallIndex = 8;
  const wallId = state.nextProjectileId++;
  state.projectiles = [
    projectile({
      id: wallId,
      x: state.player.x,
      y: state.player.y - 60,
      previousX: state.player.x,
      previousY: state.player.y - 60,
      friendly: false,
      pattern: "backlog-firewall-red",
      radius: 8,
    }),
    projectile({
      id: state.nextProjectileId++,
      x: state.player.x,
      y: state.player.y - 60,
      previousX: state.player.x,
      previousY: state.player.y - 60,
    }),
  ];

  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assert(state.projectiles.some((candidate) => candidate.id === wallId));

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
  assert(state.projectiles.some((candidate) => candidate.id === wallId));
});

Deno.test("Deep Scan carves a corridor through Backlog firewall segments", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  state.backlogHits = 2;
  state.backlogIntermissionStage = 2;
  state.backlogIntermissionFor = 10;
  state.backlogMazeWallIndex = 8;
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
  assert(redTiles.every((tile) => tile.maxHealth === 2));
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
  const bonusBall = state.backlogBombs.find((bomb) => bomb.lobDuration === 0);
  assert(bonusBall);
  assertEquals(bonusBall.kind, "returnable");
  assertEquals(bonusBall.returned, false);
  assertEquals(bonusBall.vy, 145);
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

Deno.test("extra gold balls immediately obey normal breakout ricochet rules", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const tile = state.backlogTiles.find((candidate) => candidate.row === 3);
  assert(tile);
  state.backlogTiles = [tile];
  const originalHealth = tile.health;
  const startY = tile.y - tile.height / 2 - 13;
  state.backlogBombs = [{
    x: tile.x,
    y: startY,
    previousX: tile.x,
    previousY: startY,
    vx: 0,
    vy: 390,
    radius: 11,
    kind: "returnable",
    returned: false,
    lobFor: 0,
    lobDuration: 0,
    life: 12,
    maxLife: 15,
  }];

  stepGame(state, idleInput, 1 / 60, () => 0.5);

  assertEquals(tile.health, originalHealth - 1);
  assert(state.backlogBombs[0].vy < 0);
  assertEquals(state.backlogBombs[0].returned, false);
});

Deno.test("the third returned bomb pauses for the Maybe Later punchline", () => {
  const state = backlogBossState();
  activateBacklogBoss(state);
  const boss = state.enemies[0];
  state.backlogHits = 2;
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

  assertEquals(state.backlogHits, 3);
  assertEquals(boss.health, 1);
  assertEquals(state.backlogIntermissionStage, 3);
  assert(state.bossDialogue?.text.includes("Maybe Later"));

  state.backlogIntermissionFor = 0.001;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  assertEquals(state.phase, "actComplete");
});
