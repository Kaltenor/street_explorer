import type { MapCoordinate } from "./explorationArea";

type Edge = { current: MapCoordinate; previous: MapCoordinate };

// Per-calculation index, so changed boundaries never reuse stale geometry.
export function prepareZoneContainment(zone: {
  geometry: MapCoordinate[][];
  holes: MapCoordinate[][];
}) {
  const outer = zone.geometry.map(prepareRing);
  const holes = zone.holes.map(prepareRing);
  return Object.assign(
    (point: MapCoordinate) => outer.some(contains => contains(point)) &&
      !holes.some(contains => contains(point)),
    { countRow(latitude: number, minX: number, maxX: number, longitudeAt: (x: number) => number) {
      const lowerBound = (longitude: number) => {
        let low = minX, high = maxX + 1;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          if (longitudeAt(middle) < longitude) low = middle + 1;
          else high = middle;
        }
        return low;
      };
      const ranges = (rings: ReturnType<typeof prepareRing>[]) => {
        const intervals: Array<[number, number]> = [];
        for (const ring of rings) {
          const crossings = ring.crossingsAt(latitude);
          for (let i = 0; i + 1 < crossings.length; i += 2) {
            const start = lowerBound(crossings[i]!);
            const end = lowerBound(crossings[i + 1]!);
            if (end > start) intervals.push([start, end]);
          }
        }
        intervals.sort((a, b) => a[0] - b[0]);
        const merged: Array<[number, number]> = [];
        for (const interval of intervals) {
          const previous = merged.at(-1);
          if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
          else merged.push([...interval]);
        }
        return merged;
      };
      const exterior = ranges(outer), interior = ranges(holes);
      let count = 0, holeIndex = 0;
      for (const [start, end] of exterior) {
        count += end - start;
        while (holeIndex < interior.length && interior[holeIndex]![1] <= start) holeIndex++;
        for (let i = holeIndex; i < interior.length && interior[i]![0] < end; i++) {
          count -= Math.max(0, Math.min(end, interior[i]![1]) - Math.max(start, interior[i]![0]));
        }
      }
      return count;
    } }
  );
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
  if (!ring.length || minLatitude === maxLatitude) return Object.assign(() => false, { crossingsAt: (_latitude: number): number[] => [] });
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
  const crossingsAt = (latitude: number) => {
    if (latitude < minLatitude || latitude > maxLatitude) return [];
    if (latitude !== cachedLatitude) {
      crossings = [];
      for (const { current, previous } of buckets[bucketIndex(latitude)]!) {
        if (current.latitude > latitude !== previous.latitude > latitude) {
          crossings.push(((previous.longitude - current.longitude) * (latitude - current.latitude)) /
            (previous.latitude - current.latitude) + current.longitude);
        }
      }
      crossings.sort((a, b) => a - b);
      cachedLatitude = latitude;
    }
    return crossings;
  };
  return Object.assign((point: MapCoordinate) => {
    if (point.longitude < minLongitude || point.longitude > maxLongitude) return false;
    const crossings = crossingsAt(point.latitude);
    // Same strict ray comparison as the original test, including boundary ties.
    let low = 0, high = crossings.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (crossings[middle]! <= point.longitude) low = middle + 1;
      else high = middle;
    }
    return (crossings.length - low) % 2 === 1;
  }, { crossingsAt });
}
