import { ACTS } from "../content.ts";
import type { EncounterDefinition, GameState } from "../types.ts";
import { BACKLOG_BOSS_HITS } from "./config.ts";
import { clamp } from "./geometry.ts";

export function getCurrentEncounter(state: GameState): EncounterDefinition | null {
  if (state.phase === "endless") return null;
  return ACTS[state.actIndex]?.encounters[state.encounterIndex] ?? null;
}

export function getObjectiveLabel(state: GameState) {
  if (
    state.phase !== "encounter" &&
    state.phase !== "miniboss" &&
    state.phase !== "boss" &&
    state.phase !== "endless"
  ) return "";

  if (state.phase === "boss" || state.phase === "miniboss") {
    if (state.phase === "miniboss" && state.minibossDefeatFor > 0) {
      return "Process terminated";
    }
    const boss = state.enemies.find((enemy) => enemy.kind === "boss");
    if (state.phase === "boss" && boss?.bossKind === "backlog") {
      return `Backlog ${state.backlogHits} / ${BACKLOG_BOSS_HITS} episodes purged`;
    }
    const label = state.phase === "miniboss" ? "Miniboss" : "Boss";
    return boss ? `${label} integrity ${Math.max(0, Math.ceil(boss.health))}` : `${label} incoming`;
  }

  if (state.phase === "endless") return `Round ${state.endlessRound}`;
  const encounter = getCurrentEncounter(state);
  if (!encounter) return "";
  if (encounter.objective === "purge") {
    return `${Math.floor(state.objectiveProgress)} / ${state.objectiveTarget} GB`;
  }
  if (encounter.objective === "relay") {
    const seconds = state.relayCache ? Math.max(0, state.relayCache.timeRemaining).toFixed(1) : "—";
    return `${Math.floor(state.objectiveProgress)} / ${state.objectiveTarget} caches · ${seconds}s`;
  }
  return `${Math.max(0, Math.ceil(state.objectiveTarget - state.objectiveProgress))}s remaining`;
}

export function getActProgress(state: GameState) {
  if (state.phase === "boss") return 1;
  if (state.phase === "miniboss") return 0.5;
  if (state.phase === "actComplete" || state.phase === "victory") return 1;
  return clamp(
    (state.encounterIndex + state.objectiveProgress / Math.max(1, state.objectiveTarget)) / 4,
    0,
    1,
  );
}
