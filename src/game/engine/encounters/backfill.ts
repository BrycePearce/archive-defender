import { ACTS, DIFFICULTIES } from "../../content.ts";
import type { ArcadeInput, Enemy, GameState } from "../../types.ts";
import {
  aimedSpread,
  gappedRadialBurst,
  orbitPlayer,
  radialBurst,
  showBossDialogue,
  summonMinions,
} from "../combat.ts";
import { BACKFILL_INTRO_ACTIVE_STAGE, MAX_PROJECTILES } from "../config.ts";

const BACKFILL_PATTERN_ATTACK = 1;
const BACKFILL_AIMED_ATTACK = 2;
const BACKFILL_SUMMON_ATTACK = 3;
const BACKFILL_SUMMON_CAP = 3;
const BACKFILL_WALL_SPEED = 220;
const BACKFILL_DOUBLE_ATTACK = 4;
const BACKFILL_SHIFT_ATTACK = 5;
const BACKFILL_COVER_ATTACK = 6;

export function resolveBackfillWall(state: GameState) {
  state.backfillWallResolved = true;
  if (state.minibossIntroStage === 6) {
    state.minibossIntroStage = 7;
    const boss = state.enemies.find((enemy) => enemy.bossKind === "backfill-daemon");
    const quote = ACTS[state.actIndex].miniboss?.quotes.introReaction;
    state.minibossIntroFor = (quote?.length ?? 0) / 38 + 2;
    if (boss && quote) {
      showBossDialogue(state, quote, boss.x, boss.y, state.minibossIntroFor, "normal", 38);
    }
  } else {
    state.backfillWallCompleted = true;
    state.backfillShielded = false;
    state.backfillWallCooldown = 999;
  }
}

export function updateBackfillEncounter(
  state: GameState,
  dt: number,
  input: ArcadeInput,
  random: () => number,
) {
  if (state.phase !== "miniboss") return;
  const miniboss = state.enemies.find((enemy) =>
    enemy.bossKind === "backfill-daemon" && enemy.health > 0
  );
  const quotes = ACTS[state.actIndex].miniboss?.quotes;
  if (!miniboss || !quotes) return;
  const advance = (input.firing && !state.backfillDialogueAdvanceHeld) ||
    (input.secondary && !state.backfillDialogueSecondaryHeld);
  state.backfillDialogueAdvanceHeld = input.firing;
  state.backfillDialogueSecondaryHeld = input.secondary;

  if (state.backfillWallActive) {
    const wall = state.projectiles.find((shot) =>
      shot.pattern === "backfill-wall" && shot.life > 0
    );
    const passed = wall &&
      (state.backfillWallDirection === 0
        ? state.player.y < wall.y - 23
        : state.backfillWallDirection === 1
        ? state.player.x > wall.x + 23
        : state.backfillWallDirection === 2
        ? state.player.y > wall.y + 23
        : state.player.x < wall.x - 23);
    if ((!wall || passed) && !state.backfillWallResolved) resolveBackfillWall(state);
    if (!wall) {
      state.backfillWallActive = false;
      miniboss.behaviorCooldown = 0.9;
      miniboss.bossAttackPending = undefined;
      miniboss.warningFor = 0;
    }
    if (state.minibossIntroStage !== 7) return;
  }

  if (state.minibossIntroStage < BACKFILL_INTRO_ACTIVE_STAGE) {
    miniboss.x = state.width / 2;
    miniboss.y = Math.min(78, miniboss.y + 40 * dt);
    if (state.bossDialogue) {
      state.bossDialogue.x = miniboss.x;
      state.bossDialogue.y = miniboss.y;
    }
    if (state.minibossIntroStage === 7) {
      state.minibossIntroFor = Math.max(0, state.minibossIntroFor - dt);
      if (state.minibossIntroFor > 0) return;
      state.minibossIntroStage = BACKFILL_INTRO_ACTIVE_STAGE;
      state.minibossFightStarts += 1;
      state.backfillWallCooldown = 999;
      state.phaseElapsed = 0;
      state.bossDialogue = null;
      miniboss.behaviorCooldown = 0.8;
      state.banner = ACTS[state.actIndex].miniboss?.name ?? state.banner;
      return;
    }
    if (state.minibossIntroStage >= 2 && state.minibossIntroStage <= 4) {
      state.minibossIntroFor -= dt;
      if (state.minibossIntroFor > 0) return;
      state.minibossIntroStage += 1;
      state.minibossIntroFor = state.minibossIntroStage === 4 ? 2.8 : 1.4;
      if (state.minibossIntroStage === 5) {
        state.minibossIntroFor = 2.4;
        state.bossImpactCues += 1;
        state.screenShake = 0.8;
        showBossDialogue(state, quotes.introNever, miniboss.x, miniboss.y, 3600, "danger");
      } else {showBossDialogue(
          state,
          quotes.intro + ".".repeat(state.minibossIntroStage - 1),
          miniboss.x,
          miniboss.y,
          3600,
        );}
      return;
    }
    if (state.minibossIntroStage === 5) {
      state.minibossIntroFor = Math.max(0, state.minibossIntroFor - dt);
      if (state.minibossIntroFor > 0) return;
      state.minibossIntroStage = 6;
      state.bossDialogue = null;
      state.player.dashCooldown = 0;
      state.backfillWallDirection = 0;
      spawnBackfillWall(state, 0);
      return;
    }
    const dialogue = state.bossDialogue;
    const speaking = dialogue &&
      (dialogue.maxLife - dialogue.life < 0.6 ||
        (dialogue.revealRate &&
          (dialogue.maxLife - dialogue.life) * dialogue.revealRate < dialogue.text.length));
    if (!advance || speaking) return;
    if (state.minibossIntroStage === 1) {
      state.minibossIntroStage = 2;
      state.minibossIntroFor = 1.4;
      showBossDialogue(state, quotes.intro + ".", miniboss.x, miniboss.y, 3600);
    }
    return;
  }

  if (state.minibossDefeatFor > 0) return;
  if (state.backfillWallWarningFor > 0) {
    state.backfillWallWarningFor = Math.max(0, state.backfillWallWarningFor - dt);
    if (state.backfillWallWarningFor === 0) {
      spawnBackfillWall(state, state.backfillWallDirection, 260);
    }
    return;
  }
  if (state.backfillWallCooldown < 999) {
    state.backfillWallCooldown = Math.max(0, state.backfillWallCooldown - dt);
  }
  if (state.backfillWallCooldown > 0) return;
  state.backfillWallDirection = chooseBackfillWallDirection(state, random);
  state.backfillWallWarningFor = 1.4 * DIFFICULTIES[state.mode].warningMultiplier;
  miniboss.bossAttackPending = undefined;
  state.backfillFollowupAttack = null;
  miniboss.warningFor = 0;
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

function spawnBackfillWall(state: GameState, direction: number, speed = BACKFILL_WALL_SPEED) {
  state.backfillWallActive = true;
  state.backfillWallResolved = false;
  const boss = state.enemies.find((enemy) => enemy.bossKind === "backfill-daemon");
  if (boss) {
    boss.bossAttackPending = undefined;
    boss.behaviorCooldown = 0.45;
  }
  const vertical = direction === 1 || direction === 3;
  const span = vertical ? state.height : state.width;
  const radius = 9;
  const spacing = 15;
  const velocityX = direction === 1 ? -speed : direction === 3 ? speed : 0;
  const velocityY = direction === 0 ? speed : direction === 2 ? -speed : 0;
  const originX = direction === 1 ? state.width + radius : direction === 3 ? -radius : 0;
  const originY = direction === 0 ? -radius : direction === 2 ? state.height + radius : 0;
  const life = ((vertical ? state.width : state.height) + radius * 4) /
    (speed * DIFFICULTIES[state.mode].projectileSpeedMultiplier);

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
  // Movement continues through warnings, covering fire, and the one-time shield.
  orbitPlayer(enemy, towardX, towardY, distance, dt, 1.15 + enemy.phase * 0.1);
  // The teaching wall stays quiet; combat walls retain adds and get readable covering fire.
  if (state.backfillWallActive && state.minibossIntroStage >= BACKFILL_INTRO_ACTIVE_STAGE) {
    if (enemy.behaviorCooldown > 0) return;
    if (enemy.bossAttackPending === BACKFILL_COVER_ATTACK) {
      aimedSpread(state, enemy, enemy.phase === 3 ? 5 : 3, 0.14, 275);
      enemy.bossAttackPending = undefined;
      enemy.behaviorCooldown = 0.5;
    } else {
      enemy.bossAttackPending = BACKFILL_COVER_ATTACK;
      enemy.warningFor = 0.55 * DIFFICULTIES[state.mode].warningMultiplier;
      enemy.behaviorCooldown = enemy.warningFor;
    }
    return;
  }
  if (state.backfillWallActive || state.backfillWallWarningFor > 0 || state.backfillShielded) {
    return;
  }
  if (state.backfillFollowupAttack !== null) {
    state.backfillFollowupFor -= dt;
    if (state.backfillFollowupFor <= 0) {
      if (state.backfillFollowupAttack === BACKFILL_DOUBLE_ATTACK) {
        aimedSpread(state, enemy, enemy.phase === 3 ? 7 : 5, 0.14, 310);
      } else {
        const aim = enemy.aimAngle;
        enemy.aimAngle += 0.65;
        gappedRadialBurst(state, enemy, 24, 255, 0.5);
        enemy.aimAngle = aim;
      }
      state.backfillFollowupAttack = null;
      enemy.behaviorCooldown = enemy.phase === 3 ? 0.4 : 0.55;
    }
    return;
  }
  if (enemy.behaviorCooldown > 0) return;

  if (enemy.bossAttackPending !== undefined) {
    executeBackfillAttack(state, enemy, enemy.bossAttackPending, random);
    enemy.bossAttackPending = undefined;
    enemy.bossAttackStep = (enemy.bossAttackStep ?? 0) + 1;
    enemy.behaviorCooldown = enemy.phase === 3 ? 0.4 : 0.55;
    if (enemy.bossAttackStep % 3 === 0) state.backfillWallCooldown = 1.25;
    return;
  }

  if (state.backfillWallCooldown < 999) return;

  const rotations = enemy.phase === 1
    ? [
      BACKFILL_DOUBLE_ATTACK,
      BACKFILL_PATTERN_ATTACK,
      BACKFILL_SHIFT_ATTACK,
      BACKFILL_AIMED_ATTACK,
    ]
    : enemy.phase === 2
    ? [
      BACKFILL_DOUBLE_ATTACK,
      BACKFILL_SHIFT_ATTACK,
      BACKFILL_SUMMON_ATTACK,
      BACKFILL_PATTERN_ATTACK,
    ]
    : [
      BACKFILL_SHIFT_ATTACK,
      BACKFILL_DOUBLE_ATTACK,
      BACKFILL_SUMMON_ATTACK,
      BACKFILL_SHIFT_ATTACK,
    ];
  const attack = rotations[(enemy.bossAttackStep ?? 0) % rotations.length];
  const warning = (attack === BACKFILL_SUMMON_ATTACK ? 0.9 : 0.7) *
    DIFFICULTIES[state.mode].warningMultiplier;
  enemy.bossAttackPending = attack;
  enemy.warningFor = warning;
  enemy.behaviorCooldown = warning;

  const callout = attack === BACKFILL_DOUBLE_ATTACK
    ? "DOUBLE STAMP! Keep moving!"
    : attack === BACKFILL_SHIFT_ATTACK
    ? "ROTATING BACKUP! Mind the gap!"
    : attack === BACKFILL_PATTERN_ATTACK
    ? "DISK FULL! Find the free space!"
    : "PRIORITY UPLOAD! Coming through!";
  if (attack !== BACKFILL_SUMMON_ATTACK) showBossDialogue(state, callout, enemy.x, enemy.y, 1.8);
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
  if (attack === BACKFILL_DOUBLE_ATTACK || attack === BACKFILL_SHIFT_ATTACK) {
    if (attack === BACKFILL_DOUBLE_ATTACK) {
      aimedSpread(state, enemy, enemy.phase === 3 ? 7 : 5, 0.14, 290);
    } else gappedRadialBurst(state, enemy, 22, 220, 0.6);
    state.backfillFollowupAttack = attack;
    state.backfillFollowupFor = attack === BACKFILL_DOUBLE_ATTACK ? 0.4 : 0.65;
    return;
  }
  if (attack === BACKFILL_PATTERN_ATTACK) {
    gappedRadialBurst(
      state,
      enemy,
      15 + enemy.phase * 2,
      190 + enemy.phase * 18,
      enemy.phase === 3 ? 0.48 : 0.62,
    );
    return;
  }
  if (attack === BACKFILL_AIMED_ATTACK) {
    aimedSpread(state, enemy, 3 + enemy.phase, 0.16, 235 + enemy.phase * 12);
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
