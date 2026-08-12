import { ACTS, DIFFICULTIES } from "./content.ts";
import {
  backlogTargetCenter,
  resolveBacklogBombBossCollisions,
  resolveBacklogBombProjectileCollisions,
  resolveBacklogFirewallProjectileCollisions,
  resolveBacklogTileProjectileCollisions,
  updateBacklogEncounter,
} from "./engine/encounters/backlog.ts";
import {
  aimedSpread,
  burstParticles,
  createMine,
  enemyColor,
  moveEnemy,
  orbitPlayer,
  radialBurst,
  showBossDialogue,
  spawnEnemy,
  summonMinions,
} from "./engine/combat.ts";
import {
  BACKFILL_INTRO_ACTIVE_STAGE,
  BACKLOG_INTRO_ACTIVE_STAGE,
  DOCUMENT_BURST_RADIUS,
  DOCUMENT_BURST_WARNING,
  DUPLICATE_ENEMY_CHANCE,
  DUPLICATE_EXPLOSIVE_CHANCE,
  DUPLICATE_POWERUP_CHANCE,
  FROZEN_DAMAGE_MULTIPLIER,
  MAX_HAZARDS,
  PLAYER_RADIUS,
} from "./engine/config.ts";
import { damagePlayer } from "./engine/damage.ts";
import { clamp, segmentHitsCircle } from "./engine/geometry.ts";

import { updateBackfillDaemon, updateBackfillEncounter } from "./engine/encounters/backfill.ts";
import { isBacklogFirewallPattern } from "./engine/projectilePatterns.ts";
import {
  applyUpgrade,
  choosePowerupKind,
  resetDropDirector,
  spawnPowerupDrop,
  trySpawnPowerup,
  updatePowerupDrops,
  upgradeLevel,
} from "./engine/powerups.ts";
import { createSeed, nextRandom } from "./engine/random.ts";
import { getActProgress, getCurrentEncounter, getObjectiveLabel } from "./engine/selectors.ts";
import { resizeGameState } from "./engine/state.ts";
import {
  configureWeaponState,
  temporaryWeaponMagazineSize,
  updatePlayer,
} from "./engine/systems/player.ts";
import {
  beginBoss,
  beginEncounter,
  beginMiniboss,
  clearArena,
  compactState,
  createUpgradeTargets,
  finishRewardSelection,
  resetForRun,
  resolveUpgradeTargetCollisions,
  updateObjective,
} from "./engine/systems/progression.ts";
import { updatePatternDirector, updateSpawns } from "./engine/systems/spawning.ts";
export { getActProgress, getCurrentEncounter, getObjectiveLabel };
export { resizeGameState };
export const resizeArcadeState = resizeGameState;
import type {
  ArcadeCheckpoint,
  ArcadeInput,
  DifficultyMode,
  Enemy,
  EnemyKind,
  GameAction,
  GameState,
  WeaponKind,
} from "./types.ts";

interface CreateGameOptions {
  mode?: DifficultyMode;
  weapon?: WeaponKind;
  seed?: number;
  checkpoint?: ArcadeCheckpoint | null;
  phase?: GameState["phase"];
}

export type TestLevelTarget =
  | { actIndex: number; kind: "encounter"; encounterIndex: number }
  | { actIndex: number; kind: "miniboss" | "boss" };

export function createGameState(
  width: number,
  height: number,
  options: CreateGameOptions = {},
): GameState {
  const checkpoint = options.checkpoint;
  const seed = checkpoint?.seed ?? options.seed ?? createSeed();
  const maxHealth = checkpoint?.maxHealth ?? 3;
  const state: GameState = {
    width,
    height,
    seed,
    rngState: seed || 1,
    mode: checkpoint?.mode ?? options.mode ?? "normal",
    phase: options.phase ?? (checkpoint ? "encounter" : "title"),
    actIndex: checkpoint?.actIndex ?? 0,
    encounterIndex: 0,
    endlessRound: 0,
    weapon: checkpoint?.weapon ?? options.weapon ?? "blaster",
    player: {
      x: width / 2,
      y: height / 2,
      health: checkpoint?.health ?? maxHealth,
      maxHealth,
      shield: checkpoint?.shield ?? 0,
      angle: 0,
      invulnerableFor: 0,
      fireCooldown: 0,
      ammo: 14,
      magazineSize: 14,
      reloadFor: 0,
      reloadDuration: 0.85,
      secondaryCooldown: 0,
      beamFlashFor: 0,
      dashCooldown: 0,
      dashFor: 0,
      dashX: 0,
      dashY: 0,
    },
    enemies: [],
    projectiles: [],
    hazards: [],
    particles: [],
    score: checkpoint?.score ?? 0,
    comboCount: 0,
    comboMultiplier: 1,
    comboTimer: 0,
    elapsed: 0,
    phaseElapsed: 0,
    objectiveProgress: 0,
    objectiveTarget: 0,
    kills: 0,
    enemyHits: 0,
    shieldBlocks: 0,
    bossPhaseChanges: 0,
    noDamage: true,
    spawnCooldown: 0.6,
    spawnBeatIndex: 0,
    spawnBudgetRemaining: 0,
    upgrades: { ...checkpoint?.upgrades },
    offeredUpgrades: [],
    nextEnemyId: 1,
    nextProjectileId: 1,
    nextHazardId: 1,
    nextParticleId: 1,
    screenShake: 0,
    relayCache: null,
    relayStreak: 0,
    relayMisses: 0,
    upgradeTargets: [],
    rewardRevealFor: 0,
    rewardSelectionArmed: false,
    rewardTransitionFor: 0,
    powerupDrops: [],
    activePowerups: {
      reflect: 0,
      prism: 0,
      shieldFor: 0,
      shieldHits: 0,
      freezeFor: 0,
    },
    singularity: null,
    temporaryWeapon: null,
    nextPowerupId: 1,
    dropCooldown: 0,
    killsSincePowerupDrop: 0,
    powerupsDroppedThisPhase: 0,
    lastPowerupKind: null,
    powerupsCollected: 0,
    patternCooldown: 8,
    patternWarningFor: 0,
    patternSourceId: null,
    patternKind: null,
    bossDialogue: null,
    minibossDefeatFor: 0,
    minibossIntroStage: 0,
    minibossIntroFor: 0,
    minibossFightStarts: 0,
    backlogFightStarts: 0,
    bossImpactCues: 0,
    backfillWallCooldown: 0,
    backfillWallWarningFor: 0,
    backfillWallDirection: 0,
    backlogTiles: [],
    backlogBombs: [],
    backlogBombCooldown: 0,
    backlogRedBombCooldown: 0,
    backlogBombThrowIndex: 0,
    backlogTargetColumn: 3,
    backlogIntroStage: 0,
    backlogIntroFor: 0,
    backlogDialogueAdvanceHeld: false,
    backlogHits: 0,
    backlogIntermissionStage: 0,
    backlogIntermissionFor: 0,
    backlogFirewallWarningFor: 0,
    backlogFirewallDirection: 0,
    backlogFirewallGaps: [width / 2],
    backlogMazeWallIndex: 0,
    backlogMazeNextWallFor: 0,
    backlogScanStep: 0,
    backlogScanNextFor: 0,
    backlogRebuildAfterWall: false,
    banner: checkpoint ? ACTS[checkpoint.actIndex].encounters[0].name : "",
  };
  if (checkpoint || state.phase === "encounter") beginEncounter(state);
  return state;
}

// Compatibility aliases keep the pure engine convenient for existing consumers.
export const createArcadeState = createGameState;

export function createStateFromCheckpoint(
  width: number,
  height: number,
  checkpoint: ArcadeCheckpoint,
) {
  return createGameState(width, height, { checkpoint });
}

/** Starts a clean run at an authored level. Intended for local development tools. */
export function jumpToTestLevel(
  state: GameState,
  target: TestLevelTarget,
  mode: DifficultyMode = state.mode,
  weapon: WeaponKind = state.weapon,
) {
  const act = ACTS[target.actIndex];
  if (!act) throw new RangeError(`Unknown act index: ${target.actIndex}`);
  if (target.kind === "encounter" && !act.encounters[target.encounterIndex]) {
    throw new RangeError(
      `Unknown encounter index ${target.encounterIndex} for act ${target.actIndex}`,
    );
  }
  if (target.kind === "miniboss" && !act.miniboss) {
    throw new RangeError(`Act ${target.actIndex} has no miniboss`);
  }

  resetForRun(state, mode, weapon, createSeed(), createGameState);
  state.actIndex = target.actIndex;
  if (target.kind === "encounter") {
    state.encounterIndex = target.encounterIndex;
    beginEncounter(state);
  } else if (target.kind === "miniboss") {
    state.encounterIndex = act.miniboss!.afterEncounterIndex;
    beginMiniboss(state);
  } else {
    state.encounterIndex = act.encounters.length - 1;
    beginBoss(state);
  }
}

export function dispatchGameAction(state: GameState, action: GameAction) {
  switch (action.type) {
    case "start":
      resetForRun(
        state,
        action.mode,
        action.weapon,
        action.seed ?? createSeed(),
        createGameState,
      );
      beginEncounter(state);
      break;
    case "chooseUpgrade":
      if (
        state.phase !== "reward" ||
        !state.offeredUpgrades.includes(action.upgradeId)
      ) {
        return;
      }
      applyUpgrade(state, action.upgradeId, configureWeaponState);
      finishRewardSelection(state);
      break;
    case "continueAct":
      if (state.phase !== "actComplete") return;
      if (state.actIndex >= ACTS.length - 1) {
        state.phase = "victory";
        state.banner = "Library secured";
      } else {
        state.actIndex += 1;
        state.encounterIndex = 0;
        state.player.health = Math.min(
          state.player.maxHealth,
          state.player.health + DIFFICULTIES[state.mode].recoveryHealth + 1,
        );
        beginEncounter(state);
      }
      break;
    case "restartAct": {
      const checkpoint: ArcadeCheckpoint = {
        seed: state.seed,
        mode: state.mode,
        actIndex: state.actIndex,
        weapon: state.weapon,
        score: state.score,
        upgrades: { ...state.upgrades },
        maxHealth: state.player.maxHealth,
        health: state.player.maxHealth,
        shield: upgradeLevel(state, "snapshot") > 0 ? 1 : 0,
      };
      Object.assign(
        state,
        createStateFromCheckpoint(state.width, state.height, checkpoint),
      );
      break;
    }
    case "startEndless":
      resetForRun(state, state.mode, state.weapon, createSeed(), createGameState);
      state.phase = "endless";
      state.endlessRound = 1;
      state.objectiveTarget = 90;
      state.banner = "Endless maintenance";
      state.spawnBudgetRemaining = 32;
      state.spawnCooldown = 0.5;
      resetDropDirector(state);
      break;
    case "returnToTitle":
      state.phase = "title";
      clearArena(state);
      state.banner = "";
      break;
  }
}

export function stepGame(
  state: GameState,
  input: ArcadeInput,
  delta: number,
  randomOverride?: () => number,
) {
  if (
    state.phase !== "encounter" &&
    state.phase !== "reward" &&
    state.phase !== "miniboss" &&
    state.phase !== "boss" &&
    state.phase !== "endless"
  ) {
    return;
  }

  const dt = Math.min(delta, 1 / 20);
  const random = randomOverride ?? (() => nextRandom(state));
  state.elapsed += dt;
  state.phaseElapsed += dt;
  state.screenShake = Math.max(0, state.screenShake - dt * 2.8);
  updateTimers(state, dt);
  if (state.phase === "reward" && !input.firing) {
    state.rewardSelectionArmed = true;
  }
  const stagingBacklog = state.phase === "boss" &&
    ACTS[state.actIndex].boss.kind === "backlog" &&
    state.backlogIntroStage < BACKLOG_INTRO_ACTIVE_STAGE;
  const playerInput = stagingBacklog
    ? {
      ...input,
      movement: { x: 0, y: 0 },
      firing: false,
      secondary: false,
      reload: false,
      dash: false,
    }
    : state.phase === "reward" &&
        (state.rewardRevealFor > 0 || !state.rewardSelectionArmed)
    ? { ...input, firing: false }
    : input;
  updatePlayer(state, playerInput, dt, destroyEnemy);
  if (state.phase === "reward") {
    if (state.rewardRevealFor > 0) {
      state.rewardRevealFor = Math.max(0, state.rewardRevealFor - dt);
      state.projectiles = [];
      if (state.rewardRevealFor === 0) {
        state.upgradeTargets = createUpgradeTargets(state);
        state.player.ammo = state.player.magazineSize;
        state.player.reloadFor = 0;
      }
    }
    if (state.rewardTransitionFor > 0) {
      state.rewardTransitionFor = Math.max(0, state.rewardTransitionFor - dt);
      if (state.rewardTransitionFor === 0) {
        finishRewardSelection(state);
        return;
      }
    }
    updateProjectiles(state, dt);
    resolveUpgradeTargetCollisions(state);
    updateParticles(state, dt);
    compactState(state);
    return;
  }
  for (const enemy of state.enemies) {
    enemy.previousX = enemy.x;
    enemy.previousY = enemy.y;
  }
  updateBackfillEncounter(state, dt, random);
  updateBacklogEncounter(state, dt, input, random);
  updateSpawns(state, dt, random);
  const frozen = state.activePowerups.freezeFor > 0;
  if (!frozen) updatePatternDirector(state, dt);
  updateProjectiles(state, dt, frozen);
  if (!frozen) updateEnemies(state, dt, random);
  resolveBacklogBombBossCollisions(state);
  updateSingularity(state, dt, random);
  updateHazards(state, dt);
  resolveBacklogBombProjectileCollisions(state);
  resolveBacklogFirewallProjectileCollisions(state);
  resolveBacklogTileProjectileCollisions(state);
  resolveProjectileCollisions(state, random);
  resolvePlayerCollisions(state);
  updateParticles(state, dt);
  updateObjective(state, dt);
  updatePowerupDrops(state, dt);
  compactState(state);
}

export const stepArcade = stepGame;

function updateTimers(state: GameState, dt: number) {
  state.player.invulnerableFor = Math.max(0, state.player.invulnerableFor - dt);
  state.player.fireCooldown = Math.max(0, state.player.fireCooldown - dt);
  if (state.player.reloadFor > 0) {
    state.player.reloadFor = Math.max(0, state.player.reloadFor - dt);
    if (state.player.reloadFor === 0) {
      if (state.temporaryWeapon) {
        state.temporaryWeapon.ammo = temporaryWeaponMagazineSize(
          state.temporaryWeapon.kind,
        );
      } else {
        state.player.ammo = state.player.magazineSize;
      }
    }
  }
  state.player.secondaryCooldown = Math.max(
    0,
    state.player.secondaryCooldown - dt,
  );
  state.activePowerups.freezeFor = Math.max(0, state.activePowerups.freezeFor - dt);
  state.player.beamFlashFor = Math.max(0, state.player.beamFlashFor - dt);
  state.player.dashCooldown = Math.max(0, state.player.dashCooldown - dt);
  state.player.dashFor = Math.max(0, state.player.dashFor - dt);
  state.dropCooldown = Math.max(0, state.dropCooldown - dt);
  if (state.bossDialogue) {
    state.bossDialogue.life = Math.max(0, state.bossDialogue.life - dt);
    if (state.bossDialogue.life === 0) state.bossDialogue = null;
  }
  for (const target of state.upgradeTargets) {
    target.entranceFor = Math.max(0, target.entranceFor - dt);
  }
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.comboTimer === 0) {
    state.comboCount = 0;
    state.comboMultiplier = 1;
  }
}

function updateProjectiles(state: GameState, dt: number, freezeHostile = false) {
  for (const projectile of state.projectiles) {
    projectile.previousX = projectile.x;
    projectile.previousY = projectile.y;
    if ((projectile.warningFor ?? 0) > 0) {
      projectile.warningFor = Math.max(0, (projectile.warningFor ?? 0) - dt);
      continue;
    }
    if (freezeHostile && !projectile.friendly) continue;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    if (projectile.friendly && projectile.bouncesRemaining > 0) {
      let bounced = false;
      if (
        projectile.x <= projectile.radius ||
        projectile.x >= state.width - projectile.radius
      ) {
        projectile.x = clamp(
          projectile.x,
          projectile.radius,
          state.width - projectile.radius,
        );
        projectile.vx *= -1;
        bounced = true;
      }
      if (
        projectile.y <= projectile.radius ||
        projectile.y >= state.height - projectile.radius
      ) {
        projectile.y = clamp(
          projectile.y,
          projectile.radius,
          state.height - projectile.radius,
        );
        projectile.vy *= -1;
        bounced = true;
      }
      if (bounced) {
        projectile.bouncesRemaining -= 1;
        burstParticles(state, projectile.x, projectile.y, "#70dff2", 5);
      }
    }
    projectile.life -= dt;
  }
}

function updateEnemies(state: GameState, dt: number, random: () => number) {
  for (const enemy of state.enemies) {
    if (enemy.health <= 0) continue;
    enemy.behaviorCooldown -= dt;
    enemy.warningFor = Math.max(0, enemy.warningFor - dt);
    enemy.dashFor = Math.max(0, enemy.dashFor - dt);
    if (enemy.kind === "boss") {
      updateBoss(state, enemy, dt, random);
      continue;
    }

    const dx = state.player.x - enemy.x;
    const dy = state.player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const towardX = dx / distance;
    const towardY = dy / distance;
    enemy.aimAngle = Math.atan2(dy, dx);
    const supportBoost = state.enemies.some(
        (candidate) =>
          candidate.kind === "support" &&
          candidate.id !== enemy.id &&
          Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) < 145,
      )
      ? 1.2
      : 1;

    if (enemy.kind === "malicious") {
      orbitPlayer(enemy, towardX, towardY, distance, dt, supportBoost);
      updateShooter(state, enemy, random);
    } else if (enemy.kind === "corruptor") {
      orbitPlayer(enemy, towardX, towardY, distance, dt, supportBoost * 0.82);
      if (enemy.behaviorCooldown <= 0 && state.hazards.length < MAX_HAZARDS) {
        state.hazards.push(createMine(state, enemy.x, enemy.y));
        enemy.behaviorCooldown = 2.8 + random() * 1.1;
        enemy.warningFor = 0.32;
      }
    } else if (enemy.kind === "buffering") {
      if (enemy.dashFor > 0) {
        enemy.x += enemy.dashX * enemy.speed * 4.4 * dt;
        enemy.y += enemy.dashY * enemy.speed * 4.4 * dt;
      } else if (enemy.warningFor > 0) {
        // Hold position while the bright lane telegraphs the dash.
      } else if (enemy.phase === 1) {
        enemy.dashFor = 0.34;
        enemy.phase = 0;
      } else if (enemy.behaviorCooldown <= 0) {
        enemy.warningFor = 0.52 * DIFFICULTIES[state.mode].warningMultiplier;
        enemy.behaviorCooldown = 2.6 + random() * 0.7;
        enemy.dashX = towardX;
        enemy.dashY = towardY;
        enemy.phase = 1;
      } else {
        moveEnemy(enemy, towardX, towardY, dt, supportBoost * 0.65);
      }
    } else if (enemy.kind === "support") {
      const radial = distance > 250 ? 1 : distance < 175 ? -1 : 0;
      enemy.x += (towardX * radial - towardY * enemy.orbitDirection) * enemy.speed * dt;
      enemy.y += (towardY * radial + towardX * enemy.orbitDirection) * enemy.speed * dt;
    } else {
      moveEnemy(enemy, towardX, towardY, dt, supportBoost);
    }

    enemy.x = clamp(
      enemy.x,
      -enemy.radius * 1.5,
      state.width + enemy.radius * 1.5,
    );
    enemy.y = clamp(
      enemy.y,
      -enemy.radius * 1.5,
      state.height + enemy.radius * 1.5,
    );
  }
}

function updateSingularity(state: GameState, dt: number, random: () => number) {
  const singularity = state.singularity;
  if (!singularity) return;

  singularity.life -= dt;
  for (const enemy of state.enemies) {
    if (enemy.health <= 0) continue;
    if (
      enemy.bossKind === "backfill-daemon" &&
      state.phase === "miniboss" &&
      state.minibossIntroStage < BACKFILL_INTRO_ACTIVE_STAGE
    ) {
      continue;
    }
    if (enemy.bossKind === "backlog" && state.phase === "boss") continue;
    const dx = singularity.x - enemy.x;
    const dy = singularity.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const resistance = enemy.kind === "boss" ? 0.16 : enemy.elite ? 0.55 : 1;
    const pull = 310 * resistance * Math.min(1, 190 / distance);
    enemy.x += (dx / distance) * pull * dt;
    enemy.y += (dy / distance) * pull * dt;
    enemy.health -= (enemy.kind === "boss" ? 0.6 : 1.8) * dt;
    if (enemy.health <= 0) destroyEnemy(state, enemy, random);
  }

  for (const projectile of state.projectiles) {
    if (
      projectile.friendly ||
      projectile.life <= 0 ||
      projectile.pattern === "backfill-wall" ||
      isBacklogFirewallPattern(projectile.pattern)
    ) {
      continue;
    }
    const dx = singularity.x - projectile.x;
    const dy = singularity.y - projectile.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance <= singularity.radius) {
      projectile.life = -1;
      continue;
    }
    const acceleration = 680 * Math.min(1, 220 / distance);
    projectile.vx += (dx / distance) * acceleration * dt;
    projectile.vy += (dy / distance) * acceleration * dt;
  }

  if (singularity.life > 0) return;
  const collapseRadius = 115;
  for (const enemy of state.enemies) {
    if (
      enemy.health <= 0 ||
      Math.hypot(enemy.x - singularity.x, enemy.y - singularity.y) > collapseRadius
    ) {
      continue;
    }
    enemy.health -= enemy.kind === "boss" ? 3 : 7;
    if (enemy.health <= 0) destroyEnemy(state, enemy, random);
  }
  for (const projectile of state.projectiles) {
    if (
      !projectile.friendly &&
      projectile.pattern !== "backfill-wall" &&
      !isBacklogFirewallPattern(projectile.pattern) &&
      Math.hypot(projectile.x - singularity.x, projectile.y - singularity.y) <= collapseRadius
    ) {
      projectile.life = -1;
    }
  }
  burstParticles(state, singularity.x, singularity.y, "#b687ff", 42);
  state.screenShake = Math.max(state.screenShake, 0.55);
  state.singularity = null;
}

function updateBoss(
  state: GameState,
  enemy: Enemy,
  dt: number,
  random: () => number,
) {
  if (enemy.bossKind === "backlog" && state.phase === "boss") {
    const introducing = state.backlogIntroStage < BACKLOG_INTRO_ACTIVE_STAGE;
    const targetX = introducing && state.backlogIntroStage < 4
      ? state.width / 2
      : backlogTargetCenter(state);
    const targetY = introducing && state.backlogIntroStage < 4 ? state.height / 2 : 62;
    enemy.x += (targetX - enemy.x) * Math.min(1, dt * 4.5);
    enemy.y += (targetY - enemy.y) * Math.min(1, dt * 4.5);
    if (state.bossDialogue && introducing) {
      state.bossDialogue.x = enemy.x;
      state.bossDialogue.y = enemy.y;
    }
    enemy.phase = Math.min(3, 1 + Math.floor(state.backlogHits / 2));
    return;
  }
  if (
    enemy.bossKind === "backfill-daemon" &&
    state.phase === "miniboss" &&
    state.minibossIntroStage < BACKFILL_INTRO_ACTIVE_STAGE
  ) {
    return;
  }
  const previousPhase = enemy.phase;
  const ratio = enemy.health / enemy.maxHealth;
  enemy.phase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
  if (state.bossDialogue && enemy.bossKind === "backfill-daemon") {
    state.bossDialogue.x = enemy.x;
    state.bossDialogue.y = enemy.y;
  }
  if (enemy.phase !== previousPhase) {
    state.bossPhaseChanges += 1;
    state.banner = `Phase ${enemy.phase}`;
    state.screenShake = 0.7;
    enemy.behaviorCooldown = 1.1;
    enemy.warningFor = 0.8;
    enemy.bossAttackStep = 0;
    enemy.bossAttackPending = undefined;
    radialBurst(state, enemy, 6 + enemy.phase * 2, 160 + enemy.phase * 22);
    if (enemy.bossKind === "backfill-daemon") {
      state.backfillWallCooldown = enemy.phase === 2 ? 4.5 : 3;
      const quotes = ACTS[state.actIndex].miniboss?.quotes;
      const quote = enemy.phase === 2 ? quotes?.phaseTwo : quotes?.phaseThree;
      if (quote) showBossDialogue(state, quote, enemy.x, enemy.y, 3.4);
    }
  }

  const dx = state.player.x - enemy.x;
  const dy = state.player.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  const tx = dx / distance;
  const ty = dy / distance;
  enemy.aimAngle = Math.atan2(dy, dx);

  if (enemy.bossKind === "backfill-daemon") {
    updateBackfillDaemon(state, enemy, dt, random, tx, ty, distance);
  } else if (enemy.bossKind === "hydra") {
    orbitPlayer(enemy, tx, ty, distance, dt, 0.75);
    if (enemy.behaviorCooldown <= 0) {
      enemy.warningFor = 0.58 * DIFFICULTIES[state.mode].warningMultiplier;
      radialBurst(state, enemy, 7 + enemy.phase * 3, 155 + enemy.phase * 25);
      summonMinions(state, "duplicate", Math.min(2, enemy.phase), random);
      enemy.behaviorCooldown = enemy.phase === 1 ? 1.45 : enemy.phase === 2 ? 1.25 : 1.05;
    }
  } else {
    orbitPlayer(enemy, tx, ty, distance, dt, 0.9);
    if (enemy.behaviorCooldown <= 0) {
      enemy.warningFor = 0.44 * DIFFICULTIES[state.mode].warningMultiplier;
      aimedSpread(state, enemy, enemy.phase + 2, 0.12, 225 + enemy.phase * 20);
      if (enemy.phase >= 2 && state.hazards.length < MAX_HAZARDS) {
        state.hazards.push(
          createMine(
            state,
            clamp(
              state.player.x + (random() - 0.5) * 150,
              50,
              state.width - 50,
            ),
            clamp(
              state.player.y + (random() - 0.5) * 150,
              50,
              state.height - 50,
            ),
          ),
        );
      }
      if (enemy.phase === 3) summonMinions(state, "support", 1, random);
      enemy.behaviorCooldown = enemy.phase === 1 ? 1.1 : enemy.phase === 2 ? 0.9 : 0.72;
    }
  }
  enemy.x = clamp(enemy.x, enemy.radius, state.width - enemy.radius);
  enemy.y = clamp(enemy.y, enemy.radius, state.height - enemy.radius);
}

function updateShooter(state: GameState, enemy: Enemy, random: () => number) {
  if (enemy.behaviorCooldown > 0) {
    if (
      enemy.behaviorCooldown <
        0.46 * DIFFICULTIES[state.mode].warningMultiplier
    ) {
      enemy.warningFor = Math.max(enemy.warningFor, enemy.behaviorCooldown);
    }
    return;
  }
  aimedSpread(state, enemy, state.mode === "hard" ? 2 : 1, 0.13, 215);
  enemy.behaviorCooldown = 1.65 + random() * 0.55;
}

function updateHazards(state: GameState, dt: number) {
  for (const hazard of state.hazards) {
    hazard.life -= dt;
    hazard.armFor = Math.max(0, hazard.armFor - dt);
    if (hazard.kind === "corruption") {
      hazard.radius = Math.min(74, hazard.radius + dt * 12);
    }
  }
}

function resolveProjectileCollisions(state: GameState, random: () => number) {
  for (const projectile of state.projectiles) {
    if (projectile.life <= 0 || !projectile.friendly) continue;
    for (const enemy of state.enemies) {
      if (
        enemy.health <= 0 ||
        projectile.hitIds.includes(enemy.id) ||
        !segmentHitsCircle(projectile, enemy, enemy.radius + projectile.radius)
      ) {
        continue;
      }
      if (
        enemy.bossKind === "backfill-daemon" &&
        state.phase === "miniboss" &&
        state.minibossIntroStage < BACKFILL_INTRO_ACTIVE_STAGE
      ) {
        continue;
      }
      if (enemy.bossKind === "backlog" && state.phase === "boss") {
        continue;
      }
      projectile.hitIds.push(enemy.id);
      const damage = state.activePowerups.freezeFor > 0
        ? projectile.damage * FROZEN_DAMAGE_MULTIPLIER
        : projectile.damage;
      enemy.health -= damage;
      state.enemyHits += 1;
      burstParticles(
        state,
        projectile.x,
        projectile.y,
        state.activePowerups.freezeFor > 0 ? "#b9f4ff" : enemyColor(enemy),
        state.activePowerups.freezeFor > 0 ? 7 : 3,
      );
      if (enemy.health <= 0) destroyEnemy(state, enemy, random);
      if (projectile.pierce <= 0) {
        projectile.life = -1;
        break;
      }
      projectile.pierce -= 1;
    }
  }

  if (state.player.invulnerableFor > 0) return;
  const hostile = state.projectiles.find(
    (projectile) =>
      projectile.life > 0 &&
      !projectile.friendly &&
      (projectile.warningFor ?? 0) <= 0 &&
      segmentHitsCircle(
        projectile,
        state.player,
        PLAYER_RADIUS + projectile.radius,
      ),
  );
  if (hostile) {
    hostile.life = -1;
    damagePlayer(state, 1, "Hostile traffic breached the archive.");
  }
}

function resolvePlayerCollisions(state: GameState) {
  if (state.player.invulnerableFor > 0) return;
  const enemy = state.enemies.find(
    (candidate) =>
      candidate.health > 0 &&
      Math.hypot(candidate.x - state.player.x, candidate.y - state.player.y) <=
        candidate.radius + PLAYER_RADIUS,
  );
  if (enemy) {
    if (enemy.kind !== "boss") enemy.health = 0;
    damagePlayer(state, enemy.damage, "The library was overrun.");
    return;
  }

  const hazard = state.hazards.find(
    (candidate) =>
      candidate.life > 0 &&
      candidate.armFor === 0 &&
      Math.hypot(candidate.x - state.player.x, candidate.y - state.player.y) <=
        candidate.radius + PLAYER_RADIUS,
  );
  if (hazard) {
    hazard.life = -1;
    damagePlayer(
      state,
      hazard.damage,
      "Corrupt sectors overwhelmed the scanner.",
    );
  }
}

function updateParticles(state: GameState, dt: number) {
  for (const particle of state.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.96;
    particle.vy *= 0.96;
    particle.life -= dt;
  }
}

function destroyEnemy(state: GameState, enemy: Enemy, random: () => number) {
  state.kills += 1;
  state.comboCount = state.comboTimer > 0 ? state.comboCount + 1 : 1;
  state.comboMultiplier = Math.min(6, 1 + Math.floor(state.comboCount / 4));
  state.comboTimer = 2.35 * (1 + upgradeLevel(state, "combo-cache") * 0.35);
  const scoreBoost = 1 + upgradeLevel(state, "compression") * 0.15;
  state.score += Math.round(enemy.points * state.comboMultiplier * scoreBoost);
  if (
    state.phase === "encounter" &&
    getCurrentEncounter(state)?.objective === "purge"
  ) {
    state.objectiveProgress += enemy.kind === "boss" ? 10 : 1;
  }
  if (upgradeLevel(state, "garbage-collector") > 0 && state.kills % 10 === 0) {
    state.player.health = Math.min(
      state.player.maxHealth,
      state.player.health + 1,
    );
  }
  burstParticles(
    state,
    enemy.x,
    enemy.y,
    enemyColor(enemy),
    enemy.kind === "boss" ? 32 : 8,
  );
  state.screenShake = Math.max(
    state.screenShake,
    enemy.kind === "boss" ? 1 : 0.18,
  );
  if (enemy.kind === "file" && state.hazards.length < MAX_HAZARDS) {
    state.hazards.push({
      id: state.nextHazardId++,
      kind: "document-burst",
      x: enemy.x,
      y: enemy.y,
      radius: DOCUMENT_BURST_RADIUS,
      life: DOCUMENT_BURST_WARNING + 0.22,
      armFor: DOCUMENT_BURST_WARNING,
      damage: 1,
    });
  }
  if (enemy.kind !== "boss") trySpawnPowerup(state, enemy, random);

  if (enemy.kind === "duplicate" && enemy.splitGeneration < 1) {
    resolveDuplicateDrop(state, enemy, random);
  }
}

function resolveDuplicateDrop(
  state: GameState,
  enemy: Enemy,
  random: () => number,
) {
  const roll = random();
  if (roll < DUPLICATE_EXPLOSIVE_CHANCE) {
    spawnDuplicateChildren(state, enemy, ["file", "file"], random);
    return;
  }
  if (roll < DUPLICATE_EXPLOSIVE_CHANCE + DUPLICATE_ENEMY_CHANCE) {
    const pool = duplicateEnemyPool(state.actIndex);
    const kind = pool[Math.floor(random() * pool.length)];
    spawnDuplicateChildren(state, enemy, [kind, kind], random);
    return;
  }

  const wantsPowerup = roll <
    DUPLICATE_EXPLOSIVE_CHANCE +
      DUPLICATE_ENEMY_CHANCE +
      DUPLICATE_POWERUP_CHANCE;
  const kind = wantsPowerup || state.player.health >= state.player.maxHealth
    ? choosePowerupKind(state, random)
    : "repair";
  if (!spawnPowerupDrop(state, kind, enemy.x, enemy.y)) {
    spawnDuplicateChildren(state, enemy, ["file", "file"], random);
  }
}

function duplicateEnemyPool(actIndex: number): EnemyKind[] {
  if (actIndex === 0) {
    return ["file", "media", "library", "malicious", "buffering"];
  }
  if (actIndex === 1) {
    return ["file", "media", "malicious", "corruptor", "buffering"];
  }
  return ["media", "malicious", "corruptor", "buffering", "support"];
}

function spawnDuplicateChildren(
  state: GameState,
  enemy: Enemy,
  kinds: [EnemyKind, EnemyKind],
  random: () => number,
) {
  for (const [index, direction] of [-1, 1].entries()) {
    const child = spawnEnemy(state, kinds[index], random, 0.78, false);
    child.x = enemy.x + direction * 9;
    child.y = enemy.y;
    child.splitGeneration = 1;
    state.enemies.push(child);
  }
}
