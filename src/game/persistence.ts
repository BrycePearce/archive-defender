import type {
  ArcadeCheckpoint,
  ArcadeSaveV2,
  ArcadeSettings,
  DifficultyMode,
  GameState,
  StorageLike,
  UpgradeId,
  WeaponKind,
} from "./types.ts";
import { UPGRADES } from "./content.ts";
import { ARCADE_SAVE_KEY } from "./runtime/storage.ts";

export { ARCADE_SAVE_KEY };

export interface ArcadePersistenceOptions {
  storage?: StorageLike | null;
  key?: string;
  defaults?: ArcadeSaveV2;
}

export const DEFAULT_ARCADE_SETTINGS: ArcadeSettings = {
  musicEnabled: true,
  sfxEnabled: true,
  musicVolume: 28,
  sfxVolume: 42,
  reducedEffects: false,
  screenShake: true,
};

export function createDefaultSave(): ArcadeSaveV2 {
  return {
    version: 2,
    settings: { ...DEFAULT_ARCADE_SETTINGS },
    unlocks: { rail: false, array: false, hard: false, endless: false },
    bestScores: { normal: 0, hard: 0 },
    victories: { normal: 0, hard: 0 },
    achievements: [],
    checkpoint: null,
  };
}

export function readArcadeSave(options: ArcadePersistenceOptions = {}): ArcadeSaveV2 {
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  const key = options.key ?? ARCADE_SAVE_KEY;
  const fallback = structuredClone(options.defaults ?? createDefaultSave());
  if (!storage) return fallback;

  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "null");
    if (isSaveV2(parsed)) return normalizeSave(parsed);
  } catch {
    // A blocked or corrupt storage API must never prevent the route from mounting.
  }
  return fallback;
}

export function writeArcadeSave(
  save: ArcadeSaveV2,
  options: ArcadePersistenceOptions = {},
) {
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  const key = options.key ?? ARCADE_SAVE_KEY;
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(normalizeSave(save)));
  } catch {
    // Progress is optional. The game remains fully playable without persistence.
  }
}

export function checkpointFromState(state: GameState): ArcadeCheckpoint {
  return {
    seed: state.seed,
    mode: state.mode,
    actIndex: state.actIndex,
    weapon: state.weapon,
    score: state.score,
    upgrades: { ...state.upgrades },
    maxHealth: state.player.maxHealth,
    health: state.player.health,
    shield: state.player.shield,
  };
}

export function recordScore(save: ArcadeSaveV2, mode: DifficultyMode, score: number) {
  save.bestScores[mode] = Math.max(save.bestScores[mode], Math.max(0, Math.floor(score)));
}

function safeStorage(): StorageLike | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function isSaveV2(value: unknown): value is ArcadeSaveV2 {
  return isRecord(value) && value.version === 2;
}

function normalizeSave(value: ArcadeSaveV2): ArcadeSaveV2 {
  const defaults = createDefaultSave();
  const settings: Record<string, unknown> = isRecord(value.settings) ? value.settings : {};
  const unlocks: Record<string, unknown> = isRecord(value.unlocks) ? value.unlocks : {};
  const scores: Record<string, unknown> = isRecord(value.bestScores) ? value.bestScores : {};
  const victories: Record<string, unknown> = isRecord(value.victories) ? value.victories : {};

  return {
    version: 2,
    settings: {
      musicEnabled: booleanValue(settings.musicEnabled, defaults.settings.musicEnabled),
      sfxEnabled: booleanValue(settings.sfxEnabled, defaults.settings.sfxEnabled),
      musicVolume: clamp(finiteNumber(settings.musicVolume, 28), 0, 100),
      sfxVolume: clamp(finiteNumber(settings.sfxVolume, 42), 0, 100),
      reducedEffects: booleanValue(settings.reducedEffects, false),
      screenShake: booleanValue(settings.screenShake, true),
    },
    unlocks: {
      rail: booleanValue(unlocks.rail, false),
      array: booleanValue(unlocks.array, false),
      hard: booleanValue(unlocks.hard, false),
      endless: booleanValue(unlocks.endless, false),
    },
    bestScores: {
      normal: Math.max(0, Math.floor(finiteNumber(scores.normal, 0))),
      hard: Math.max(0, Math.floor(finiteNumber(scores.hard, 0))),
    },
    victories: {
      normal: Math.max(0, Math.floor(finiteNumber(victories.normal, 0))),
      hard: Math.max(0, Math.floor(finiteNumber(victories.hard, 0))),
    },
    achievements: Array.isArray(value.achievements)
      ? value.achievements.filter((item): item is string => typeof item === "string").slice(0, 64)
      : [],
    checkpoint: normalizeCheckpoint(value.checkpoint),
  };
}

function normalizeCheckpoint(value: unknown): ArcadeCheckpoint | null {
  if (!isRecord(value)) return null;
  const mode = value.mode === "hard" ? "hard" : value.mode === "normal" ? "normal" : null;
  const weapon = isWeapon(value.weapon) ? value.weapon : null;
  const actIndex = Math.floor(finiteNumber(value.actIndex, -1));
  if (!mode || !weapon || actIndex < 0 || actIndex > 2) return null;

  const validUpgradeIds = new Set(UPGRADES.map((upgrade) => upgrade.id));
  const upgrades: Partial<Record<UpgradeId, number>> = {};
  if (isRecord(value.upgrades)) {
    for (const [id, level] of Object.entries(value.upgrades)) {
      if (!validUpgradeIds.has(id as UpgradeId)) continue;
      const definition = UPGRADES.find((upgrade) => upgrade.id === id);
      upgrades[id as UpgradeId] = clamp(
        Math.floor(finiteNumber(level, 0)),
        0,
        definition?.maxLevel ?? 0,
      );
    }
  }

  const maxHealth = clamp(Math.floor(finiteNumber(value.maxHealth, 3)), 1, 8);
  return {
    seed: Math.floor(finiteNumber(value.seed, 1)) >>> 0,
    mode,
    actIndex,
    weapon,
    score: Math.max(0, Math.floor(finiteNumber(value.score, 0))),
    upgrades,
    maxHealth,
    health: clamp(Math.floor(finiteNumber(value.health, maxHealth)), 1, maxHealth),
    shield: clamp(Math.floor(finiteNumber(value.shield, 0)), 0, 3),
  };
}

function isWeapon(value: unknown): value is WeaponKind {
  return value === "blaster" || value === "rail" || value === "array";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
