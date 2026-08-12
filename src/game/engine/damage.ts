import type { GameState } from "../types.ts";
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
  state.screenShake = 0.85;
  burstParticles(state, state.player.x, state.player.y, "#ff647c", 14);
  if (state.player.health <= 0) {
    state.player.health = 0;
    state.phase = "gameOver";
    state.gameOverReason = reason;
    state.banner = "Library overrun";
  }
}
