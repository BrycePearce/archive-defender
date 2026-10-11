import { assert, assertAlmostEquals, assertEquals, assertGreater } from "@std/assert";
import { createGameState, dispatchGameAction, resizeGameState, stepGame } from "../../engine.ts";
import {
  catalogCachePosition,
  SWEEP_GAP_WIDTH,
  updateStacksEncounter,
} from "../../engine/encounters/stacks.ts";
import {
  beginEncounter,
  updateObjective,
  updateRelayObjective,
} from "../../engine/systems/progression.ts";
import { updateSpawns } from "../../engine/systems/spawning.ts";
import { enemy, idleInput, projectile } from "./support.ts";
import type { ArcadeAudio, ArcadeSfx } from "../../audio.ts";
import { captureArcadeSignals, syncArcadeAudioSignals } from "../../runtime/audioSignals.ts";

function encounter(index: number, width = 800, height = 600) {
  const state = createGameState(width, height, { seed: 17 });
  state.encounterIndex = index;
  beginEncounter(state);
  return state;
}

Deno.test("catalog captures clear traffic, refresh dash, and follow the previewed route", () => {
  const state = encounter(1);
  assert(state.relayCache && state.stacks.nextCache);
  const next = { ...state.stacks.nextCache };
  const cache = { ...state.relayCache };
  state.player.x = cache.x;
  state.player.y = cache.y;
  state.player.dashCooldown = 2;
  state.enemies = [enemy({ x: cache.x + 60, y: cache.y })];
  state.projectiles = [
    projectile({ x: cache.x + 50, y: cache.y, friendly: false }),
    projectile({ id: 2, x: cache.x + 300, y: cache.y, friendly: false }),
    projectile({ id: 3, x: cache.x, y: cache.y }),
  ];
  updateRelayObjective(state, 1 / 60);
  assertEquals(state.objectiveProgress, 1);
  assertEquals(state.player.dashCooldown, 0);
  assertGreater(state.enemies[0].x, cache.x + 60);
  assertEquals(state.enemies[0].health, 1);
  assertEquals(state.projectiles[0].life, 0);
  assertGreater(state.projectiles[1].life, 0);
  assertGreater(state.projectiles[2].life, 0);
  assertEquals({ x: state.relayCache!.x, y: state.relayCache!.y }, next);
});

Deno.test("a missed catalog cache preserves progress and can be recovered on retry", () => {
  const state = encounter(1);
  state.objectiveProgress = 4;
  state.relayStreak = 4;
  state.relayCache!.timeRemaining = 0;
  const health = state.player.health;
  updateRelayObjective(state, 1 / 60);
  assertEquals(state.objectiveProgress, 4);
  assertEquals(state.relayStreak, 0);
  assertEquals(state.player.health, health);
  assertEquals(state.stacks.notice, "CACHE EXPIRED · CHAIN RESET");
  state.player.x = state.relayCache!.x;
  state.player.y = state.relayCache!.y;
  updateRelayObjective(state, 1 / 60);
  assertEquals(state.objectiveProgress, 5);
  assertEquals(state.relayStreak, 1);
  assert(state.enemies.some((enemy) => enemy.kind === "buffering"));
});

Deno.test("catalog routes fit small and large arenas and remain reachable within the cache timer", () => {
  for (const [width, height] of [[320, 240], [800, 600], [1400, 900]]) {
    const state = encounter(1, width, height);
    let previous = state.player;
    for (let index = 0; index < 10; index++) {
      const point = catalogCachePosition(state, index);
      assert(point.x >= 18 && point.x <= width - 18);
      assert(point.y >= 18 && point.y <= height - 18);
      assert(Math.hypot(point.x - previous.x, point.y - previous.y) < 255 * 7 * 0.85);
      previous = { ...state.player, ...point };
    }
  }
});

Deno.test("catalog completion enters the miniboss after its finish beat", () => {
  const state = encounter(1);
  state.objectiveProgress = 9;
  state.player.x = state.relayCache!.x;
  state.player.y = state.relayCache!.y;
  updateObjective(state, 1 / 60);
  const score = state.score;
  assertEquals(state.stacks.notice, "CATALOG RESTORED");
  assertEquals(state.phase, "encounter");
  updateObjective(state, 0.5);
  assertEquals(state.score, score);
  updateObjective(state, 1);
  assertEquals(state.phase, "miniboss");
  assertEquals(state.encounterIndex, 1);
  assertEquals(state.enemies[0].bossKind, "backfill-daemon");
});

Deno.test("optional terminals need a sustained hold, save four seconds, and award once", () => {
  const state = encounter(2);
  state.objectiveProgress = 12;
  updateStacksEncounter(state, 0);
  const terminal = state.stacks.terminal!;
  state.player.x = terminal.x;
  state.player.y = terminal.y;
  updateStacksEncounter(state, 0.3);
  assertEquals(state.objectiveProgress, 12);
  updateStacksEncounter(state, 0.4);
  assertEquals(state.objectiveProgress, 16);
  assertEquals(state.stacks.terminalsRecovered, 1);
  assertEquals(state.score, 100);
  updateStacksEncounter(state, 1);
  assertEquals(state.objectiveProgress, 16);
  assertEquals(state.stacks.terminal, null);
});

Deno.test("terminal expiry and the final countdown cannot reset survival progress", () => {
  const state = encounter(2);
  state.objectiveProgress = 12;
  updateStacksEncounter(state, 0);
  state.stacks.terminal!.life = 0;
  updateStacksEncounter(state, 0.01);
  assertEquals(state.objectiveProgress, 12);
  state.objectiveProgress = 46;
  updateStacksEncounter(state, 0);
  state.stacks.terminal!.charge = 1;
  state.objectiveProgress = 56;
  updateStacksEncounter(state, 0);
  assertEquals(state.objectiveProgress, 56);
  assertEquals(state.stacks.terminal, null);
});

Deno.test("retention sweeps telegraph, leave a safe gap, and respect invulnerability", () => {
  const state = encounter(2);
  state.objectiveProgress = 42;
  state.player.invulnerableFor = 0;
  updateStacksEncounter(state, 0);
  assertGreater(state.stacks.sweep!.warningFor, 0);
  const sweep = state.stacks.sweep!;
  const health = state.player.health;
  sweep.position = state.player.y;
  updateStacksEncounter(state, 0.1);
  assertEquals(state.player.health, health);
  sweep.warningFor = 0;
  updateStacksEncounter(state, 0.01);
  assertEquals(state.player.health, health);
  state.player.x = sweep.gap + SWEEP_GAP_WIDTH / 2 + 20;
  updateStacksEncounter(state, 0.01);
  assertEquals(state.player.health, health - 1);
  updateStacksEncounter(state, 0.01);
  assertEquals(state.player.health, health - 1);
});

Deno.test("retention reinforcement beats follow the accelerated clock and alternate sides", () => {
  const state = encounter(2);
  state.objectiveProgress = 24;
  state.enemies = [];
  state.spawnCooldown = 0;
  updateSpawns(state, 0.01, () => 0.1);
  assertEquals(state.spawnBeatIndex, 1);
  assert(state.enemies[0].x < 0);
  state.objectiveProgress = 28;
  state.spawnCooldown = 0;
  updateSpawns(state, 0.01, () => 0.1);
  assert(state.enemies[1].x > state.width);
  state.objectiveProgress = 50;
  state.spawnCooldown = 0;
  updateSpawns(state, 0.01, () => 0.1);
  assertEquals(state.spawnBeatIndex, 2);
});

Deno.test("objective markers and retention sweep geometry follow arena resizing", () => {
  const state = encounter(1);
  const x = state.relayCache!.x;
  resizeGameState(state, 400, 300);
  assertAlmostEquals(state.relayCache!.x, x / 2);
  state.encounterIndex = 2;
  beginEncounter(state);
  state.objectiveProgress = 42;
  updateStacksEncounter(state, 0);
  const gap = state.stacks.sweep!.gap;
  resizeGameState(state, 800, 600);
  assertAlmostEquals(state.stacks.sweep!.gap, gap * 2);
});

Deno.test("later acts retain their original relay and survival mechanics", () => {
  const state = encounter(1);
  state.actIndex = 1;
  beginEncounter(state);
  assertEquals(state.stacks.nextCache, null);
  state.player.x = state.relayCache!.x;
  state.player.y = state.relayCache!.y;
  state.player.dashCooldown = 2;
  updateRelayObjective(state, 0.01);
  assertEquals(state.player.dashCooldown, 2);
  state.encounterIndex = 2;
  beginEncounter(state);
  state.objectiveProgress = 50;
  updateStacksEncounter(state, 1);
  assertEquals(state.stacks.sweep, null);
  assertEquals(state.stacks.terminal, null);
});

Deno.test("retention completion rewards the player before the final boss", () => {
  const state = encounter(2);
  state.objectiveProgress = 65;
  stepGame(state, idleInput, 1 / 60);
  assertEquals(state.enemies.length, 0);
  assertEquals(state.stacks.notice, "RETENTION PURGE COMPLETE");
  for (let frame = 0; frame < 90; frame++) stepGame(state, idleInput, 1 / 60);
  assertEquals(state.phase, "reward");
  dispatchGameAction(state, { type: "chooseUpgrade", upgradeId: state.offeredUpgrades[0] });
  assertEquals(state.phase, "boss");
  assertEquals(state.enemies[0].bossKind, "backlog");
});

Deno.test("catalog sound cues distinguish captures from expiry and rise with the chain", () => {
  const state = encounter(1);
  const sounds: { kind: ArcadeSfx; pitch?: number }[] = [];
  const audio = {
    playSfx(kind: ArcadeSfx, pitch?: number) {
      sounds.push({ kind, pitch });
    },
  } as ArcadeAudio;
  let previous = captureArcadeSignals(state);
  state.player.x = state.relayCache!.x;
  state.player.y = state.relayCache!.y;
  updateRelayObjective(state, 0.01);
  previous = syncArcadeAudioSignals(audio, state, previous);
  const firstPitch = sounds.find((sound) => sound.kind === "cache-capture")!.pitch!;
  sounds.length = 0;
  state.player.x = state.relayCache!.x;
  state.player.y = state.relayCache!.y;
  updateRelayObjective(state, 0.01);
  previous = syncArcadeAudioSignals(audio, state, previous);
  assertGreater(sounds.find((sound) => sound.kind === "cache-capture")!.pitch!, firstPitch);
  sounds.length = 0;
  state.relayCache!.timeRemaining = 0;
  updateRelayObjective(state, 0.01);
  syncArcadeAudioSignals(audio, state, previous);
  assertEquals(sounds.map((sound) => sound.kind), ["cache-expired"]);
});

Deno.test("retention countdown ticks once per second and remains quiet outside the finale", () => {
  const state = encounter(2);
  const sounds: ArcadeSfx[] = [];
  const audio = {
    playSfx(kind: ArcadeSfx) {
      sounds.push(kind);
    },
  } as ArcadeAudio;
  let previous = captureArcadeSignals(state);
  state.objectiveProgress = 54;
  previous = syncArcadeAudioSignals(audio, state, previous);
  assertEquals(sounds, []);
  state.objectiveProgress = 55.01;
  previous = syncArcadeAudioSignals(audio, state, previous);
  assertEquals(sounds, ["countdown"]);
  previous = syncArcadeAudioSignals(audio, state, previous);
  assertEquals(sounds, ["countdown"]);
  state.objectiveProgress = 56.01;
  syncArcadeAudioSignals(audio, state, previous);
  assertEquals(sounds, ["countdown", "countdown"]);
});

Deno.test("a lethal sweep cannot be overwritten by objective completion", () => {
  const state = encounter(2);
  state.enemies = [];
  state.spawnCooldown = 10;
  state.player.health = 1;
  state.player.invulnerableFor = 0;
  state.objectiveProgress = 64.99;
  state.stacks.sweep = { vertical: false, position: state.player.y, gap: 100, warningFor: 0 };
  stepGame(state, idleInput, 1 / 60);
  assertEquals(state.phase, "gameOver");
  assertEquals(state.player.health, 0);
});
