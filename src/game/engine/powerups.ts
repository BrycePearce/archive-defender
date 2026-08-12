import { UPGRADE_BY_ID, UPGRADES } from "../content.ts";
import type { Enemy, GameState, TemporaryPowerupKind, UpgradeId } from "../types.ts";
import { burstParticles } from "./combat.ts";
import {
  DROP_COOLDOWN,
  DROP_PITY_KILLS,
  ELITE_DROP_CHANCE,
  FREEZE_DURATION,
  MACHINE_GUN_AMMO,
  NORMAL_DROP_CHANCE,
  PLAYER_RADIUS,
  POWERUP_WEIGHTS,
  SINGULARITY_DURATION,
  SINGULARITY_PLACEMENT_DISTANCE,
  SINGULARITY_RADIUS,
  SUPER_SHOT_AMMO,
} from "./config.ts";
import { clamp } from "./geometry.ts";
import { nextRandom } from "./random.ts";
import { isBacklogFirewallPattern } from "./projectilePatterns.ts";

export function clearRetainedPowerups(state: GameState) {
  state.activePowerups.reflect = 0;
  state.activePowerups.prism = 0;
  state.activePowerups.shieldFor = 0;
  state.activePowerups.shieldHits = 0;
  state.temporaryWeapon = null;
  state.player.reloadFor = 0;
}

export function applyUpgrade(
  state: GameState,
  upgradeId: UpgradeId,
  configureWeaponState: (state: GameState, refill: boolean) => void,
) {
  const definition = UPGRADE_BY_ID[upgradeId];
  const nextLevel = Math.min(
    definition.maxLevel,
    upgradeLevel(state, upgradeId) + 1,
  );
  state.upgrades[upgradeId] = nextLevel;
  if (upgradeId === "parity") {
    state.player.maxHealth += 1;
    state.player.health = Math.min(
      state.player.maxHealth,
      state.player.health + 1,
    );
  }
  if (upgradeId === "snapshot") {
    state.player.shield = Math.max(1, state.player.shield);
  }
  if (upgradeId === "magazine-extension" || upgradeId === "hot-swap") {
    configureWeaponState(state, upgradeId === "magazine-extension");
  }
}

export function updatePowerupDrops(state: GameState, dt: number) {
  for (const drop of state.powerupDrops) {
    drop.life -= dt;
    if (drop.fallSpeed) drop.y += drop.fallSpeed * dt;
    if (
      drop.life > 0 &&
      Math.hypot(drop.x - state.player.x, drop.y - state.player.y) <=
        drop.radius + PLAYER_RADIUS
    ) {
      collectPowerup(state, drop.kind);
      drop.life = -1;
      burstParticles(state, drop.x, drop.y, powerupColor(drop.kind), 22);
    } else if (drop.fallSpeed && drop.y - drop.radius > state.height) {
      drop.life = -1;
    }
  }
}

export function collectPowerup(state: GameState, kind: TemporaryPowerupKind) {
  if (kind === "reflect") state.activePowerups.reflect = 1;
  if (kind === "machine-gun") {
    state.temporaryWeapon = { kind, ammo: MACHINE_GUN_AMMO };
    state.player.reloadFor = 0;
  }
  if (kind === "super-shot") {
    state.temporaryWeapon = { kind, ammo: SUPER_SHOT_AMMO };
    state.player.reloadFor = 0;
  }
  if (kind === "prism") state.activePowerups.prism = 1;
  if (kind === "freeze") {
    state.activePowerups.freezeFor = FREEZE_DURATION;
    state.banner = "All streams paused — shatter window open";
  }
  if (kind === "singularity") {
    state.singularity = {
      x: clamp(
        state.player.x + Math.cos(state.player.angle) * SINGULARITY_PLACEMENT_DISTANCE,
        38,
        state.width - 38,
      ),
      y: clamp(
        state.player.y + Math.sin(state.player.angle) * SINGULARITY_PLACEMENT_DISTANCE,
        38,
        state.height - 38,
      ),
      life: SINGULARITY_DURATION,
      duration: SINGULARITY_DURATION,
      radius: SINGULARITY_RADIUS,
    };
    state.banner = "Database Vacuum deployed";
  }
  if (kind === "shield") {
    clearNearbyHostileProjectiles(state);
    state.activePowerups.shieldFor = 1;
    state.activePowerups.shieldHits = 1;
  }
  if (kind === "repair") {
    state.player.health = Math.min(
      state.player.maxHealth,
      state.player.health + 1,
    );
  }
  state.powerupsCollected += 1;
}

export function powerupColor(kind: TemporaryPowerupKind) {
  if (kind === "reflect") return "#f8d477";
  if (kind === "machine-gun") return "#ff7d8f";
  if (kind === "super-shot") return "#ffca69";
  if (kind === "shield") return "#65d6e8";
  if (kind === "freeze") return "#b9f4ff";
  if (kind === "singularity") return "#b687ff";
  if (kind === "repair") return "#76e0c1";
  return "#b687ff";
}

export function trySpawnPowerup(state: GameState, enemy: Enemy, random: () => number) {
  state.killsSincePowerupDrop += 1;
  if (
    state.powerupsDroppedThisPhase >= powerupDropCap(state) ||
    state.dropCooldown > 0
  ) {
    return;
  }
  const guaranteed = state.killsSincePowerupDrop >= DROP_PITY_KILLS;
  const chance = enemy.elite ? ELITE_DROP_CHANCE : NORMAL_DROP_CHANCE;
  if (!guaranteed && random() >= chance) return;

  const kind = choosePowerupKind(state, random);
  spawnPowerupDrop(state, kind, enemy.x, enemy.y);
}

export function spawnPowerupDrop(
  state: GameState,
  kind: TemporaryPowerupKind,
  x: number,
  y: number,
  ignorePhaseCap = false,
  falling = false,
) {
  if (!ignorePhaseCap && state.powerupsDroppedThisPhase >= powerupDropCap(state)) return false;
  state.powerupDrops.push({
    id: state.nextPowerupId++,
    kind,
    x,
    y,
    radius: 13,
    life: 10,
    fallSpeed: falling ? 145 : undefined,
  });
  state.dropCooldown = DROP_COOLDOWN;
  state.killsSincePowerupDrop = 0;
  state.powerupsDroppedThisPhase += 1;
  state.lastPowerupKind = kind;
  return true;
}

export function powerupDropCap(state: GameState) {
  return state.phase === "boss" ? 2 : 4;
}

export function choosePowerupKind(state: GameState, random: () => number) {
  let candidates = (
    Object.keys(POWERUP_WEIGHTS) as TemporaryPowerupKind[]
  ).filter(
    (kind) => kind !== "repair" || state.player.health < state.player.maxHealth,
  );
  if (candidates.length > 1 && state.lastPowerupKind) {
    candidates = candidates.filter((kind) => kind !== state.lastPowerupKind);
  }
  const total = candidates.reduce(
    (sum, kind) => sum + POWERUP_WEIGHTS[kind],
    0,
  );
  let roll = random() * total;
  for (const kind of candidates) {
    roll -= POWERUP_WEIGHTS[kind];
    if (roll <= 0) return kind;
  }
  return candidates[candidates.length - 1];
}

export function clearNearbyHostileProjectiles(state: GameState) {
  for (const projectile of state.projectiles) {
    if (
      !projectile.friendly &&
      projectile.pattern !== "backfill-wall" &&
      !isBacklogFirewallPattern(projectile.pattern) &&
      Math.hypot(
          projectile.x - state.player.x,
          projectile.y - state.player.y,
        ) <= 230
    ) {
      projectile.life = -1;
    }
  }
}

export function resetDropDirector(state: GameState) {
  state.dropCooldown = 0;
  state.killsSincePowerupDrop = 0;
  state.powerupsDroppedThisPhase = 0;
}

export function offerUpgrades(state: GameState) {
  const candidates = UPGRADES.filter(
    (upgrade) => upgradeLevel(state, upgrade.id) < upgrade.maxLevel,
  ).map((upgrade) => upgrade.id);
  const offered: UpgradeId[] = [];
  while (candidates.length > 0 && offered.length < 3) {
    const index = Math.floor(nextRandom(state) * candidates.length);
    offered.push(candidates.splice(index, 1)[0]);
  }
  return offered;
}

export function upgradeLevel(state: GameState, id: UpgradeId) {
  return state.upgrades[id] ?? 0;
}
