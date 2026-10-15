export function drawWallSegment(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  radius: number,
  label: string,
  amber = false,
) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.fillStyle = amber ? "#f3a65a" : "#ff334f";
  context.strokeStyle = amber ? "#ffe0a3" : "#ff9cab";
  context.shadowColor = amber ? "#f3a65a" : "#ff334f";
  context.shadowBlur = 12;
  context.lineWidth = 2;
  context.fillRect(-radius, -radius, radius * 2, radius * 2);
  context.strokeRect(-radius, -radius, radius * 2, radius * 2);
  context.fillStyle = "#290710";
  context.font = "900 8px ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 0, 0);
  context.restore();
}
