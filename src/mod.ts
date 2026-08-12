"use client";

export { ArcadeGame } from "./game/ArcadeGame.tsx";
export type { ArcadeGameProps } from "./game/ArcadeGame.tsx";
export type { ArcadeAudioStart, ArcadeGameOptions, ArcadeStartup } from "./game/runtime/options.ts";
export type { GameSummary } from "./game/runtime/summary.ts";
export type { ArcadePersistenceOptions } from "./game/persistence.ts";
export { createDefaultSave, readArcadeSave, writeArcadeSave } from "./game/persistence.ts";
export type { ArcadeSaveV2, ArcadeSettings, DifficultyMode, WeaponKind } from "./game/types.ts";
