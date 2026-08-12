import type { GameState } from "../types.ts";
import { PLAYER_RADIUS } from "./config.ts";
import { clamp } from "./geometry.ts";

export function resizeGameState(state: GameState, width: number, height: number) {
  const previousWidth = Math.max(1, state.width);
  const previousHeight = Math.max(1, state.height);
  const scaleX = width / previousWidth;
  const scaleY = height / previousHeight;
  state.width = width;
  state.height = height;
  state.player.x = clamp(state.player.x * scaleX, PLAYER_RADIUS, width - PLAYER_RADIUS);
  state.player.y = clamp(state.player.y * scaleY, PLAYER_RADIUS, height - PLAYER_RADIUS);
  for (const enemy of state.enemies) {
    enemy.x = clamp(enemy.x * scaleX, -enemy.radius, width + enemy.radius);
    enemy.y = clamp(enemy.y * scaleY, -enemy.radius, height + enemy.radius);
  }
  for (const hazard of state.hazards) {
    hazard.x = clamp(hazard.x * scaleX, 0, width);
    hazard.y = clamp(hazard.y * scaleY, 0, height);
  }
  for (const tile of state.backlogTiles) {
    tile.x *= scaleX;
    tile.anchorX *= scaleX;
    tile.y *= scaleY;
    tile.width *= scaleX;
    tile.height *= scaleY;
  }
  for (const bomb of state.backlogBombs) {
    bomb.x = clamp(bomb.x * scaleX, 0, width);
    bomb.y = clamp(bomb.y * scaleY, 0, height);
    bomb.previousX *= scaleX;
    bomb.previousY *= scaleY;
  }
  state.backlogFirewallGaps = state.backlogFirewallGaps.map((gap) => gap * scaleX);
}
