import type { MapCoordinate } from "./explorationArea";

type Edge = { current: MapCoordinate; previous: MapCoordinate };

// Per-calculation index, so changed boundaries never reuse stale geometry.
export function prepareZoneContainment(zone: {
  geometry: MapCoordinate[][];
  holes: MapCoordinate[][];
}) {
  const outer = zone.geometry.map(prepareRing);
  const holes = zone.holes.map(prepareRing);
  return (point: MapCoordinate) => outer.some(contains => contains(point)) &&
    !holes.some(contains => contains(point));
}

function prepareRing(ring: MapCoordinate[]) {
  let minLatitude = Infinity, maxLatitude = -Infinity;
  let minLongitude = Infinity, maxLongitude = -Infinity;
  for (const point of ring) {
    minLatitude = Math.min(minLatitude, point.latitude);
    maxLatitude = Math.max(maxLatitude, point.latitude);
    minLongitude = Math.min(minLongitude, point.longitude);
    maxLongitude = Math.max(maxLongitude, point.longitude);
  }
  if (!ring.length || minLatitude === maxLatitude) return () => false;
  const bucketCount = Math.min(64, Math.max(1, Math.ceil(Math.sqrt(ring.length))));
  const buckets: Edge[][] = Array.from({ length: bucketCount }, () => []);
  const bucketIndex = (latitude: number) => Math.max(0, Math.min(bucketCount - 1,
    Math.floor((latitude - minLatitude) / (maxLatitude - minLatitude) * bucketCount)));
  for (let i = 0, previousIndex = ring.length - 1; i < ring.length; previousIndex = i++) {
    const current = ring[i]!, previous = ring[previousIndex]!;
    if (current.latitude === previous.latitude) continue;
    const edge = { current, previous };
    const start = bucketIndex(Math.min(current.latitude, previous.latitude));
    const end = bucketIndex(Math.max(current.latitude, previous.latitude));
    for (let bucket = start; bucket <= end; bucket++) buckets[bucket]!.push(edge);
  }
  let cachedLatitude = NaN;
  let crossings: number[] = [];
  return (point: MapCoordinate) => {
    if (point.latitude < minLatitude || point.latitude > maxLatitude ||
        point.longitude < minLongitude || point.longitude > maxLongitude) return false;
    if (point.latitude !== cachedLatitude) {
      crossings = [];
      for (const { current, previous } of buckets[bucketIndex(point.latitude)]!) {
        if (current.latitude > point.latitude !== previous.latitude > point.latitude) {
          crossings.push(((previous.longitude - current.longitude) * (point.latitude - current.latitude)) /
            (previous.latitude - current.latitude) + current.longitude);
        }
      }
      crossings.sort((a, b) => a - b);
      cachedLatitude = point.latitude;
    }
    // Same strict ray comparison as the original test, including boundary ties.
    let low = 0, high = crossings.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (crossings[middle]! <= point.longitude) low = middle + 1;
      else high = middle;
    }
    return (crossings.length - low) % 2 === 1;
  };
}
