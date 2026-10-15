import { drawWallSegment } from "./walls.ts";
import type { GameState } from "../types.ts";
import { CAPTURE_PULSE_RADIUS, SWEEP_GAP_WIDTH } from "../engine/encounters/stacks.ts";
import { getCurrentEncounter } from "../engine/selectors.ts";

export function drawStacksArena(
  context: CanvasRenderingContext2D,
  state: GameState,
  reducedEffects = false,
) {
  if (state.phase !== "encounter" || state.actIndex !== 0) return;
  const stacks = state.stacks;
  context.save();
  const next = stacks.nextCache;
  if (next && state.relayCache) {
    context.strokeStyle = "rgba(248,212,119,0.22)";
    context.lineWidth = 1;
    context.setLineDash([5, 9]);
    context.beginPath();
    context.moveTo(state.relayCache.x, state.relayCache.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    context.strokeRect(next.x - 18, next.y - 18, 36, 36);
    context.setLineDash([]);
    context.fillStyle = "#a79c74";
    context.font = "700 9px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillText("NEXT", next.x, next.y - 26);
  }
  const pulse = stacks.pulse;
  if (pulse && !reducedEffects) {
    const progress = 1 - pulse.life / 0.55;
    context.globalAlpha = 1 - progress;
    context.strokeStyle = "#68d3b5";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(pulse.x, pulse.y, Math.max(1, CAPTURE_PULSE_RADIUS * progress), 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
  }
  const terminal = stacks.terminal;
  if (terminal) {
    context.fillStyle = "rgba(104,211,181,0.12)";
    context.strokeStyle = "#68d3b5";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(terminal.x, terminal.y, 34, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.lineWidth = 5;
    context.beginPath();
    context.arc(
      terminal.x,
      terminal.y,
      38,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.min(1, terminal.charge / 0.65),
    );
    context.stroke();
    context.strokeRect(terminal.x - 12, terminal.y - 10, 24, 20);
    context.font = "800 10px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillStyle = "#a8f2db";
    context.fillText("HOLD · −4s", terminal.x, terminal.y - 47);
    context.fillText(`OPTIONAL · ${Math.ceil(terminal.life)}s`, terminal.x, terminal.y + 53);
  }
  const sweep = stacks.sweep;
  if (sweep) {
    context.save();
    // Rotate the coordinate system so both sweep directions use the same drawing.
    if (sweep.vertical) context.transform(0, 1, 1, 0, 0, 0);
    const span = sweep.vertical ? state.height : state.width;
    const length = sweep.vertical ? state.width : state.height;
    const gapStart = Math.max(0, sweep.gap - SWEEP_GAP_WIDTH / 2);
    const gapEnd = Math.min(span, sweep.gap + SWEEP_GAP_WIDTH / 2);
    const warning = sweep.warningFor > 0;
    if (warning) {
      context.fillStyle = "rgba(255,100,124,0.08)";
      context.fillRect(0, 0, gapStart, length);
      context.fillRect(gapEnd, 0, span - gapEnd, length);
    } else {
      // Share the same red segments as the boss walls, preserving the marked safe lane.
      context.save();
      context.beginPath();
      context.rect(0, sweep.position - 10, gapStart, 20);
      context.rect(gapEnd, sweep.position - 10, span - gapEnd, 20);
      context.clip();
      for (let offset = 0; offset <= span; offset += 15) {
        drawWallSegment(context, offset, sweep.position, Math.PI / 2, 10, "1");
      }
      context.restore();
    }
    context.fillStyle = "rgba(104,211,181,0.1)";
    if (warning) context.fillRect(gapStart, 0, gapEnd - gapStart, length);
    context.strokeStyle = warning ? "rgba(104,211,181,0.65)" : "#a8f2db";
    context.lineWidth = 2;
    context.setLineDash(warning ? [8, 8] : []);
    context.beginPath();
    context.moveTo(gapStart, 0);
    context.lineTo(gapStart, length);
    context.moveTo(gapEnd, 0);
    context.lineTo(gapEnd, length);
    context.stroke();
    context.setLineDash([]);
    context.restore();
    context.font = "800 11px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillStyle = "#a8f2db";
    context.fillText(
      warning ? (sweep.vertical ? "SAFE GAP →" : "SAFE GAP ↓") : "GAP",
      sweep.vertical ? state.width - 80 : sweep.gap,
      sweep.vertical ? sweep.gap : state.height - 64,
    );
  }
  context.restore();
}

export function drawStacksStatus(context: CanvasRenderingContext2D, state: GameState) {
  if (state.phase !== "encounter") return;
  const encounter = getCurrentEncounter(state);
  if (encounter?.id !== "catalog-lock" && encounter?.id !== "retention-window") return;
  const stacks = state.stacks;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  if (stacks.noticeFor > 0) {
    const fontSize = Math.min(12, Math.max(8, state.width / 58));
    context.font = `800 ${fontSize}px ui-monospace, monospace`;
    const width = Math.min(state.width - 24, context.measureText(stacks.notice).width + 28);
    context.fillStyle = "rgba(6,19,27,0.94)";
    context.fillRect((state.width - width) / 2, 82, width, 30);
    context.fillStyle = stacks.wave === 3 ? "#ffb5c1" : "#f8d477";
    context.fillText(stacks.notice, state.width / 2, 97, state.width - 40);
  }
  context.font = "800 11px ui-monospace, monospace";
  context.fillStyle = "#a8f2db";
  const label = encounter.id === "catalog-lock"
    ? `CAPTURE CHAIN ×${state.relayStreak} · PULSE + DASH REFRESH`
    : `PURGE ${Math.min(3, stacks.wave + 1)}/3 · ${stacks.terminalsRecovered * 4}s SAVED`;
  context.fillStyle = "rgba(6,19,27,0.9)";
  context.fillRect(
    state.width / 2 - Math.min(185, state.width / 2 - 12),
    state.height - 36,
    Math.min(370, state.width - 24),
    24,
  );
  context.fillStyle = "#a8f2db";
  context.fillText(label, state.width / 2, state.height - 24, state.width - 40);
  if (encounter.id === "retention-window") {
    const remaining = Math.ceil(state.objectiveTarget - state.objectiveProgress);
    if (remaining <= 10) {
      context.fillStyle = "#f8d477";
      context.font = "900 32px ui-monospace, monospace";
      context.fillText(`${Math.max(0, remaining)}`, state.width / 2, 142);
    }
  }
  context.restore();
}
