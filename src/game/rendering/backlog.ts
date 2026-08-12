import { ACTS } from "../content.ts";
import type { BacklogBomb, GameState } from "../types.ts";

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
  context.fillText("EPISODES REMAINING", width / 2, 14);
  const pipWidth = 22;
  const gap = 5;
  const total = pipWidth * 4 + gap * 3;
  for (let index = 0; index < 4; index++) {
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

export function drawBacklogFirewallWarning(
  context: CanvasRenderingContext2D,
  state: GameState,
  width: number,
  height: number,
) {
  const scanWarning = state.backlogHits === 3 &&
    state.backlogIntermissionStage === 2 &&
    state.backlogScanStep < 6 &&
    state.backlogScanNextFor <= 0.72;
  if (state.backlogFirewallWarningFor <= 0 && !scanWarning) return;
  const pulse = 0.28 + Math.sin(state.elapsed * 20) * 0.12;
  const double = state.backlogRebuildAfterWall && state.backlogHits >= 2;
  const gapWall = state.backlogHits === 2;
  const deepClean = state.backlogHits === 3;
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
  } else if (deepClean) {
    const direction = state.backlogFirewallDirection;
    const thickness = 20;
    if (direction === 0 || direction === 2) {
      const y = direction === 0 ? 0 : height - thickness;
      context.fillRect(0, y, width, thickness);
      context.beginPath();
      context.moveTo(0, direction === 0 ? thickness + 2 : y - 2);
      context.lineTo(width, direction === 0 ? thickness + 2 : y - 2);
      context.stroke();
    } else {
      const x = direction === 1 ? width - thickness : 0;
      context.fillRect(x, 0, thickness, height);
      context.beginPath();
      context.moveTo(direction === 1 ? x - 2 : thickness + 2, 0);
      context.lineTo(direction === 1 ? x - 2 : thickness + 2, height);
      context.stroke();
    }
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
      : deepClean
      ? `DEEP CLEAN SWEEP FROM ${
        ["TOP", "RIGHT", "BOTTOM", "LEFT"][state.backlogFirewallDirection]
      } - TAB THROUGH`
      : double
      ? "STACKED CROSS-WIPE - TAB THROUGH"
      : "CROSS-WIPE - TAB THROUGH",
    width / 2,
    height - 18,
  );
  context.restore();
}
