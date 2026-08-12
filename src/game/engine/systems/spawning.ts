import { ACTS } from "../../content.ts";
import type { GameState } from "../../types.ts";
import { aimedSpread, radialBurst, spawnEnemy } from "../combat.ts";
import { MAX_ENEMIES } from "../config.ts";
import { adjustedBudget, chooseWeightedKind, enemyCost } from "../enemies.ts";
import { getCurrentEncounter } from "../selectors.ts";
import { nextRandom } from "../random.ts";

export function updateSpawns(state: GameState, dt: number, random: () => number) {
  if (state.phase === "boss" || state.phase === "miniboss") return;
  if (state.phase === "endless") {
    updateEndlessSpawns(state, dt, random);
    return;
  }

  const encounter = getCurrentEncounter(state);
  if (!encounter) return;
  const nextBeat = encounter.beats[state.spawnBeatIndex + 1];
  if (nextBeat && state.phaseElapsed >= nextBeat.at) {
    state.spawnBeatIndex += 1;
    state.spawnBudgetRemaining += adjustedBudget(state, nextBeat.budget);
  }

  state.spawnCooldown -= dt;
  const hardDensity = state.mode === "hard" ? 1.3 : 1;
  const threat = currentThreat(state);
  const threatFloor = Math.round(encounter.threatFloor * hardDensity);
  const threatCap = Math.round(encounter.threatCap * hardDensity);
  if (threat < threatFloor && state.spawnBudgetRemaining <= 0) {
    state.spawnBudgetRemaining = Math.max(1, threatCap - threat);
  }
  if (
    state.spawnCooldown > 0 ||
    state.spawnBudgetRemaining <= 0 ||
    threat >= threatCap
  ) {
    return;
  }
  const beat = encounter.beats[state.spawnBeatIndex];
  const kind = chooseWeightedKind(beat.weights, random);
  const cost = enemyCost(kind);
  if (
    state.spawnBudgetRemaining >= cost &&
    state.enemies.length < MAX_ENEMIES
  ) {
    state.enemies.push(spawnEnemy(state, kind, random));
    state.spawnBudgetRemaining -= cost;
  } else {
    state.spawnBudgetRemaining = 0;
  }
  state.spawnCooldown = (encounter.replenishMin +
    random() * (encounter.replenishMax - encounter.replenishMin)) /
    (state.mode === "hard" ? 1.12 : 1);
}

function currentThreat(state: GameState) {
  return state.enemies.reduce(
    (total, enemy) => total + (enemy.kind === "boss" ? 0 : enemyCost(enemy.kind)),
    0,
  );
}

export function updatePatternDirector(state: GameState, dt: number) {
  if (state.phase !== "encounter" || state.phaseElapsed < 10) return;
  if (state.patternWarningFor > 0) {
    state.patternWarningFor = Math.max(0, state.patternWarningFor - dt);
    if (state.patternWarningFor === 0) {
      const source = state.enemies.find(
        (enemy) => enemy.id === state.patternSourceId,
      );
      if (source && source.health > 0) {
        if (state.patternKind === "aimed") {
          aimedSpread(
            state,
            source,
            3 + state.actIndex,
            0.18,
            205 + state.actIndex * 20,
          );
        } else {
          radialBurst(
            state,
            source,
            6 + state.actIndex * 2,
            175 + state.actIndex * 20,
          );
        }
      }
      state.patternSourceId = null;
      state.patternKind = null;
      state.patternCooldown = Math.max(2.2, 5.2 - state.actIndex * 0.75) *
        (state.mode === "hard" ? 0.78 : 1);
    }
    return;
  }
  state.patternCooldown -= dt;
  if (state.patternCooldown > 0) return;
  const encounter = getCurrentEncounter(state);
  if (!encounter) return;
  const shooters = state.enemies.filter(
    (enemy) => enemy.health > 0 && enemy.kind !== "boss" && enemy.kind !== "file",
  );
  if (shooters.length > 0) {
    const source = shooters[Math.floor(nextRandom(state) * shooters.length)];
    source.warningFor = Math.max(
      source.warningFor,
      state.mode === "hard" ? 0.4 : 0.5,
    );
    state.patternWarningFor = state.mode === "hard" ? 0.4 : 0.5;
    state.patternSourceId = source.id;
    state.patternKind = encounter.objective === "relay" ? "aimed" : "radial";
    return;
  }
  state.patternCooldown = Math.max(2.2, 5.2 - state.actIndex * 0.75) *
    (state.mode === "hard" ? 0.78 : 1);
}

function updateEndlessSpawns(
  state: GameState,
  dt: number,
  random: () => number,
) {
  const roundDuration = 75;
  const expectedRound = 1 + Math.floor(state.phaseElapsed / roundDuration);
  if (expectedRound > state.endlessRound) {
    state.endlessRound = expectedRound;
    state.spawnBudgetRemaining += 28 + expectedRound * 7;
    state.player.health = Math.min(
      state.player.maxHealth,
      state.player.health + 1,
    );
    state.banner = `Maintenance cycle ${expectedRound}`;
    state.killsSincePowerupDrop = 0;
    state.powerupsDroppedThisPhase = 0;
  }
  state.spawnCooldown -= dt;
  if (state.spawnCooldown > 0) return;
  if (state.spawnBudgetRemaining <= 0) {
    state.spawnBudgetRemaining = 18 + state.endlessRound * 4;
  }
  const actWeights = state.endlessRound % 3 === 1
    ? ACTS[0].encounters[2].beats[2].weights
    : state.endlessRound % 3 === 2
    ? ACTS[1].encounters[2].beats[2].weights
    : ACTS[2].encounters[2].beats[2].weights;
  const kind = chooseWeightedKind(actWeights, random);
  const cost = enemyCost(kind);
  if (state.enemies.length < MAX_ENEMIES) {
    state.enemies.push(
      spawnEnemy(state, kind, random, 1 + state.endlessRound * 0.045),
    );
    state.spawnBudgetRemaining -= cost;
  }
  state.spawnCooldown = Math.max(0.24, 0.72 - state.endlessRound * 0.025) * (0.7 + random() * 0.5);
}
