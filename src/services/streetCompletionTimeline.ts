import type { StreetSegmentCoverage } from "../types/street";

/** Feed finalized sessions in endedAt order; dates describe evidence, not rebuild time. */
export function createStreetCompletionTimeline(
  segments: readonly { segmentId: string; streetId: string; totalDistanceMeters: number }[]
) {
  const lengths = new Map(segments.map((segment) => [segment.segmentId, segment]));
  const totals = new Map<string, number>();
  const covered = new Map<string, number>();
  const bins = new Map<string, Set<number>>();
  const completedAtByStreetId: Record<string, string> = Object.create(null);
  for (const segment of segments) {
    totals.set(segment.streetId, (totals.get(segment.streetId) ?? 0) + segment.totalDistanceMeters);
  }
  return {
    aggregateBinsBySegmentId: bins,
    completedAtByStreetId,
    append(coverage: readonly StreetSegmentCoverage[], endedAt: string) {
      for (const item of coverage) {
        const segment = lengths.get(item.segmentId);
        if (!segment || item.totalBinCount <= 0) continue;
        const seen = bins.get(item.segmentId) ?? new Set<number>();
        const previousSize = seen.size;
        for (const bin of item.coveredBinIndexes) seen.add(bin);
        bins.set(item.segmentId, seen);
        const distance = (seen.size - previousSize) / item.totalBinCount * segment.totalDistanceMeters;
        const totalCovered = (covered.get(segment.streetId) ?? 0) + distance;
        covered.set(segment.streetId, totalCovered);
        const total = totals.get(segment.streetId) ?? 0;
        if (total > 0 && totalCovered + 1e-8 >= total * 0.9 && !completedAtByStreetId[segment.streetId]) {
          completedAtByStreetId[segment.streetId] = endedAt;
        }
      }
    }
  };
}
