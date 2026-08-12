import { ACTS } from "../../content.ts";
import type {
  ArcadeInput,
  BacklogBomb,
  Enemy,
  GameState,
  TemporaryWeaponKind,
} from "../../types.ts";
import { backlogPlayerBoundary, returnBacklogBomb } from "../encounters/backlog.ts";
import { burstParticles } from "../combat.ts";
import {
  BACKFILL_INTRO_ACTIVE_STAGE,
  BACKLOG_BOMB_INTERCEPT_PADDING,
  BACKLOG_INTRO_ACTIVE_STAGE,
  BASE_DASH_COOLDOWN,
  BASE_DASH_DURATION,
  BASE_FIRE_INTERVAL,
  BASE_PLAYER_SPEED,
  BASE_PROJECTILE_SPEED,
  BASE_SECONDARY_COOLDOWN,
  DASH_SPEED,
  DEEP_SCAN_BACKLOG_KNOCKBACK,
  DEEP_SCAN_BASE_WIDTH,
  MACHINE_GUN_AMMO,
  MACHINE_GUN_RELOAD,
  MAX_PROJECTILES,
  PLAYER_RADIUS,
  REFLECT_BOUNCES,
  REFLECT_LIFE_MULTIPLIER,
  SUPER_SHOT_AMMO,
  SUPER_SHOT_RELOAD,
} from "../config.ts";
import { clamp, segmentsWithinDistance } from "../geometry.ts";
import { upgradeLevel } from "../powerups.ts";

import { nextRandom } from "../random.ts";

export function updatePlayer(
  state: GameState,
  input: ArcadeInput,
  dt: number,
  destroyEnemy: (state: GameState, enemy: Enemy, random: () => number) => void,
) {
  const movementLength = Math.hypot(input.movement.x, input.movement.y);
  const movementX = movementLength > 0 ? input.movement.x / movementLength : 0;
  const movementY = movementLength > 0 ? input.movement.y / movementLength : 0;

  if (input.dash && state.player.dashCooldown === 0 && movementLength > 0) {
    state.player.dashFor = BASE_DASH_DURATION * (1 + upgradeLevel(state, "checksum") * 0.2);
    state.player.dashCooldown = BASE_DASH_COOLDOWN *
      Math.pow(0.82, upgradeLevel(state, "io-burst"));
    state.player.dashX = movementX;
    state.player.dashY = movementY;
    state.player.invulnerableFor = Math.max(
      state.player.invulnerableFor,
      state.player.dashFor + 0.06,
    );
    burstParticles(
      state,
      state.player.x,
      state.player.y,
      ACTS[state.actIndex].palette.primary,
      9,
    );
  }

  const speed = state.player.dashFor > 0
    ? DASH_SPEED
    : BASE_PLAYER_SPEED * (1 + upgradeLevel(state, "fast-scan") * 0.1);
  const moveX = state.player.dashFor > 0 ? state.player.dashX : movementX;
  const moveY = state.player.dashFor > 0 ? state.player.dashY : movementY;
  state.player.x = clamp(
    state.player.x + moveX * speed * dt,
    PLAYER_RADIUS,
    state.width - PLAYER_RADIUS,
  );
  const minimumPlayerY = state.phase === "boss" &&
      ACTS[state.actIndex].boss.kind === "backlog" &&
      state.backlogIntroStage >= BACKLOG_INTRO_ACTIVE_STAGE &&
      state.backlogIntermissionStage === 0
    ? backlogPlayerBoundary(state)
    : PLAYER_RADIUS;
  state.player.y = clamp(
    state.player.y + moveY * speed * dt,
    minimumPlayerY,
    state.height - PLAYER_RADIUS,
  );

  const aimX = input.aim.x - state.player.x;
  const aimY = input.aim.y - state.player.y;
  if (Math.hypot(aimX, aimY) > 0.001) {
    state.player.angle = Math.atan2(aimY, aimX);
  }

  if (input.reload) startReload(state);
  if (input.secondary && state.player.secondaryCooldown === 0) {
    fireDeepScan(state, destroyEnemy);
  }
  if (input.firing && state.player.fireCooldown === 0) {
    if (state.player.reloadFor > 0) return;
    const ammo = state.temporaryWeapon?.ammo ?? state.player.ammo;
    if (ammo <= 0) startReload(state);
    else fireWeapon(state);
  }
}

function fireWeapon(state: GameState) {
  if (state.projectiles.length >= MAX_PROJECTILES) return;
  const temporaryKind = state.temporaryWeapon?.kind ?? null;
  const fireRate = Math.pow(0.86, upgradeLevel(state, "rapid-index"));
  const baseInterval = temporaryKind === "machine-gun"
    ? 0.075
    : temporaryKind === "super-shot"
    ? 0.45
    : state.weapon === "rail"
    ? 0.42
    : state.weapon === "array"
    ? 0.22
    : BASE_FIRE_INTERVAL;
  state.player.fireCooldown = Math.max(0.055, baseInterval * fireRate);
  if (state.temporaryWeapon) {
    state.temporaryWeapon.ammo -= 1;
  } else {
    state.player.ammo = Math.max(0, state.player.ammo - 1);
    if (state.player.ammo === 0) startReload(state);
  }

  const companionShots = upgradeLevel(state, "parallel-writes");
  const weaponShots = temporaryKind ? 1 : state.weapon === "array" ? 3 : 1;
  const totalShots = weaponShots + companionShots;
  const spread = totalShots === 1
    ? 0
    : temporaryKind
    ? 0.075
    : state.weapon === "array"
    ? 0.18
    : 0.075;
  for (let index = 0; index < totalShots; index++) {
    const offset = (index - (totalShots - 1) / 2) * spread;
    createFriendlyProjectile(state, state.player.angle + offset, temporaryKind);
  }
  if (state.temporaryWeapon?.ammo === 0) startReload(state);
}

function createFriendlyProjectile(
  state: GameState,
  angle: number,
  temporaryKind: TemporaryWeaponKind | null = null,
) {
  const rail = state.weapon === "rail";
  const packetSize = upgradeLevel(state, "packet-size");
  const damage = temporaryKind === "machine-gun"
    ? 1 + Math.floor(packetSize / 2)
    : temporaryKind === "super-shot"
    ? 8 + packetSize
    : (rail ? 2 : 1) + packetSize;
  const radius = temporaryKind === "super-shot" ? 9 : temporaryKind ? 3 : rail ? 4 : 3;
  const speed = temporaryKind === "machine-gun"
    ? 690
    : temporaryKind === "super-shot"
    ? 720
    : BASE_PROJECTILE_SPEED * (rail ? 1.28 : 1);
  const baseLife = temporaryKind === "super-shot" ? 1.25 : temporaryKind ? 1.18 : rail ? 0.9 : 1.18;
  const reflected = state.activePowerups.reflect > 0;
  state.projectiles.push({
    id: state.nextProjectileId++,
    x: state.player.x + Math.cos(angle) * 21,
    y: state.player.y + Math.sin(angle) * 21,
    previousX: state.player.x,
    previousY: state.player.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius,
    damage,
    pierce: (temporaryKind === "super-shot" ? 6 : temporaryKind ? 0 : rail ? 2 : 0) +
      upgradeLevel(state, "dedupe-pass") +
      (state.activePowerups.prism > 0 ? 1 : 0),
    life: baseLife * (reflected ? REFLECT_LIFE_MULTIPLIER : 1),
    friendly: true,
    hitIds: [],
    bouncesRemaining: reflected ? REFLECT_BOUNCES : 0,
    reflected,
  });
}

export function configureWeaponState(state: GameState, refill: boolean) {
  const baseMagazine = state.weapon === "rail" ? 5 : state.weapon === "array" ? 9 : 14;
  const baseReload = state.weapon === "rail" ? 1.1 : state.weapon === "array" ? 1 : 0.85;
  state.player.magazineSize = Math.ceil(
    baseMagazine * (1 + upgradeLevel(state, "magazine-extension") * 0.25),
  );
  state.player.reloadDuration = Math.max(
    0.28,
    baseReload * Math.pow(0.84, upgradeLevel(state, "hot-swap")),
  );
  if (refill) {
    state.player.ammo = state.player.magazineSize;
    state.player.reloadFor = 0;
  } else {
    state.player.ammo = Math.min(state.player.ammo, state.player.magazineSize);
  }
}

export function startReload(state: GameState) {
  if (state.player.reloadFor > 0) return;
  if (state.temporaryWeapon) {
    const magazineSize = temporaryWeaponMagazineSize(
      state.temporaryWeapon.kind,
    );
    if (state.temporaryWeapon.ammo >= magazineSize) return;
    const baseDuration = state.temporaryWeapon.kind === "machine-gun"
      ? MACHINE_GUN_RELOAD
      : SUPER_SHOT_RELOAD;
    state.player.reloadFor = Math.max(
      0.45,
      baseDuration * Math.pow(0.84, upgradeLevel(state, "hot-swap")),
    );
    return;
  }
  if (state.player.ammo >= state.player.magazineSize) return;
  state.player.reloadFor = state.player.reloadDuration;
}

export function temporaryWeaponMagazineSize(kind: TemporaryWeaponKind) {
  return kind === "machine-gun" ? MACHINE_GUN_AMMO : SUPER_SHOT_AMMO;
}

function fireDeepScan(
  state: GameState,
  destroyEnemy: (state: GameState, enemy: Enemy, random: () => number) => void,
) {
  const cooldown = Math.max(
    4.6,
    BASE_SECONDARY_COOLDOWN *
      Math.pow(0.88, upgradeLevel(state, "index-accelerator")),
  );
  state.player.secondaryCooldown = cooldown;
  state.player.beamFlashFor = 0.16;
  const forked = upgradeLevel(state, "forked-scan") > 0 || state.activePowerups.prism > 0;
  const angles = forked
    ? [state.player.angle - 0.18, state.player.angle, state.player.angle + 0.18]
    : [state.player.angle];
  const width = DEEP_SCAN_BASE_WIDTH * Math.pow(1.3, upgradeLevel(state, "wide-query"));
  let bossHit = false;
  let hitSomething = false;
  const scannedBombs = new Set<BacklogBomb>();
  const scannedFirewallIds = new Set<number>();
  for (let angleIndex = 0; angleIndex < angles.length; angleIndex++) {
    const angle = angles[angleIndex];
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const beamDamage = angleIndex === Math.floor(angles.length / 2) ? 5 : 3;
    for (const bomb of state.backlogBombs) {
      if (
        bomb.kind !== "returnable" ||
        bomb.lobFor > 0 ||
        scannedBombs.has(bomb)
      ) continue;
      const beamLength = Math.hypot(state.width, state.height) * 1.5;
      if (
        !segmentsWithinDistance(
          bomb.previousX,
          bomb.previousY,
          bomb.x,
          bomb.y,
          state.player.x,
          state.player.y,
          state.player.x + direction.x * beamLength,
          state.player.y + direction.y * beamLength,
          bomb.radius + width + BACKLOG_BOMB_INTERCEPT_PADDING,
        )
      ) continue;
      returnBacklogBomb(state, bomb, direction.x, direction.y);
      scannedBombs.add(bomb);
      hitSomething = true;
    }
    for (const segment of state.projectiles) {
      if (
        segment.pattern !== "backlog-firewall" ||
        segment.life <= 0 ||
        scannedFirewallIds.has(segment.id)
      ) continue;
      const dx = segment.x - state.player.x;
      const dy = segment.y - state.player.y;
      const along = dx * direction.x + dy * direction.y;
      const across = Math.abs(dx * direction.y - dy * direction.x);
      if (along < 0 || across > segment.radius + width) continue;
      segment.life = -1;
      scannedFirewallIds.add(segment.id);
      burstParticles(state, segment.x, segment.y, "#f8d477", 3);
      hitSomething = true;
    }
    for (const enemy of state.enemies) {
      if (enemy.health <= 0) continue;
      const dx = enemy.x - state.player.x;
      const dy = enemy.y - state.player.y;
      const along = dx * direction.x + dy * direction.y;
      const across = Math.abs(dx * direction.y - dy * direction.x);
      if (along < 0 || across > enemy.radius + width) continue;
      if (enemy.kind === "boss") {
        if (bossHit) continue;
        bossHit = true;
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
        enemy.health -= 4;
        if (enemy.bossKind === "backlog") {
          enemy.x = clamp(
            enemy.x + direction.x * DEEP_SCAN_BACKLOG_KNOCKBACK,
            enemy.radius,
            state.width - enemy.radius,
          );
          enemy.y = clamp(
            enemy.y + direction.y * DEEP_SCAN_BACKLOG_KNOCKBACK,
            enemy.radius,
            state.height - enemy.radius,
          );
        }
      } else {
        enemy.health -= beamDamage;
      }
      hitSomething = true;
      if (enemy.health <= 0) {
        destroyEnemy(state, enemy, () => nextRandom(state));
      }
    }
  }
  if (hitSomething) state.enemyHits += 1;
  burstParticles(
    state,
    state.player.x + Math.cos(state.player.angle) * 38,
    state.player.y + Math.sin(state.player.angle) * 38,
    "#70dff2",
    16,
  );
  state.screenShake = Math.max(state.screenShake, 0.42);
}
