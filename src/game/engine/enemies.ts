import { DIFFICULTIES } from "../content.ts";
import type { EnemyKind, GameState } from "../types.ts";

export function chooseWeightedKind(
  weights: Partial<Record<EnemyKind, number>>,
  random: () => number,
) {
  const entries = Object.entries(weights).filter(
    (entry) => (entry[1] ?? 0) > 0,
  ) as [EnemyKind, number][];
  const total = entries.reduce((sum, entry) => sum + entry[1], 0);
  let roll = random() * total;
  for (const [kind, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return kind;
  }
  return entries.at(-1)?.[0] ?? "file";
}

export function enemyStats(kind: EnemyKind) {
  if (kind === "media") {
    return { radius: 15, speed: 61, health: 3, points: 28, damage: 1 };
  }
  if (kind === "library") {
    return { radius: 20, speed: 44, health: 6, points: 74, damage: 1 };
  }
  if (kind === "malicious") {
    return { radius: 13, speed: 60, health: 3, points: 58, damage: 1 };
  }
  if (kind === "duplicate") {
    return { radius: 14, speed: 67, health: 3, points: 48, damage: 1 };
  }
  if (kind === "corruptor") {
    return { radius: 16, speed: 50, health: 4, points: 68, damage: 1 };
  }
  if (kind === "buffering") {
    return { radius: 12, speed: 78, health: 2, points: 44, damage: 1 };
  }
  if (kind === "support") {
    return { radius: 15, speed: 54, health: 4, points: 82, damage: 1 };
  }
  return { radius: 11, speed: 82, health: 1, points: 12, damage: 1 };
}

export function enemyCost(kind: EnemyKind) {
  if (kind === "library" || kind === "support") return 4;
  if (kind === "corruptor" || kind === "malicious" || kind === "duplicate") {
    return 3;
  }
  if (kind === "media" || kind === "buffering") return 2;
  return 1;
}

export function adjustedBudget(state: GameState, budget: number) {
  return Math.round(budget * DIFFICULTIES[state.mode].spawnBudgetMultiplier);
}
