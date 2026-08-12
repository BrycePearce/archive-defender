import type { BacklogTile, Point, Projectile } from "../types.ts";

export function segmentHitsCircle(
  projectile: Pick<Projectile, "x" | "y" | "previousX" | "previousY">,
  circle: Point,
  radius: number,
) {
  const vx = projectile.x - projectile.previousX;
  const vy = projectile.y - projectile.previousY;
  const lengthSquared = vx * vx + vy * vy;
  const projection = lengthSquared === 0 ? 0 : clamp(
    ((circle.x - projectile.previousX) * vx +
      (circle.y - projectile.previousY) * vy) /
      lengthSquared,
    0,
    1,
  );
  const closestX = projectile.previousX + vx * projection;
  const closestY = projectile.previousY + vy * projection;
  return Math.hypot(circle.x - closestX, circle.y - closestY) <= radius;
}

export function sweptMovingCirclesIntersect(
  first: Point & { previousX?: number; previousY?: number },
  second: Point & { previousX?: number; previousY?: number },
  radius: number,
) {
  return segmentsWithinDistance(
    first.previousX ?? first.x,
    first.previousY ?? first.y,
    first.x,
    first.y,
    second.previousX ?? second.x,
    second.previousY ?? second.y,
    second.x,
    second.y,
    radius,
  );
}

export function segmentsWithinDistance(
  firstStartX: number,
  firstStartY: number,
  firstEndX: number,
  firstEndY: number,
  secondStartX: number,
  secondStartY: number,
  secondEndX: number,
  secondEndY: number,
  distance: number,
) {
  const firstDx = firstEndX - firstStartX;
  const firstDy = firstEndY - firstStartY;
  const secondDx = secondEndX - secondStartX;
  const secondDy = secondEndY - secondStartY;
  const denominator = firstDx * secondDy - firstDy * secondDx;
  if (Math.abs(denominator) > 0.000001) {
    const offsetX = secondStartX - firstStartX;
    const offsetY = secondStartY - firstStartY;
    const firstTime = (offsetX * secondDy - offsetY * secondDx) / denominator;
    const secondTime = (offsetX * firstDy - offsetY * firstDx) / denominator;
    if (firstTime >= 0 && firstTime <= 1 && secondTime >= 0 && secondTime <= 1) return true;
  }
  const distanceSquared = distance * distance;
  return pointSegmentDistanceSquared(
        firstStartX,
        firstStartY,
        secondStartX,
        secondStartY,
        secondEndX,
        secondEndY,
      ) <= distanceSquared ||
    pointSegmentDistanceSquared(
        firstEndX,
        firstEndY,
        secondStartX,
        secondStartY,
        secondEndX,
        secondEndY,
      ) <= distanceSquared ||
    pointSegmentDistanceSquared(
        secondStartX,
        secondStartY,
        firstStartX,
        firstStartY,
        firstEndX,
        firstEndY,
      ) <= distanceSquared ||
    pointSegmentDistanceSquared(
        secondEndX,
        secondEndY,
        firstStartX,
        firstStartY,
        firstEndX,
        firstEndY,
      ) <= distanceSquared;
}

export function pointSegmentDistanceSquared(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
) {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared === 0
    ? 0
    : clamp(((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared, 0, 1);
  const closestX = startX + dx * projection;
  const closestY = startY + dy * projection;
  const offsetX = pointX - closestX;
  const offsetY = pointY - closestY;
  return offsetX * offsetX + offsetY * offsetY;
}

export function segmentHitsBacklogTile(
  projectile: Pick<Projectile, "x" | "y" | "previousX" | "previousY" | "radius">,
  tile: BacklogTile,
) {
  const minX = tile.x - tile.width / 2 - projectile.radius;
  const maxX = tile.x + tile.width / 2 + projectile.radius;
  const minY = tile.y - tile.height / 2 - projectile.radius;
  const maxY = tile.y + tile.height / 2 + projectile.radius;
  const dx = projectile.x - projectile.previousX;
  const dy = projectile.y - projectile.previousY;
  let near = 0;
  let far = 1;
  for (
    const [origin, delta, minimum, maximum] of [
      [projectile.previousX, dx, minX, maxX],
      [projectile.previousY, dy, minY, maxY],
    ]
  ) {
    if (Math.abs(delta) < 0.0001) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return false;
  }
  return true;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
