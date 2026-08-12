import type { ArcadePersistenceOptions } from "../persistence.ts";
import type { GameSummary } from "./summary.ts";
import type { ArcadeSettings, DifficultyMode, GamePhase, WeaponKind } from "../types.ts";

export type ArcadeStartup = "title" | "new-run" | "resume" | "resume-or-new";
export type ArcadeAudioStart = "interaction" | "immediate";

export interface ArcadeGameOptions {
  startup?: ArcadeStartup;
  audioStart?: ArcadeAudioStart;
  initialMode?: DifficultyMode;
  initialWeapon?: WeaponKind;
  initialSettings?: Partial<ArcadeSettings>;
  persistence?: false | ArcadePersistenceOptions;
  pauseOnBlur?: boolean;
  pauseWhenHidden?: boolean;
  onPhaseChange?: (summary: GameSummary, previousPhase: GamePhase) => void;
  onRunStart?: (summary: GameSummary) => void;
  onGameOver?: (summary: GameSummary) => void;
  onVictory?: (summary: GameSummary) => void;
}
