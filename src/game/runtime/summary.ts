import { getActProgress, getObjectiveLabel } from "../engine.ts";
import type { DifficultyMode, GamePhase, GameState, WeaponKind } from "../types.ts";

export interface GameSummary {
  phase: GamePhase;
  actIndex: number;
  encounterIndex: number;
  endlessRound: number;
  score: number;
  health: number;
  maxHealth: number;
  shield: number;
  comboCount: number;
  comboMultiplier: number;
  dashCooldown: number;
  ammo: number;
  magazineSize: number;
  magazineLabel: string;
  reloadFor: number;
  secondaryCooldown: number;
  powerups: Array<{ label: string; remaining: number }>;
  objective: string;
  actProgress: number;
  banner: string;
  weapon: WeaponKind;
  mode: DifficultyMode;
  noDamage: boolean;
  gameOverReason?: string;
}

export const INITIAL_SUMMARY: GameSummary = {
  phase: "title",
  actIndex: 0,
  encounterIndex: 0,
  endlessRound: 0,
  score: 0,
  health: 3,
  maxHealth: 3,
  shield: 0,
  comboCount: 0,
  comboMultiplier: 1,
  dashCooldown: 0,
  ammo: 14,
  magazineSize: 14,
  magazineLabel: "Magazine",
  reloadFor: 0,
  secondaryCooldown: 0,
  powerups: [],
  objective: "",
  actProgress: 0,
  banner: "",
  weapon: "blaster",
  mode: "normal",
  noDamage: true,
};

export function summarizeGame(state: GameState): GameSummary {
  return {
    phase: state.phase,
    actIndex: state.actIndex,
    encounterIndex: state.encounterIndex,
    endlessRound: state.endlessRound,
    score: state.score,
    health: state.player.health,
    maxHealth: state.player.maxHealth,
    shield: state.player.shield,
    comboCount: state.comboCount,
    comboMultiplier: state.comboMultiplier,
    dashCooldown: state.player.dashCooldown,
    ammo: state.temporaryWeapon?.ammo ?? state.player.ammo,
    magazineSize: state.temporaryWeapon?.kind === "machine-gun"
      ? 48
      : state.temporaryWeapon?.kind === "super-shot"
      ? 8
      : state.player.magazineSize,
    magazineLabel: state.temporaryWeapon?.kind === "machine-gun"
      ? "Machine Gun"
      : state.temporaryWeapon?.kind === "super-shot"
      ? "Super Shot"
      : "Magazine",
    reloadFor: state.player.reloadFor,
    secondaryCooldown: state.player.secondaryCooldown,
    powerups: [
      state.activePowerups.reflect > 0 ? { label: "Reflect", remaining: -1 } : null,
      state.activePowerups.prism > 0 ? { label: "Prism", remaining: -1 } : null,
      state.activePowerups.shieldFor > 0 ? { label: "Shield", remaining: -1 } : null,
      state.activePowerups.freezeFor > 0
        ? { label: "Paused", remaining: state.activePowerups.freezeFor }
        : null,
      state.singularity ? { label: "Vacuum", remaining: state.singularity.life } : null,
    ].filter(
      (powerup): powerup is { label: string; remaining: number } => powerup !== null,
    ),
    objective: getObjectiveLabel(state),
    actProgress: getActProgress(state),
    banner: state.banner,
    weapon: state.weapon,
    mode: state.mode,
    noDamage: state.noDamage,
    gameOverReason: state.gameOverReason,
  };
}
