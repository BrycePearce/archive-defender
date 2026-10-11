import { ACTS } from "../content.ts";
import { BACKLOG_BOSS_HITS, BACKLOG_MAZE_WALL_COUNT } from "../engine/config.ts";
import type { BacklogBomb, Enemy, GameState } from "../types.ts";

export function drawBacklogBoss(
  context: CanvasRenderingContext2D,
  state: GameState,
  boss: Enemy,
  reducedEffects: boolean,
) {
  const damage = Math.min(2, state.backlogHits);
  const radius = boss.radius;
  const hot = damage === 2;
  const accent = hot ? "#ff7c70" : "#f8d477";
  context.save();
  context.translate(boss.x, boss.y);
  context.scale(radius, radius);
  context.lineJoin = "round";
  context.lineCap = "round";

  // The chassis survives each hit; its armor does not regenerate with the board.
  context.fillStyle = "#182c35";
  context.strokeStyle = "#76919c";
  context.lineWidth = 0.045;
  context.beginPath();
  context.roundRect(-0.69, -0.78, 1.38, 1.56, 0.17);
  context.fill();
  context.stroke();
  for (const side of [-1, 1]) {
    context.strokeStyle = "#49616c";
    context.lineWidth = 0.055;
    context.beginPath();
    context.moveTo(side * 0.43, -0.6);
    context.lineTo(side * 0.58, -0.36);
    context.lineTo(side * 0.46, 0.46);
    context.lineTo(side * 0.26, 0.66);
    context.stroke();
  }

  // Exposed lower core and drive ribs are revealed as the casing breaks away.
  context.fillStyle = "#07101a";
  context.beginPath();
  context.roundRect(-0.4, 0.2, 0.8, 0.43, 0.08);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 0.035;
  for (let index = 0; index < 4; index++) {
    const x = -0.25 + index * 0.165;
    context.beginPath();
    context.moveTo(x, 0.29);
    context.lineTo(x, 0.52);
    context.stroke();
  }

  for (let plate = 0; plate < 6; plate++) {
    if ((damage >= 1 && plate === 1) || (hot && (plate === 3 || plate === 4))) continue;
    const angle = plate * Math.PI / 3 - Math.PI / 2;
    context.save();
    context.rotate(angle);
    context.fillStyle = damage ? "#67432e" : "#88552f";
    context.strokeStyle = damage ? "#e89c62" : "#ffd09a";
    context.lineWidth = 0.04;
    context.beginPath();
    context.moveTo(0.51, -0.28);
    context.lineTo(0.79, -0.35);
    context.lineTo(0.98, -0.14);
    context.lineTo(0.91, 0.25);
    context.lineTo(0.58, 0.3);
    context.closePath();
    context.fill();
    context.stroke();
    if (damage > 0) {
      context.strokeStyle = "#ffe0a3";
      context.lineWidth = 0.025;
      context.beginPath();
      context.moveTo(0.84, -0.3);
      context.lineTo(0.71, -0.07);
      context.lineTo(0.83, 0.02);
      context.lineTo(0.68, 0.26);
      context.stroke();
    }
    context.restore();
  }

  // A legible face stays upright while the final damaged eye searches frantically.
  context.fillStyle = "#07101a";
  context.strokeStyle = accent;
  context.lineWidth = 0.035;
  context.beginPath();
  context.roundRect(-0.48, -0.43, 0.96, 0.58, 0.12);
  context.fill();
  context.stroke();
  const eyeShift = hot && !reducedEffects ? Math.sin(state.elapsed * 9) * 0.04 : 0;
  context.fillStyle = accent;
  context.fillRect(-0.32 + eyeShift, hot ? -0.33 : -0.25, 0.17, hot ? 0.2 : 0.09);
  context.fillRect(0.15 + eyeShift, -0.25, 0.17, hot ? 0.15 : 0.09);
  context.beginPath();
  context.moveTo(-0.3, -0.04);
  context.lineTo(-0.15, hot ? -0.08 : 0.01);
  context.lineTo(0, hot ? 0.02 : 0.01);
  context.lineTo(0.15, hot ? -0.08 : 0.01);
  context.lineTo(0.3, -0.04);
  context.stroke();

  if (damage > 0) {
    // Broken cables remain visible with reduced effects; only sparks animate.
    context.strokeStyle = "#70dff2";
    context.lineWidth = 0.035;
    context.beginPath();
    context.moveTo(0.59, -0.37);
    context.lineTo(0.82, -0.48);
    context.lineTo(0.75, -0.68);
    if (hot) {
      context.moveTo(-0.32, 0.62);
      context.lineTo(-0.48, 0.82);
      context.lineTo(-0.35, 0.94);
    }
    context.stroke();
    if (!reducedEffects && Math.sin(state.elapsed * 7) > 0.65) {
      context.strokeStyle = "#fff0bd";
      context.beginPath();
      context.moveTo(0.78, -0.72);
      context.lineTo(0.82, -0.82);
      context.moveTo(0.87, -0.63);
      context.lineTo(0.97, -0.67);
      context.stroke();
    }
  }
  if (state.activePowerups.freezeFor > 0) {
    context.strokeStyle = "#b9f4ff";
    context.lineWidth = 0.045;
    context.beginPath();
    context.arc(0, 0, 1.08, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

export function drawBacklogTiles(
  context: CanvasRenderingContext2D,
  state: GameState,
) {
  if (state.phase !== "boss" || state.backlogTiles.length === 0) return;
  const labels = ["WATCH", "LATER", "UNPLAYED", "4K", "REMUX", "EXTRAS", "S01", "FINAL"];
  for (const tile of state.backlogTiles) {
    const entranceOffset = tile.entranceFor > 0 ? Math.min(220, tile.entranceFor * 132) : 0;
    const y = tile.y - entranceOffset;
    if (y + tile.height < 0) continue;
    const healthRatio = Math.max(0, tile.health / tile.maxHealth);
    const target = state.backlogIntroStage >= 5 &&
      state.backlogIntermissionStage === 0 &&
      tile.column === state.backlogTargetColumn;
    const ignited = state.backlogIntermissionStage === 1;
    context.save();
    context.translate(tile.x, y);
    context.fillStyle = ignited
      ? `rgba(105, 31, 12, ${0.78 + Math.sin(state.elapsed * 18) * 0.12})`
      : target
      ? `rgba(100, 27, 38, ${0.78 + healthRatio * 0.16})`
      : tile.special === "cache"
      ? `rgba(24, 92, 71, ${0.76 + healthRatio * 0.18})`
      : tile.special === "duplicate"
      ? `rgba(91, 30, 69, ${0.76 + healthRatio * 0.18})`
      : tile.drop === "repair"
      ? `rgba(25, 91, 69, ${0.74 + healthRatio * 0.18})`
      : tile.drop === "powerup"
      ? `rgba(79, 43, 113, ${0.74 + healthRatio * 0.18})`
      : tile.drop === "enemy"
      ? `rgba(103, 31, 68, ${0.74 + healthRatio * 0.18})`
      : tile.drop === "bomb"
      ? `rgba(103, 71, 19, ${0.74 + healthRatio * 0.18})`
      : tile.collector
      ? `rgba(96, 65, 18, ${0.72 + healthRatio * 0.2})`
      : `rgba(16, 57, 67, ${0.68 + healthRatio * 0.2})`;
    context.strokeStyle = ignited
      ? "#ff9b54"
      : target
      ? "#ff647c"
      : tile.special === "cache"
      ? "#71f6bd"
      : tile.special === "duplicate"
      ? "#ff7eb6"
      : tile.drop === "repair"
      ? "#76e0c1"
      : tile.drop === "powerup"
      ? "#c895ff"
      : tile.drop === "enemy"
      ? "#ff7eb6"
      : tile.drop === "bomb"
      ? "#f8d477"
      : tile.collector
      ? "#f8d477"
      : "#70dff2";
    context.lineWidth = ignited || target || tile.collector || tile.special || tile.drop
      ? 2.5
      : 1.5;
    context.shadowColor = ignited
      ? "#ff642f"
      : target
      ? "#ff647c"
      : tile.special === "cache"
      ? "#71f6bd"
      : tile.special === "duplicate"
      ? "#ff7eb6"
      : tile.drop === "repair"
      ? "#76e0c1"
      : tile.drop === "powerup"
      ? "#c895ff"
      : tile.drop === "enemy"
      ? "#ff7eb6"
      : tile.drop === "bomb"
      ? "#f8d477"
      : tile.collector
      ? "#f8d477"
      : "transparent";
    context.shadowBlur = ignited || target || tile.collector || tile.special || tile.drop ? 8 : 0;
    context.beginPath();
    context.roundRect(-tile.width / 2, -tile.height / 2, tile.width, tile.height, 4);
    context.fill();
    context.stroke();
    context.shadowBlur = 0;
    context.fillStyle = ignited
      ? "#fff0bd"
      : target
      ? "#ffd5dc"
      : tile.special === "cache"
      ? "#d8fff0"
      : tile.special === "duplicate"
      ? "#ffe0f0"
      : tile.drop === "repair"
      ? "#dcfff4"
      : tile.drop === "powerup"
      ? "#f0ddff"
      : tile.drop === "enemy"
      ? "#ffe0f0"
      : tile.drop === "bomb"
      ? "#fff0bd"
      : tile.collector
      ? "#ffe8ad"
      : "#d8fbff";
    context.font = "800 7px ui-monospace, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      ignited
        ? "RETENTION"
        : target
        ? "KEEP"
        : tile.special === "cache"
        ? "CACHE"
        : tile.special === "duplicate"
        ? "DUPLICATE"
        : tile.drop === "repair"
        ? "+1 HP"
        : tile.drop === "powerup"
        ? "BONUS"
        : tile.drop === "enemy"
        ? "RESTORE"
        : tile.drop === "bomb"
        ? "MULTIBALL"
        : labels[(tile.column + tile.row * 2) % labels.length],
      0,
      0,
    );
    if (healthRatio < 0.72) {
      context.strokeStyle = "rgba(255, 255, 255, 0.55)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(-tile.width * 0.12, -tile.height / 2);
      context.lineTo(1, -2);
      context.lineTo(-5, tile.height / 2);
      context.stroke();
      if (healthRatio < 0.45) {
        context.beginPath();
        context.moveTo(tile.width * 0.32, -tile.height / 2);
        context.lineTo(tile.width * 0.12, 1);
        context.lineTo(tile.width * 0.27, tile.height / 2);
        context.stroke();
      }
    }
    context.restore();
  }
}

export function drawBacklogBomb(
  context: CanvasRenderingContext2D,
  state: GameState,
  bomb: BacklogBomb,
) {
  context.save();
  const lobProgress = bomb.lobDuration > 0 ? 1 - bomb.lobFor / bomb.lobDuration : 1;
  const lobLift = bomb.lobFor > 0 ? Math.sin(lobProgress * Math.PI) * 54 : 0;
  if (bomb.lobFor > 0) {
    context.fillStyle = `rgba(0, 0, 0, ${0.34 - lobLift / 300})`;
    context.beginPath();
    context.ellipse(bomb.x, bomb.y, 13 + lobLift * 0.08, 5, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.translate(bomb.x, bomb.y - lobLift);
  const unstableGold = bomb.kind === "returnable" && bomb.life < 3;
  const fuseProgress = unstableGold ? 1 - Math.max(0, bomb.life) / 3 : 0;
  const flashRed = unstableGold &&
    Math.sin(state.elapsed * (13 + fuseProgress * 25)) > 0;
  const urgent = (bomb.kind === "red" && bomb.life < 0.85) || unstableGold;
  const pulse = 1 + Math.sin(state.elapsed * (urgent ? 26 : 11)) * (urgent ? 0.24 : 0.1);
  context.scale(pulse, pulse);
  const color = bomb.kind === "red" || flashRed ? "#ff3e5f" : bomb.returned ? "#70dff2" : "#f8d477";
  context.fillStyle = color;
  context.strokeStyle = "#fffbe0";
  context.shadowColor = color;
  context.shadowBlur = urgent ? 28 : 18;
  context.lineWidth = 3;
  context.beginPath();
  context.arc(0, 0, bomb.radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.shadowBlur = 0;
  context.fillStyle = "#19080c";
  context.font = "900 10px ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(bomb.kind === "red" || unstableGold ? "!" : "R", 0, 1);
  context.scale(1 / pulse, 1 / pulse);
  context.fillStyle = color;
  context.font = "900 8px ui-monospace, monospace";
  if (bomb.lobFor <= 0 && ((!bomb.returned && !unstableGold) || bomb.kind === "red")) {
    context.fillText(
      bomb.kind === "red" ? (urgent ? "MOVE!" : "") : "RETURN",
      0,
      bomb.radius + 15,
    );
  }
  if ((bomb.kind === "red" && urgent) || unstableGold) {
    context.strokeStyle = `rgba(255, 62, 95, ${0.45 + Math.sin(state.elapsed * 26) * 0.25})`;
    context.setLineDash([5, 5]);
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, bomb.kind === "returnable" ? 86 : 76, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

export function drawBacklogIntegrity(
  context: CanvasRenderingContext2D,
  state: GameState,
  width: number,
) {
  if (state.phase !== "boss" || ACTS[state.actIndex]?.boss.kind !== "backlog") return;
  context.save();
  context.font = "800 8px ui-monospace, monospace";
  context.textAlign = "center";
  context.fillStyle = "rgba(255, 232, 173, 0.8)";
  context.fillText("ARCHIVE INTEGRITY", width / 2, 14);
  const pipWidth = 22;
  const gap = 5;
  const total = pipWidth * BACKLOG_BOSS_HITS + gap * (BACKLOG_BOSS_HITS - 1);
  for (let index = 0; index < BACKLOG_BOSS_HITS; index++) {
    const x = width / 2 - total / 2 + index * (pipWidth + gap);
    const cleared = index < state.backlogHits;
    context.fillStyle = cleared ? "rgba(112, 223, 242, 0.12)" : "rgba(243, 166, 90, 0.62)";
    context.strokeStyle = cleared ? "rgba(112, 223, 242, 0.48)" : "#f8d477";
    context.lineWidth = 1.5;
    context.fillRect(x, 20, pipWidth, 6);
    context.strokeRect(x, 20, pipWidth, 6);
  }
  context.restore();
}

export function drawBacklogRetaliationWarning(
  context: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number,
  reducedEffects: boolean,
) {
  if (state.backlogRetaliationAngle === null || state.backlogRetaliationFor <= 0) return;
  const boss = state.enemies.find((enemy) => enemy.bossKind === "backlog" && enemy.health > 0);
  if (!boss) return;
  const angle = state.backlogRetaliationAngle;
  const shots = state.backlogMazeWallIndex >= BACKLOG_MAZE_WALL_COUNT ? 5 : 3;
  const reach = Math.hypot(width, height);
  const spread = ((shots - 1) / 2) * 0.16 + 0.025;
  context.save();
  context.translate(boss.x, boss.y);
  context.rotate(angle);
  context.fillStyle = "rgba(255, 100, 124, 0.09)";
  context.beginPath();
  context.moveTo(0, 0);
  context.arc(0, 0, reach, -spread, spread);
  context.closePath();
  context.fill();
  context.strokeStyle = reducedEffects
    ? "rgba(255, 154, 169, 0.8)"
    : `rgba(255, 154, 169, ${0.65 + Math.sin(state.elapsed * 12) * 0.15})`;
  context.lineWidth = 1.5;
  context.setLineDash([8, 7]);
  for (let index = 0; index < shots; index++) {
    const direction = (index - (shots - 1) / 2) * 0.16;
    context.beginPath();
    context.moveTo(Math.cos(direction) * boss.radius, Math.sin(direction) * boss.radius);
    context.lineTo(Math.cos(direction) * reach, Math.sin(direction) * reach);
    context.stroke();
  }
  context.restore();
}

export function drawBacklogFirewallWarning(
  context: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number,
) {
  if (state.backlogFirewallWarningFor <= 0) return;
  const pulse = 0.28 + Math.sin(state.elapsed * 20) * 0.12;
  const double = state.backlogRebuildAfterWall && state.backlogHits >= 2;
  const gapWall = state.backlogHits === 2;
  context.save();
  context.fillStyle = `rgba(243, 166, 90, ${pulse})`;
  context.strokeStyle = "#f8d477";
  context.lineWidth = 3;
  context.setLineDash([9, 6]);
  if (gapWall) {
    const gapHalf = 32;
    state.backlogFirewallGaps.forEach((gap, layer) => {
      const y = 2 + layer * 4;
      const left = gap - gapHalf;
      const right = gap + gapHalf;
      context.fillRect(0, y, left, 3);
      context.fillRect(right, y, width - right, 3);
      context.strokeStyle = "#70dff2";
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(left, y - 1);
      context.lineTo(left, y + 4);
      context.moveTo(right, y - 1);
      context.lineTo(right, y + 4);
      context.stroke();
    });
  } else {
    context.fillRect(0, 0, width, 20);
    context.fillRect(width - 20, 0, 20, height);
    context.beginPath();
    context.moveTo(0, 22);
    context.lineTo(width, 22);
    context.moveTo(width - 22, 0);
    context.lineTo(width - 22, height);
    context.stroke();
  }
  context.setLineDash([]);
  context.fillStyle = "#fff0bd";
  context.font = "900 10px ui-monospace, monospace";
  context.textAlign = "center";
  context.fillText(
    gapWall
      ? "FOLLOW THE GAPS - KEEP MOVING"
      : double
      ? "STACKED CROSS-WIPE - TAB THROUGH"
      : "CROSS-WIPE - TAB THROUGH",
    width / 2,
    height - 18,
  );
  context.restore();
}
