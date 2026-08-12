import type { Enemy } from "../types.ts";
import { colorWithAlpha } from "./utils.ts";

export function drawEnemy(
  context: CanvasRenderingContext2D,
  enemy: Enemy,
  elapsed: number,
  frozen: boolean,
) {
  context.save();
  context.translate(enemy.x, enemy.y);
  context.lineWidth = 2;
  context.lineJoin = "round";
  if (enemy.warningFor > 0) {
    context.fillStyle = `rgba(255, 202, 105, ${0.12 + Math.sin(elapsed * 24) * 0.08})`;
    context.shadowColor = "#ffca69";
    context.shadowBlur = 18;
    context.beginPath();
    context.arc(0, 0, enemy.radius + 9, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
  }
  if (enemy.elite) {
    context.strokeStyle = "#f8d477";
    context.lineWidth = 2;
    context.setLineDash([4, 3]);
    context.beginPath();
    context.arc(0, 0, enemy.radius + 6 + Math.sin(elapsed * 6) * 2, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
  }

  if (enemy.kind === "boss") drawBoss(context, enemy, elapsed);
  else if (enemy.kind === "malicious") drawMalicious(context, enemy);
  else if (enemy.kind === "library") drawLibrary(context, enemy.radius);
  else if (enemy.kind === "media") drawMedia(context, enemy.radius);
  else if (enemy.kind === "duplicate") drawDuplicate(context, enemy.radius);
  else if (enemy.kind === "corruptor") drawCorruptor(context, enemy.radius);
  else if (enemy.kind === "buffering") drawBuffering(context, enemy.radius, enemy.aimAngle);
  else if (enemy.kind === "support") drawSupport(context, enemy.radius, elapsed);
  else drawFile(context, enemy.radius);

  if (frozen) {
    context.fillStyle = "rgba(185, 244, 255, 0.18)";
    context.strokeStyle = "#b9f4ff";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, enemy.radius + 4, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }

  if (
    enemy.maxHealth > 1 &&
    enemy.health < enemy.maxHealth &&
    enemy.bossKind !== "backlog"
  ) drawHealthBar(context, enemy);
  context.restore();
}

function drawFile(context: CanvasRenderingContext2D, radius: number) {
  context.fillStyle = "#ef6f79";
  context.strokeStyle = "#ffadb4";
  context.beginPath();
  context.moveTo(-radius * 0.68, -radius);
  context.lineTo(radius * 0.25, -radius);
  context.lineTo(radius * 0.68, -radius * 0.55);
  context.lineTo(radius * 0.68, radius);
  context.lineTo(-radius * 0.68, radius);
  context.closePath();
  context.fill();
  context.stroke();
  context.strokeStyle = "rgba(7, 16, 26, 0.78)";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(-radius * 0.38, radius * 0.15);
  context.lineTo(radius * 0.38, radius * 0.15);
  context.moveTo(-radius * 0.38, radius * 0.48);
  context.lineTo(radius * 0.2, radius * 0.48);
  context.stroke();
}

function drawMedia(context: CanvasRenderingContext2D, radius: number) {
  context.fillStyle = "#a978e8";
  context.strokeStyle = "#d4b7ff";
  context.beginPath();
  context.roundRect(-radius, -radius * 0.72, radius * 2, radius * 1.44, 4);
  context.fill();
  context.stroke();
  context.fillStyle = "rgba(7, 16, 26, 0.78)";
  context.beginPath();
  context.moveTo(-radius * 0.2, -radius * 0.3);
  context.lineTo(radius * 0.38, 0);
  context.lineTo(-radius * 0.2, radius * 0.3);
  context.closePath();
  context.fill();
}

function drawLibrary(context: CanvasRenderingContext2D, radius: number) {
  context.strokeStyle = "#ffd09a";
  for (const [index, color] of ["#f3a65a", "#e8894d", "#d96d45"].entries()) {
    const width = radius * (1.5 + (index % 2) * 0.2);
    const y = (index - 1) * radius * 0.62;
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(-width / 2, y - radius * 0.25, width, radius * 0.5, 3);
    context.fill();
    context.stroke();
  }
}

function drawMalicious(context: CanvasRenderingContext2D, enemy: Enemy) {
  context.save();
  context.rotate(enemy.aimAngle);
  context.strokeStyle = "#ff6684";
  context.fillStyle = "#07101a";
  context.lineWidth = 2.5;
  context.beginPath();
  context.arc(0, -8, 4.5, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(0, -3);
  context.lineTo(0, 9);
  context.moveTo(0, 9);
  context.lineTo(-7, 16);
  context.moveTo(0, 9);
  context.lineTo(7, 16);
  context.moveTo(0, 1);
  context.lineTo(19, 0);
  context.stroke();
  context.fillStyle = "#ff4663";
  context.fillRect(14, -2, 6, 4);
  context.restore();
}

function drawDuplicate(context: CanvasRenderingContext2D, radius: number) {
  for (const offset of [-5, 5]) {
    context.save();
    context.translate(offset, -offset * 0.25);
    context.globalAlpha = offset < 0 ? 0.55 : 0.9;
    context.fillStyle = "#9e74e6";
    context.strokeStyle = "#d8c3ff";
    context.beginPath();
    context.roundRect(-radius * 0.65, -radius * 0.85, radius * 1.3, radius * 1.7, 4);
    context.fill();
    context.stroke();
    context.restore();
  }
  context.fillStyle = "#24133e";
  context.font = `700 ${radius}px ui-monospace, monospace`;
  context.textAlign = "center";
  context.fillText("2×", 2, radius * 0.35);
}

function drawCorruptor(context: CanvasRenderingContext2D, radius: number) {
  context.fillStyle = "#4f172b";
  context.strokeStyle = "#ff6684";
  context.beginPath();
  for (let index = 0; index < 8; index++) {
    const angle = (index / 8) * Math.PI * 2;
    const length = index % 2 === 0 ? radius : radius * 0.62;
    const x = Math.cos(angle) * length;
    const y = Math.sin(angle) * length;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = "#ffca69";
  context.beginPath();
  context.arc(0, 0, 3, 0, Math.PI * 2);
  context.fill();
}

function drawBuffering(
  context: CanvasRenderingContext2D,
  radius: number,
  angle: number,
) {
  context.rotate(angle);
  context.strokeStyle = "#ffca69";
  context.lineWidth = 3;
  for (let index = 0; index < 3; index++) {
    context.globalAlpha = 1 - index * 0.25;
    context.beginPath();
    context.moveTo(radius - index * 7, -radius * 0.72);
    context.lineTo(radius + 8 - index * 7, 0);
    context.lineTo(radius - index * 7, radius * 0.72);
    context.stroke();
  }
}

function drawSupport(
  context: CanvasRenderingContext2D,
  radius: number,
  elapsed: number,
) {
  context.rotate(elapsed * 0.8);
  context.strokeStyle = "#65d6e8";
  context.fillStyle = "#102d38";
  context.lineWidth = 2;
  for (let index = 0; index < 3; index++) {
    context.rotate((Math.PI * 2) / 3);
    context.beginPath();
    context.arc(radius, 0, 5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  context.beginPath();
  context.arc(0, 0, radius * 0.55, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

function drawBoss(context: CanvasRenderingContext2D, enemy: Enemy, elapsed: number) {
  const color = enemy.bossKind === "backlog"
    ? "#f3a65a"
    : enemy.bossKind === "hydra"
    ? "#b687ff"
    : enemy.bossKind === "backfill-daemon"
    ? "#70dff2"
    : "#ff6684";
  context.rotate(elapsed * 0.18 * enemy.orbitDirection);
  context.fillStyle = colorWithAlpha(color, 0.28);
  context.strokeStyle = color;
  context.lineWidth = 4;
  const points = enemy.bossKind === "hydra"
    ? 12
    : enemy.bossKind === "admin"
    ? 6
    : enemy.bossKind === "backfill-daemon"
    ? 10
    : 8;
  context.beginPath();
  for (let index = 0; index < points; index++) {
    const angle = (index / points) * Math.PI * 2;
    const length = index % 2 === 0 ? enemy.radius : enemy.radius * 0.7;
    const x = Math.cos(angle) * length;
    const y = Math.sin(angle) * length;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  context.stroke();
  context.rotate(-elapsed * 0.7);
  context.fillStyle = color;
  context.font = "800 17px ui-monospace, monospace";
  context.textAlign = "center";
  context.fillText(enemy.phase === 1 ? "I" : enemy.phase === 2 ? "II" : "III", 0, 6);
}

function drawHealthBar(context: CanvasRenderingContext2D, enemy: Enemy) {
  const width = enemy.radius * 1.8;
  context.fillStyle = "rgba(5, 12, 20, 0.82)";
  context.fillRect(-width / 2, -enemy.radius - 9, width, 4);
  context.fillStyle = enemy.kind === "boss" ? "#ffca69" : "#f8d477";
  context.fillRect(
    -width / 2,
    -enemy.radius - 9,
    width * Math.max(0, enemy.health / enemy.maxHealth),
    4,
  );
}
