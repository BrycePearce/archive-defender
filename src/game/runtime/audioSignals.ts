import type { ArcadeAudio } from "../audio.ts";
import type { GamePhase, GameState } from "../types.ts";

export interface ArcadeSignals {
  phase: GamePhase;
  health: number;
  score: number;
  kills: number;
  enemyHits: number;
  shieldBlocks: number;
  bossPhaseChanges: number;
  minibossDefeatFor: number;
  minibossFightStarts: number;
  backlogFightStarts: number;
  bossImpactCues: number;
  dialogueText: string;
  projectileId: number;
  dashCooldown: number;
  warningCount: number;
  secondaryCooldown: number;
  reloadFor: number;
  powerupCount: number;
  powerupsCollected: number;
  endlessRound: number;
  upgradeTargetCount: number;
}

export function initialArcadeSignals(): ArcadeSignals {
  return {
    phase: "title",
    health: 3,
    score: 0,
    kills: 0,
    enemyHits: 0,
    shieldBlocks: 0,
    bossPhaseChanges: 0,
    minibossDefeatFor: 0,
    minibossFightStarts: 0,
    backlogFightStarts: 0,
    bossImpactCues: 0,
    dialogueText: "",
    projectileId: 1,
    dashCooldown: 0,
    warningCount: 0,
    secondaryCooldown: 0,
    reloadFor: 0,
    powerupCount: 0,
    powerupsCollected: 0,
    endlessRound: 0,
    upgradeTargetCount: 0,
  };
}

export function captureArcadeSignals(state: GameState): ArcadeSignals {
  return {
    phase: state.phase,
    health: state.player.health,
    score: state.score,
    kills: state.kills,
    enemyHits: state.enemyHits,
    shieldBlocks: state.shieldBlocks,
    bossPhaseChanges: state.bossPhaseChanges,
    minibossDefeatFor: state.minibossDefeatFor,
    minibossFightStarts: state.minibossFightStarts,
    backlogFightStarts: state.backlogFightStarts,
    bossImpactCues: state.bossImpactCues,
    dialogueText: state.bossDialogue?.text ?? "",
    projectileId: state.nextProjectileId,
    dashCooldown: state.player.dashCooldown,
    warningCount: state.enemies.filter((enemy) => enemy.warningFor > 0).length +
      state.hazards.filter((hazard) => hazard.armFor > 0).length,
    secondaryCooldown: state.player.secondaryCooldown,
    reloadFor: state.player.reloadFor,
    powerupCount: Number(state.activePowerups.reflect > 0) +
      Number(state.activePowerups.prism > 0) +
      Number(state.activePowerups.shieldFor > 0) +
      Number(state.activePowerups.freezeFor > 0) +
      Number(state.singularity !== null) +
      Number(state.temporaryWeapon !== null),
    powerupsCollected: state.powerupsCollected,
    endlessRound: state.endlessRound,
    upgradeTargetCount: state.upgradeTargets.length,
  };
}

export function syncArcadeAudioSignals(
  audio: ArcadeAudio,
  state: GameState,
  previous: ArcadeSignals,
) {
  const current = captureArcadeSignals(state);
  if (state.phase === "endless" && current.endlessRound !== previous.endlessRound) {
    audio.startFor(state.actIndex, state.phase, state.endlessRound);
  }
  if (current.health < previous.health) audio.playSfx("damage");
  if (current.shieldBlocks > previous.shieldBlocks) audio.playSfx("shield");
  const defeatedEnemy = current.kills > previous.kills;
  if (current.enemyHits > previous.enemyHits && !defeatedEnemy) audio.playSfx("hit");
  if (defeatedEnemy && previous.phase !== "boss" && previous.phase !== "miniboss") {
    audio.playSfx("enemy-defeat");
  }
  if (current.projectileId > previous.projectileId) {
    audio.playSfx(
      state.temporaryWeapon?.kind === "machine-gun"
        ? "machine-fire"
        : state.temporaryWeapon?.kind === "super-shot"
        ? "super-fire"
        : "fire",
    );
  }
  if (current.dashCooldown > previous.dashCooldown + 0.5) audio.playSfx("dash");
  if (current.secondaryCooldown > previous.secondaryCooldown + 4) audio.playSfx("beam");
  if (current.reloadFor > previous.reloadFor + 0.4) audio.playSfx("reload");
  if (current.powerupsCollected > previous.powerupsCollected) audio.playSfx("powerup");
  if (
    previous.upgradeTargetCount > 0 && current.upgradeTargetCount === 0 && state.phase === "reward"
  ) {
    audio.playSfx("select");
  }
  if (current.warningCount > previous.warningCount) audio.playSfx("warning");
  if (current.bossPhaseChanges > previous.bossPhaseChanges) audio.playSfx("boss-phase");
  if (current.bossImpactCues > previous.bossImpactCues) audio.playSfx("never");
  if (
    current.minibossFightStarts > previous.minibossFightStarts ||
    current.backlogFightStarts > previous.backlogFightStarts
  ) audio.startFor(state.actIndex, state.phase, state.endlessRound);
  if (current.minibossDefeatFor > previous.minibossDefeatFor) audio.playSfx("boss-defeat");
  if (current.dialogueText && current.dialogueText !== previous.dialogueText) {
    audio.playSfx("talk");
  }
  return current;
}
