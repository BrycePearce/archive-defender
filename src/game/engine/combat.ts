import { ACTS, DIFFICULTIES } from "../content.ts";
import type { Enemy, EnemyKind, GameState, Hazard } from "../types.ts";
import { MAX_ENEMIES, MAX_PARTICLES, MAX_PROJECTILES } from "./config.ts";
import { enemyCost, enemyStats } from "./enemies.ts";
import { nextRandom } from "./random.ts";
import { getCurrentEncounter } from "./selectors.ts";

export function spawnEnemy(
  state: GameState,
  kind: EnemyKind,
  random: () => number,
  scale = 1,
  allowElite = true,
): Enemy {
  const stats = enemyStats(kind);
  const edge = Math.floor(random() * 4);
  let x = random() * state.width;
  let y = random() * state.height;
  if (edge === 0) y = -stats.radius;
  if (edge === 1) x = state.width + stats.radius;
  if (edge === 2) y = state.height + stats.radius;
  if (edge === 3) x = -stats.radius;
  const difficulty = DIFFICULTIES[state.mode];
  const encounter = getCurrentEncounter(state);
  const eligibleElite = allowElite &&
    state.phase === "encounter" &&
    state.phaseElapsed >= 8 &&
    kind !== "file" &&
    enemyCost(kind) >= 2;
  const elite = eligibleElite && random() < (encounter?.eliteChance ?? 0);
  const eliteScale = elite ? 1.6 : 1;
  const health = Math.max(
    1,
    Math.round(
      stats.health * difficulty.enemyHealthMultiplier * scale * eliteScale,
    ),
  );
  return {
    id: state.nextEnemyId++,
    kind,
    x,
    y,
    radius: stats.radius,
    speed: stats.speed *
      difficulty.enemySpeedMultiplier *
      Math.sqrt(scale) *
      (elite ? 1.1 : 1),
    health,
    maxHealth: health,
    points: Math.round(stats.points * (elite ? 1.8 : 1)),
    damage: stats.damage,
    aimAngle: 0,
    behaviorCooldown: 0.9 + random() * 1.4,
    warningFor: 0,
    phase: 0,
    orbitDirection: random() > 0.5 ? 1 : -1,
    splitGeneration: 0,
    dashFor: 0,
    dashX: 0,
    dashY: 0,
    elite,
  };
}

export function createBoss(state: GameState): Enemy {
  const boss = ACTS[state.actIndex].boss;
  const difficulty = DIFFICULTIES[state.mode];
  const health = Math.round(boss.health * difficulty.enemyHealthMultiplier);
  return {
    id: state.nextEnemyId++,
    kind: "boss",
    bossKind: boss.kind,
    x: state.width / 2,
    y: -38,
    radius: 34,
    speed: boss.speed * difficulty.enemySpeedMultiplier,
    health,
    maxHealth: health,
    points: boss.points,
    damage: 1,
    aimAngle: Math.PI / 2,
    behaviorCooldown: 1.4,
    warningFor: 0.8,
    phase: 1,
    orbitDirection: 1,
    splitGeneration: 0,
    dashFor: 0,
    dashX: 0,
    dashY: 0,
    elite: false,
  };
}

export function createMiniboss(state: GameState): Enemy {
  const miniboss = ACTS[state.actIndex].miniboss;
  if (!miniboss) throw new Error("Miniboss content is missing");
  const difficulty = DIFFICULTIES[state.mode];
  const health = Math.round(miniboss.health * difficulty.enemyHealthMultiplier);
  return {
    id: state.nextEnemyId++,
    kind: "boss",
    bossKind: miniboss.kind,
    x: state.width / 2,
    y: 48,
    radius: 27,
    speed: miniboss.speed * difficulty.enemySpeedMultiplier,
    health,
    maxHealth: health,
    points: miniboss.points,
    damage: 1,
    aimAngle: Math.PI / 2,
    behaviorCooldown: 1.1,
    warningFor: 0.8,
    phase: 1,
    orbitDirection: -1,
    splitGeneration: 0,
    dashFor: 0,
    dashX: 0,
    dashY: 0,
    elite: false,
  };
}

export function showBossDialogue(
  state: GameState,
  text: string,
  x: number,
  y: number,
  duration: number,
  tone: "normal" | "danger" = "normal",
  revealRate?: number,
) {
  state.bossDialogue = {
    text,
    x,
    y,
    life: duration,
    maxLife: duration,
    tone,
    revealRate,
  };
}

export function createMine(state: GameState, x: number, y: number): Hazard {
  return {
    id: state.nextHazardId++,
    kind: "mine",
    x,
    y,
    radius: 24,
    life: 7,
    armFor: 0.85 * DIFFICULTIES[state.mode].warningMultiplier,
    damage: 1,
  };
}

export function summonMinions(
  state: GameState,
  kind: EnemyKind,
  count: number,
  random: () => number,
) {
  for (
    let index = 0;
    index < count && state.enemies.length < MAX_ENEMIES;
    index++
  ) {
    state.enemies.push(spawnEnemy(state, kind, random, 0.9));
  }
}

export function radialBurst(
  state: GameState,
  enemy: Enemy,
  count: number,
  speed: number,
) {
  for (let index = 0; index < count; index++) {
    createHostileProjectile(state, enemy, (Math.PI * 2 * index) / count, speed);
  }
}

export function gappedRadialBurst(
  state: GameState,
  enemy: Enemy,
  count: number,
  speed: number,
  gapWidth: number,
) {
  for (let index = 0; index < count; index++) {
    const angle = enemy.aimAngle + (Math.PI * 2 * index) / count;
    const distanceFromPlayerAngle = Math.abs(
      Math.atan2(Math.sin(angle - enemy.aimAngle), Math.cos(angle - enemy.aimAngle)),
    );
    if (distanceFromPlayerAngle < gapWidth) continue;
    createHostileProjectile(state, enemy, angle, speed);
  }
}

export function aimedSpread(
  state: GameState,
  enemy: Enemy,
  count: number,
  spread: number,
  speed: number,
) {
  for (let index = 0; index < count; index++) {
    const angle = enemy.aimAngle + (index - (count - 1) / 2) * spread;
    createHostileProjectile(state, enemy, angle, speed);
  }
}

export function createHostileProjectile(
  state: GameState,
  enemy: Enemy,
  angle: number,
  speed: number,
) {
  if (state.projectiles.length >= MAX_PROJECTILES) return;
  const difficulty = DIFFICULTIES[state.mode];
  const finalSpeed = speed * difficulty.projectileSpeedMultiplier;
  state.projectiles.push({
    id: state.nextProjectileId++,
    x: enemy.x + Math.cos(angle) * (enemy.radius + 5),
    y: enemy.y + Math.sin(angle) * (enemy.radius + 5),
    previousX: enemy.x,
    previousY: enemy.y,
    vx: Math.cos(angle) * finalSpeed,
    vy: Math.sin(angle) * finalSpeed,
    radius: 4,
    damage: 1,
    pierce: 0,
    life: 4,
    friendly: false,
    hitIds: [],
    bouncesRemaining: 0,
    reflected: false,
  });
}

export function moveEnemy(
  enemy: Enemy,
  towardX: number,
  towardY: number,
  dt: number,
  multiplier = 1,
) {
  enemy.x += towardX * enemy.speed * multiplier * dt;
  enemy.y += towardY * enemy.speed * multiplier * dt;
}

export function orbitPlayer(
  enemy: Enemy,
  towardX: number,
  towardY: number,
  distance: number,
  dt: number,
  multiplier: number,
) {
  const radial = distance > 285 ? 1 : distance < 195 ? -1 : 0;
  const orbitWeight = radial === 0 ? 1 : 0.3;
  enemy.x += (towardX * radial - towardY * enemy.orbitDirection * orbitWeight) *
    enemy.speed *
    multiplier *
    dt;
  enemy.y += (towardY * radial + towardX * enemy.orbitDirection * orbitWeight) *
    enemy.speed *
    multiplier *
    dt;
}

export function burstParticles(
  state: GameState,
  x: number,
  y: number,
  color: string,
  count: number,
) {
  const allowed = Math.min(count, MAX_PARTICLES - state.particles.length);
  for (let index = 0; index < allowed; index++) {
    const angle = nextRandom(state) * Math.PI * 2;
    const speed = 40 + nextRandom(state) * 150;
    const life = 0.25 + nextRandom(state) * 0.4;
    state.particles.push({
      id: state.nextParticleId++,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      color,
      size: 1.5 + nextRandom(state) * 3,
    });
  }
}

export function enemyColor(enemy: Enemy) {
  if (enemy.kind === "boss") return "#ffd36e";
  if (enemy.kind === "malicious" || enemy.kind === "corruptor") {
    return "#ff6684";
  }
  if (enemy.kind === "duplicate") return "#b687ff";
  if (enemy.kind === "support") return "#65d6e8";
  if (enemy.kind === "buffering") return "#ffca69";
  if (enemy.kind === "media") return "#a978e8";
  if (enemy.kind === "library") return "#f3a65a";
  return "#ef6f79";
}
