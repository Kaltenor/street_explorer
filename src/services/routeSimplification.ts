import { GpsPoint } from "../types/walk";
import { haversineDistanceMeters } from "./distance";

export function simplifyGpsPointsForRender(points: GpsPoint[], toleranceMeters: number) {
  if (points.length <= 2 || toleranceMeters <= 0) {
    return points;
  }

  const keep = new Set<number>([0, points.length - 1]);
  // Recovery previews can contain an entire walk. An unbalanced split must not
  // consume one JavaScript call frame per retained point.
  const pending = [0, points.length - 1];
  while (pending.length > 0) {
    const endIndex = pending.pop()!;
    const startIndex = pending.pop()!;
    if (endIndex <= startIndex + 1) continue;
    const start = points[startIndex];
    const end = points[endIndex];
    if (!start || !end) continue;

    // The projection and baseline are constant for every point in this range.
    const longitudeMeters = 111_320 * Math.cos((start.latitude * Math.PI) / 180);
    const endX = longitudeDelta(end.longitude, start.longitude) * longitudeMeters;
    const endY = (end.latitude - start.latitude) * 111_320;
    const baselineSquared = endX * endX + endY * endY;
    let maxDistance = 0;
    let maxIndex = startIndex;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const point = points[index];
      if (!point) continue;
      const x = longitudeDelta(point.longitude, start.longitude) * longitudeMeters;
      const y = (point.latitude - start.latitude) * 111_320;
      const progress = baselineSquared === 0 ? 0 : Math.max(
        0, Math.min(1, (x * endX + y * endY) / baselineSquared)
      );
      const distance = baselineSquared === 0
        ? haversineDistanceMeters(point, start)
        : Math.hypot(x - endX * progress, y - endY * progress);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = index;
      }
    }

    if (maxDistance > toleranceMeters) {
      keep.add(maxIndex);
      pending.push(maxIndex, endIndex, startIndex, maxIndex);
    }
  }
  return points.filter((_, index) => keep.has(index));
}

function longitudeDelta(longitude: number, origin: number) {
  const delta = longitude - origin;
  return delta > 180 ? delta - 360 : delta < -180 ? delta + 360 : delta;
}
