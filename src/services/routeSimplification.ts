import { haversineDistanceMeters } from "./distance";
import { GpsPoint } from "../types/walk";

export function simplifyGpsPointsForRender(points: GpsPoint[], toleranceMeters: number) {
  if (points.length <= 2 || toleranceMeters <= 0) {
    return points;
  }

  const keep = new Set<number>([0, points.length - 1]);

  simplifyRange(points, 0, points.length - 1, toleranceMeters, keep);

  return points.filter((_, index) => keep.has(index));
}

function simplifyRange(
  points: GpsPoint[],
  startIndex: number,
  endIndex: number,
  toleranceMeters: number,
  keep: Set<number>
) {
  const start = points[startIndex];
  const end = points[endIndex];

  if (!start || !end || endIndex <= startIndex + 1) {
    return;
  }

  let maxDistance = 0;
  let maxIndex = startIndex;

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const point = points[index];

    if (!point) {
      continue;
    }

    const distance = perpendicularDistanceMeters(point, start, end);

    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }

  if (maxDistance > toleranceMeters) {
    keep.add(maxIndex);
    simplifyRange(points, startIndex, maxIndex, toleranceMeters, keep);
    simplifyRange(points, maxIndex, endIndex, toleranceMeters, keep);
  }
}

function perpendicularDistanceMeters(point: GpsPoint, start: GpsPoint, end: GpsPoint) {
  const baselineDistance = haversineDistanceMeters(start, end);

  if (baselineDistance === 0) {
    return haversineDistanceMeters(point, start);
  }

  const projected = projectPointToLocalMeters(point, start);
  const projectedEnd = projectPointToLocalMeters(end, start);
  const progress = Math.max(
    0,
    Math.min(
      1,
      (projected.x * projectedEnd.x + projected.y * projectedEnd.y) /
        (projectedEnd.x ** 2 + projectedEnd.y ** 2)
    )
  );
  const closest = {
    x: projectedEnd.x * progress,
    y: projectedEnd.y * progress
  };

  return Math.hypot(projected.x - closest.x, projected.y - closest.y);
}

function projectPointToLocalMeters(point: GpsPoint, origin: GpsPoint) {
  const latitudeMeters = 111_320;
  const longitudeMeters = latitudeMeters * Math.cos((origin.latitude * Math.PI) / 180);

  return {
    x: (point.longitude - origin.longitude) * longitudeMeters,
    y: (point.latitude - origin.latitude) * latitudeMeters
  };
}
