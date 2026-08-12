import { ACTS, DIFFICULTIES } from "../../content.ts";
import type { Enemy, GameState } from "../../types.ts";
import {
  aimedSpread,
  gappedRadialBurst,
  orbitPlayer,
  radialBurst,
  showBossDialogue,
  summonMinions,
} from "../combat.ts";
import { BACKFILL_INTRO_ACTIVE_STAGE, MAX_PROJECTILES } from "../config.ts";

const BACKFILL_RADIAL_ATTACK = 0;
const BACKFILL_PATTERN_ATTACK = 1;
const BACKFILL_AIMED_ATTACK = 2;
const BACKFILL_SUMMON_ATTACK = 3;
const BACKFILL_SUMMON_CAP = 3;
const BACKFILL_WALL_SPEED = 72;

export function updateBackfillEncounter(
  state: GameState,
  dt: number,
  random: () => number,
) {
  if (state.phase !== "miniboss") return;
  const miniboss = state.enemies.find(
    (enemy) => enemy.bossKind === "backfill-daemon" && enemy.health > 0,
  );
  const quotes = ACTS[state.actIndex].miniboss?.quotes;
  if (!miniboss || !quotes) return;

  if (state.minibossIntroStage < BACKFILL_INTRO_ACTIVE_STAGE) {
    miniboss.x = state.width / 2;
    if (state.minibossIntroStage === 1) {
      miniboss.y = Math.min(78, miniboss.y + 20 * dt);
    }
    if (state.bossDialogue) {
      state.bossDialogue.x = miniboss.x;
      state.bossDialogue.y = miniboss.y;
    }
    state.minibossIntroFor = Math.max(0, state.minibossIntroFor - dt);
    if (state.minibossIntroFor > 0) return;

    if (state.minibossIntroStage === 1) {
      state.minibossIntroStage = 2;
      state.minibossIntroFor = 0.75;
      showBossDialogue(state, `${quotes.intro}.`, miniboss.x, miniboss.y, 0.75);
      return;
    }
    if (state.minibossIntroStage === 2) {
      state.minibossIntroStage = 3;
      state.minibossIntroFor = 0.75;
      showBossDialogue(state, `${quotes.intro}..`, miniboss.x, miniboss.y, 0.75);
      return;
    }
    if (state.minibossIntroStage === 3) {
      state.minibossIntroStage = 4;
      state.minibossIntroFor = 1.15;
      showBossDialogue(state, `${quotes.intro}...`, miniboss.x, miniboss.y, 1.15);
      return;
    }
    if (state.minibossIntroStage === 4) {
      state.minibossIntroStage = 5;
      state.minibossIntroFor = 1.45;
      state.bossImpactCues += 1;
      state.screenShake = Math.max(state.screenShake, 0.8);
      showBossDialogue(state, quotes.introNever, miniboss.x, miniboss.y, 1.45, "danger");
      return;
    }
    if (state.minibossIntroStage === 5) {
      state.minibossIntroStage = 6;
      state.minibossIntroFor = 3.15;
      spawnBackfillWall(state, 0);
      return;
    }
    if (state.minibossIntroStage === 6) {
      state.minibossIntroStage = 7;
      state.minibossIntroFor = 2.3;
      showBossDialogue(state, quotes.introReaction, miniboss.x, miniboss.y, 2.3);
      return;
    }

    state.minibossIntroStage = BACKFILL_INTRO_ACTIVE_STAGE;
    state.minibossFightStarts += 1;
    state.backfillWallCooldown = 6.5;
    state.phaseElapsed = 0;
    miniboss.behaviorCooldown = 0.8;
    state.banner = ACTS[state.actIndex].miniboss?.name ?? state.banner;
    return;
  }

  if (miniboss.phase < 2 || state.minibossDefeatFor > 0) return;
  if (state.backfillWallWarningFor > 0) {
    const previousWarning = state.backfillWallWarningFor;
    state.backfillWallWarningFor = Math.max(0, previousWarning - dt);
    if (state.backfillWallWarningFor === 0) {
      spawnBackfillWall(state, state.backfillWallDirection);
      state.backfillWallCooldown = miniboss.phase === 3 ? 8 : 10.5;
    }
    return;
  }

  state.backfillWallCooldown = Math.max(0, state.backfillWallCooldown - dt);
  if (state.backfillWallCooldown > 0) return;
  state.backfillWallDirection = chooseBackfillWallDirection(state, random);
  state.backfillWallWarningFor = 1.4 * DIFFICULTIES[state.mode].warningMultiplier;
  miniboss.behaviorCooldown = Math.max(miniboss.behaviorCooldown, 0.8);
  showBossDialogue(state, quotes.wallAttack, miniboss.x, miniboss.y, 1.6, "danger");
}

function chooseBackfillWallDirection(state: GameState, random: () => number) {
  let direction = Math.floor(random() * 4);
  const distanceToEdge = direction === 0
    ? state.player.y
    : direction === 1
    ? state.width - state.player.x
    : direction === 2
    ? state.height - state.player.y
    : state.player.x;
  if (distanceToEdge < 120) direction = (direction + 2) % 4;
  return direction;
}

function spawnBackfillWall(state: GameState, direction: number) {
  const vertical = direction === 1 || direction === 3;
  const span = vertical ? state.height : state.width;
  const radius = 9;
  const spacing = 15;
  const velocityX = direction === 1
    ? -BACKFILL_WALL_SPEED
    : direction === 3
    ? BACKFILL_WALL_SPEED
    : 0;
  const velocityY = direction === 0
    ? BACKFILL_WALL_SPEED
    : direction === 2
    ? -BACKFILL_WALL_SPEED
    : 0;
  const originX = direction === 1 ? state.width + radius : direction === 3 ? -radius : 0;
  const originY = direction === 0 ? -radius : direction === 2 ? state.height + radius : 0;
  const life = ((vertical ? state.width : state.height) + radius * 4) / BACKFILL_WALL_SPEED;

  for (let offset = -radius; offset <= span + radius; offset += spacing) {
    if (state.projectiles.length >= MAX_PROJECTILES) break;
    const x = vertical ? originX : offset;
    const y = vertical ? offset : originY;
    state.projectiles.push({
      id: state.nextProjectileId++,
      x,
      y,
      previousX: x,
      previousY: y,
      vx: velocityX * DIFFICULTIES[state.mode].projectileSpeedMultiplier,
      vy: velocityY * DIFFICULTIES[state.mode].projectileSpeedMultiplier,
      radius,
      damage: 1,
      pierce: 0,
      life,
      friendly: false,
      hitIds: [],
      bouncesRemaining: 0,
      reflected: false,
      pattern: "backfill-wall",
    });
  }
}

export function updateBackfillDaemon(
  state: GameState,
  enemy: Enemy,
  dt: number,
  random: () => number,
  towardX: number,
  towardY: number,
  distance: number,
) {
  orbitPlayer(enemy, towardX, towardY, distance, dt, 0.82);
  if (enemy.behaviorCooldown > 0) return;

  if (enemy.bossAttackPending !== undefined) {
    executeBackfillAttack(state, enemy, enemy.bossAttackPending, random);
    enemy.bossAttackPending = undefined;
    enemy.bossAttackStep = (enemy.bossAttackStep ?? 0) + 1;
    enemy.behaviorCooldown = enemy.phase === 1 ? 1.2 : enemy.phase === 2 ? 1.08 : 0.96;
    return;
  }

  const rotations = enemy.phase === 1
    ? [BACKFILL_RADIAL_ATTACK, BACKFILL_PATTERN_ATTACK, BACKFILL_AIMED_ATTACK]
    : enemy.phase === 2
    ? [
      BACKFILL_RADIAL_ATTACK,
      BACKFILL_PATTERN_ATTACK,
      BACKFILL_SUMMON_ATTACK,
      BACKFILL_AIMED_ATTACK,
    ]
    : [
      BACKFILL_PATTERN_ATTACK,
      BACKFILL_AIMED_ATTACK,
      BACKFILL_SUMMON_ATTACK,
      BACKFILL_RADIAL_ATTACK,
    ];
  const attack = rotations[(enemy.bossAttackStep ?? 0) % rotations.length];
  const warning = (attack === BACKFILL_SUMMON_ATTACK ? 0.9 : 0.58) *
    DIFFICULTIES[state.mode].warningMultiplier;
  enemy.bossAttackPending = attack;
  enemy.warningFor = warning;
  enemy.behaviorCooldown = warning;

  if (attack === BACKFILL_SUMMON_ATTACK) {
    const quotes = ACTS[state.actIndex].miniboss?.quotes.summon;
    const quote = quotes?.[enemy.phase === 3 ? 1 : 0];
    if (quote) showBossDialogue(state, quote, enemy.x, enemy.y, 2.8);
  }
}

function executeBackfillAttack(
  state: GameState,
  enemy: Enemy,
  attack: number,
  random: () => number,
) {
  if (attack === BACKFILL_PATTERN_ATTACK) {
    gappedRadialBurst(
      state,
      enemy,
      13 + enemy.phase * 2,
      165 + enemy.phase * 18,
      enemy.phase === 3 ? 0.48 : 0.62,
    );
    return;
  }
  if (attack === BACKFILL_AIMED_ATTACK) {
    aimedSpread(state, enemy, 2 + enemy.phase, 0.16, 205 + enemy.phase * 12);
    return;
  }
  if (attack === BACKFILL_SUMMON_ATTACK) {
    const livingAdds = state.enemies.filter(
      (candidate) => candidate.kind !== "boss" && candidate.health > 0,
    ).length;
    summonMinions(
      state,
      "file",
      Math.min(2, Math.max(0, BACKFILL_SUMMON_CAP - livingAdds)),
      random,
    );
    return;
  }
  radialBurst(state, enemy, 5 + enemy.phase * 2, 155 + enemy.phase * 22);
}
