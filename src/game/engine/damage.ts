import type { Enemy, GameState } from "../types.ts";
import { burstParticles } from "./combat.ts";
import { clearRetainedPowerups } from "./powerups.ts";

export function damagePlayer(state: GameState, amount: number, reason: string) {
  if (state.activePowerups.shieldFor > 0 && state.activePowerups.shieldHits > 0) {
    state.shieldBlocks += 1;
    state.activePowerups.shieldHits -= 1;
    if (state.activePowerups.shieldHits === 0) state.activePowerups.shieldFor = 0;
    burstParticles(state, state.player.x, state.player.y, "#65d6e8", 24);
  } else if (state.player.shield > 0) {
    state.shieldBlocks += 1;
    state.player.shield -= 1;
  } else {
    state.player.health -= amount;
  }
  clearRetainedPowerups(state);
  state.noDamage = false;
  state.comboTimer = 0;
  state.player.invulnerableFor = 1.05;
  state.player.hitFlashFor = 1.05;
  state.screenShake = 0.85;
  burstParticles(state, state.player.x, state.player.y, "#ff647c", 14);
  if (state.player.health <= 0) {
    state.player.health = 0;
    state.phase = "gameOver";
    state.gameOverReason = reason;
    state.banner = "Library overrun";
  }
}

// Preserve one signature wall without scaling health to the player's loadout.
export function damageEnemy(state: GameState, enemy: Enemy, amount: number) {
  if (enemy.bossKind === "backfill-daemon" && state.phase === "miniboss") {
    if (state.minibossIntroStage < 8 || state.backfillShielded) return;
    const threshold = enemy.maxHealth * 0.66;
    if (
      !state.backfillWallCompleted && enemy.health > threshold && enemy.health - amount <= threshold
    ) {
      enemy.health = threshold;
      state.backfillShielded = true;
      state.backfillWallCooldown = 0;
      return;
    }
  }
  enemy.health -= amount;
}
