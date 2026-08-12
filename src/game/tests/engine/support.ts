import { createGameState, dispatchGameAction, stepGame } from "../../engine.ts";
import type { ArcadeInput, Enemy, GameState, Projectile } from "../../types.ts";

export const idleInput: ArcadeInput = {
  movement: { x: 0, y: 0 },
  aim: { x: 300, y: 150 },
  firing: false,
  secondary: false,
  reload: false,
  dash: false,
};

export function activeState(seed = 7, mode: "normal" | "hard" = "normal") {
  return createGameState(500, 300, { seed, mode, phase: "encounter" });
}

export function backlogBossState() {
  const state = activeState();
  state.encounterIndex = 2;
  state.objectiveProgress = state.objectiveTarget;
  stepGame(state, idleInput, 1 / 60, () => 0.5);
  dispatchGameAction(state, {
    type: "chooseUpgrade",
    upgradeId: state.offeredUpgrades[0],
  });
  return state;
}

export function activateBacklogBoss(state: GameState) {
  while (state.backlogIntroStage < 5) {
    stepGame(state, { ...idleInput, firing: true }, 1 / 60, () => 0.5);
    stepGame(state, idleInput, 1 / 60, () => 0.5);
  }
}

export function enemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 1,
    kind: "file",
    x: 160,
    y: 150,
    radius: 11,
    speed: 0,
    health: 1,
    maxHealth: 1,
    points: 12,
    damage: 1,
    aimAngle: 0,
    behaviorCooldown: 10,
    warningFor: 0,
    phase: 0,
    orbitDirection: 1,
    splitGeneration: 0,
    dashFor: 0,
    dashX: 0,
    dashY: 0,
    elite: false,
    ...overrides,
  };
}

export function projectile(overrides: Partial<Projectile> = {}): Projectile {
  return {
    id: 1,
    x: 160,
    y: 150,
    previousX: 150,
    previousY: 150,
    vx: 0,
    vy: 0,
    radius: 3,
    damage: 1,
    pierce: 0,
    life: 1,
    friendly: true,
    hitIds: [],
    bouncesRemaining: 0,
    reflected: false,
    ...overrides,
  };
}

export function sequenceRandom(values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
