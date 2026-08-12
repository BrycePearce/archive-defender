import { ACTS } from "../../content.ts";
import type { DifficultyMode, EncounterDefinition, GameState, WeaponKind } from "../../types.ts";
import { backlogTargetColumnForRound, createBacklogTiles } from "../encounters/backlog.ts";
import {
  burstParticles,
  createBoss,
  createMiniboss,
  showBossDialogue,
  spawnEnemy,
} from "../combat.ts";
import {
  BACKLOG_BOSS_HITS,
  BASE_PLAYER_SPEED,
  MAX_ENEMIES,
  MAX_HAZARDS,
  MAX_PARTICLES,
  MAX_PROJECTILES,
  PLAYER_RADIUS,
  RELAY_RADIUS,
  REWARD_REVEAL_DELAY,
  UPGRADE_TARGET_RADIUS,
} from "../config.ts";
import { adjustedBudget, chooseWeightedKind } from "../enemies.ts";
import { clamp, segmentHitsCircle } from "../geometry.ts";
import { applyUpgrade, offerUpgrades, resetDropDirector, upgradeLevel } from "../powerups.ts";
import { nextRandom } from "../random.ts";
import { getCurrentEncounter } from "../selectors.ts";
import { isBacklogFirewallPattern } from "../projectilePatterns.ts";
import { configureWeaponState } from "./player.ts";

export function resetForRun(
  state: GameState,
  mode: DifficultyMode,
  weapon: WeaponKind,
  seed: number,
  createGameState: (
    width: number,
    height: number,
    options: {
      mode: DifficultyMode;
      weapon: WeaponKind;
      seed: number;
      phase: GameState["phase"];
    },
  ) => GameState,
) {
  const fresh = createGameState(state.width, state.height, {
    mode,
    weapon,
    seed,
    phase: "title",
  });
  Object.assign(state, fresh);
}

export function beginEncounter(state: GameState) {
  const encounter = ACTS[state.actIndex].encounters[state.encounterIndex];
  state.phase = "encounter";
  state.phaseElapsed = 0;
  state.objectiveProgress = 0;
  state.objectiveTarget = encounter.target;
  state.spawnBeatIndex = 0;
  state.spawnBudgetRemaining = adjustedBudget(state, encounter.beats[0].budget);
  state.spawnCooldown = 0.08;
  state.noDamage = true;
  state.offeredUpgrades = [];
  state.upgradeTargets = [];
  state.rewardRevealFor = 0;
  state.rewardSelectionArmed = false;
  state.rewardTransitionFor = 0;
  state.relayStreak = 0;
  state.relayMisses = 0;
  state.patternCooldown = 8;
  state.patternWarningFor = 0;
  state.patternSourceId = null;
  state.patternKind = null;
  state.banner = encounter.name;
  resetDropDirector(state);
  preparePlayerForPhase(state);
  clearArena(state);
  while (
    state.enemies.length < encounter.openingThreats &&
    state.enemies.length < MAX_ENEMIES
  ) {
    const kind = chooseWeightedKind(encounter.beats[0].weights, () => nextRandom(state));
    state.enemies.push(spawnEnemy(state, kind, () => nextRandom(state)));
  }
  if (encounter.objective === "relay") spawnRelayCache(state);
}

export function beginBoss(state: GameState) {
  const definition = ACTS[state.actIndex].boss;
  state.phase = "boss";
  state.phaseElapsed = 0;
  state.objectiveProgress = 0;
  state.objectiveTarget = definition.kind === "backlog" ? BACKLOG_BOSS_HITS : definition.health;
  state.noDamage = true;
  state.spawnBudgetRemaining = 0;
  state.banner = definition.name;
  resetDropDirector(state);
  preparePlayerForPhase(state);
  clearArena(state);
  const boss = createBoss(state);
  state.enemies.push(boss);
  if (definition.kind === "backlog") {
    boss.x = state.width / 2;
    boss.y = state.height / 2;
    boss.health = BACKLOG_BOSS_HITS;
    boss.maxHealth = BACKLOG_BOSS_HITS;
    boss.radius = 48;
    boss.behaviorCooldown = 100;
    state.player.x = state.width / 2;
    state.player.y = state.height - 30;
    state.backlogIntroStage = 1;
    state.backlogIntroFor = 0;
    state.backlogDialogueAdvanceHeld = false;
    state.backlogHits = 0;
    state.backlogFightStarts = 0;
    state.backlogBombs = [];
    state.backlogBombCooldown = 0;
    state.backlogRedBombCooldown = 0;
    state.backlogBombThrowIndex = 0;
    state.backlogTargetColumn = backlogTargetColumnForRound(0);
    state.backlogIntermissionStage = 0;
    state.backlogFirewallWarningFor = 0;
    state.backlogFirewallGaps = [state.width / 2];
    state.backlogMazeWallIndex = 0;
    state.backlogMazeNextWallFor = 0;
    state.backlogScanStep = 0;
    state.backlogScanNextFor = 0;
    state.backlogTiles = createBacklogTiles(state, 0, true);
    const intro = definition.breakoutQuotes?.intro[0];
    if (intro) showBossDialogue(state, intro, boss.x, boss.y, 3600);
  }
}

export function beginMiniboss(state: GameState) {
  const miniboss = ACTS[state.actIndex].miniboss;
  if (!miniboss) return;
  state.phase = "miniboss";
  state.phaseElapsed = 0;
  state.objectiveProgress = 0;
  state.spawnBudgetRemaining = 0;
  state.banner = miniboss.name;
  state.minibossDefeatFor = 0;
  state.minibossIntroStage = 1;
  state.minibossIntroFor = 4.6;
  state.backfillWallCooldown = 0;
  state.backfillWallWarningFor = 0;
  resetDropDirector(state);
  preparePlayerForPhase(state);
  clearArena(state);
  const enemy = createMiniboss(state);
  enemy.y = 34;
  state.objectiveTarget = enemy.maxHealth;
  state.enemies.push(enemy);
  showBossDialogue(state, miniboss.quotes.intro, enemy.x, enemy.y, 4.6, "normal", 17);
}

export function preparePlayerForPhase(state: GameState) {
  state.player.x = state.width / 2;
  state.player.y = state.height / 2;
  state.player.invulnerableFor = 1;
  state.player.dashFor = 0;
  configureWeaponState(state, true);
  state.player.secondaryCooldown = 0;
  if (upgradeLevel(state, "snapshot") > 0) {
    state.player.shield = Math.max(1, state.player.shield);
  }
}

export function clearArena(state: GameState) {
  state.enemies = [];
  state.projectiles = [];
  state.hazards = [];
  state.particles = [];
  state.powerupDrops = [];
  state.relayCache = null;
  state.bossDialogue = null;
  state.singularity = null;
  state.activePowerups.freezeFor = 0;
  state.backlogTiles = [];
  state.backlogBombs = [];
  state.backlogBombCooldown = 0;
  state.backlogRedBombCooldown = 0;
  state.backlogBombThrowIndex = 0;
  state.backlogFightStarts = 0;
  state.backlogTargetColumn = 3;
  state.backlogIntroStage = 0;
  state.backlogIntroFor = 0;
  state.backlogDialogueAdvanceHeld = false;
  state.backlogHits = 0;
  state.backlogIntermissionStage = 0;
  state.backlogIntermissionFor = 0;
  state.backlogFirewallWarningFor = 0;
  state.backlogFirewallDirection = 0;
  state.backlogFirewallGaps = [state.width / 2];
  state.backlogMazeWallIndex = 0;
  state.backlogMazeNextWallFor = 0;
  state.backlogScanStep = 0;
  state.backlogScanNextFor = 0;
  state.backlogRebuildAfterWall = false;
}

export function updateObjective(state: GameState, dt: number) {
  if (state.phase === "miniboss") {
    if (state.minibossDefeatFor > 0) {
      state.minibossDefeatFor = Math.max(0, state.minibossDefeatFor - dt);
      if (state.minibossDefeatFor === 0) completeEncounter(state);
      return;
    }
    const miniboss = state.enemies.find(
      (enemy) => enemy.kind === "boss" && enemy.health > 0,
    );
    if (!miniboss) completeMiniboss(state);
    else state.objectiveProgress = miniboss.maxHealth - miniboss.health;
    return;
  }
  if (state.phase === "boss") {
    const boss = state.enemies.find(
      (enemy) => enemy.kind === "boss" && enemy.health > 0,
    );
    if (!boss) completeBoss(state);
    else if (boss.bossKind === "backlog") state.objectiveProgress = state.backlogHits;
    else state.objectiveProgress = boss.maxHealth - boss.health;
    return;
  }
  if (state.phase === "endless") {
    state.objectiveProgress = state.phaseElapsed;
    return;
  }

  const encounter = getCurrentEncounter(state);
  if (!encounter) return;
  if (encounter.objective === "relay") {
    updateRelayObjective(state, encounter, dt);
  } else if (encounter.objective === "survive") {
    state.objectiveProgress += dt;
  }

  if (state.objectiveProgress >= state.objectiveTarget) {
    completeEncounter(state);
  }
}

export function updateRelayObjective(
  state: GameState,
  encounter: EncounterDefinition,
  dt: number,
) {
  if (!state.relayCache) {
    spawnRelayCache(state);
    return;
  }
  const cache = state.relayCache;
  cache.arrivalFor = Math.max(0, cache.arrivalFor - dt);
  cache.timeRemaining -= dt;
  const collected = Math.hypot(state.player.x - cache.x, state.player.y - cache.y) <=
    PLAYER_RADIUS + cache.radius;
  if (collected) {
    state.objectiveProgress += 1;
    state.relayStreak += 1;
    state.score += 35 * state.relayStreak * (state.actIndex + 1);
    burstParticles(
      state,
      cache.x,
      cache.y,
      ACTS[state.actIndex].palette.primary,
      18,
    );
    state.relayCache = null;
    if (state.objectiveProgress < state.objectiveTarget) spawnRelayCache(state);
  } else if (cache.timeRemaining <= 0) {
    state.relayStreak = 0;
    state.relayMisses += 1;
    if (state.phase === "encounter") {
      state.relayCache = null;
      spawnRelayCache(state);
    }
  }

  if (state.objectiveProgress >= state.objectiveTarget) {
    if (state.relayMisses === 0) state.score += 400 * (state.actIndex + 1);
  }
  void encounter;
}

export function spawnRelayCache(state: GameState) {
  const encounter = getCurrentEncounter(state);
  if (!encounter || encounter.objective !== "relay") return;
  const duration = (encounter.relayDuration ?? 7) * (state.mode === "hard" ? 0.85 : 1);
  const margin = 48;
  const minDistance = Math.min(state.width, state.height) * 0.35;
  const maxDistance = BASE_PLAYER_SPEED * duration * 0.78;
  let best = { x: state.width / 2, y: state.height / 2, distance: 0 };
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = margin + nextRandom(state) * Math.max(1, state.width - margin * 2);
    const y = margin + nextRandom(state) * Math.max(1, state.height - margin * 2);
    const distance = Math.hypot(x - state.player.x, y - state.player.y);
    if (distance > best.distance) best = { x, y, distance };
    if (distance >= minDistance && distance <= maxDistance) {
      best = { x, y, distance };
      break;
    }
  }
  state.relayCache = {
    x: best.x,
    y: best.y,
    radius: RELAY_RADIUS,
    duration,
    timeRemaining: duration,
    arrivalFor: 0.45,
  };
}

export function compactState(state: GameState) {
  state.projectiles = state.projectiles
    .filter(
      (projectile) =>
        projectile.life > 0 &&
        projectile.x > (isBacklogFirewallPattern(projectile.pattern) ? -600 : -80) &&
        projectile.x < state.width + (isBacklogFirewallPattern(projectile.pattern) ? 600 : 80) &&
        projectile.y > (isBacklogFirewallPattern(projectile.pattern) ? -600 : -80) &&
        projectile.y < state.height + 80,
    )
    .slice(-MAX_PROJECTILES);
  state.enemies = state.enemies
    .filter((enemy) => enemy.health > 0)
    .slice(-MAX_ENEMIES);
  state.hazards = state.hazards
    .filter((hazard) => hazard.life > 0)
    .slice(-MAX_HAZARDS);
  state.particles = state.particles
    .filter((particle) => particle.life > 0)
    .slice(-MAX_PARTICLES);
  state.powerupDrops = state.powerupDrops
    .filter((drop) => drop.life > 0)
    .slice(-24);
}

export function completeEncounter(state: GameState) {
  if (state.phase === "encounter") {
    const miniboss = ACTS[state.actIndex].miniboss;
    if (miniboss?.afterEncounterIndex === state.encounterIndex) {
      beginMiniboss(state);
      return;
    }
  } else if (state.phase !== "miniboss") return;
  const baseBonus = 300 * (state.actIndex + 1);
  const noDamageBonus = state.noDamage ? 250 * (state.actIndex + 1) : 0;
  state.score += baseBonus + noDamageBonus;
  if (upgradeLevel(state, "self-heal") > 0) {
    state.player.health = Math.min(
      state.player.maxHealth,
      state.player.health + upgradeLevel(state, "self-heal"),
    );
  }
  state.phase = "reward";
  state.banner = state.noDamage ? "Clean sweep" : "Sector secured";
  state.offeredUpgrades = offerUpgrades(state);
  clearArena(state);
  state.upgradeTargets = [];
  state.rewardRevealFor = REWARD_REVEAL_DELAY;
  state.rewardSelectionArmed = false;
  state.player.ammo = state.player.magazineSize;
}

export function completeMiniboss(state: GameState) {
  if (state.phase !== "miniboss" || state.minibossDefeatFor > 0) return;
  const definition = ACTS[state.actIndex].miniboss;
  if (!definition) return;
  const defeated = state.enemies.find(
    (enemy) => enemy.kind === "boss" && enemy.bossKind === definition.kind,
  );
  const x = defeated?.x ?? state.width / 2;
  const y = defeated?.y ?? state.height / 2;
  state.player.maxHealth += 1;
  state.player.health = state.player.maxHealth;
  state.minibossDefeatFor = 2.6;
  state.banner = "Unexpected process terminated";
  state.enemies = [];
  state.projectiles = [];
  state.hazards = [];
  state.powerupDrops = [];
  showBossDialogue(state, definition.quotes.defeat, x, y, 2.6);
}

export function createUpgradeTargets(state: GameState) {
  const radius = Math.min(state.width, state.height) * 0.24;
  const centerX = state.width / 2;
  const centerY = state.height / 2;
  return state.offeredUpgrades.map((id, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / 3);
    return {
      id,
      x: clamp(centerX + Math.cos(angle) * radius, 64, state.width - 64),
      y: clamp(
        centerY + Math.sin(angle) * radius,
        72,
        state.height - 72,
      ),
      radius: UPGRADE_TARGET_RADIUS,
      entranceFor: 0.5,
    };
  });
}

export function resolveUpgradeTargetCollisions(state: GameState) {
  if (state.rewardTransitionFor > 0) return;
  for (const projectile of state.projectiles) {
    if (!projectile.friendly || projectile.life <= 0) continue;
    const target = state.upgradeTargets.find(
      (candidate) =>
        candidate.entranceFor === 0 &&
        segmentHitsCircle(
          projectile,
          candidate,
          candidate.radius + projectile.radius,
        ),
    );
    if (!target) continue;
    applyUpgrade(state, target.id, configureWeaponState);
    state.offeredUpgrades = [target.id];
    state.upgradeTargets = [];
    state.projectiles = [];
    state.player.ammo = state.player.magazineSize;
    state.player.reloadFor = 0;
    state.rewardTransitionFor = 1;
    burstParticles(state, target.x, target.y, "#f8d477", 28);
    state.screenShake = Math.max(state.screenShake, 0.7);
    return;
  }
}

export function finishRewardSelection(state: GameState) {
  if (state.encounterIndex < ACTS[state.actIndex].encounters.length - 1) {
    state.encounterIndex += 1;
    beginEncounter(state);
  } else {
    beginBoss(state);
  }
}

export function completeBoss(state: GameState) {
  if (state.phase !== "boss") return;
  state.score += state.noDamage ? 600 * (state.actIndex + 1) : 0;
  state.phase = "actComplete";
  state.banner = `${ACTS[state.actIndex].name} secured`;
  state.player.health = Math.min(
    state.player.maxHealth,
    state.player.health + 1,
  );
  clearArena(state);
}
