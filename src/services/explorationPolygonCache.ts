/** A single-entry cache per surface layer, released with its map instance. */
export function createExplorationPolygonCache<T>(
  build: (cellIds: readonly string[], maxFilledHoleAreaSquareMeters: number) => T
) {
  let previousIds: readonly string[] | null = null;
  let previousLimit: number | null = null;
  let previousResult: T;

  return (cellIds: readonly string[], maxFilledHoleAreaSquareMeters: number): T => {
    if (
      previousIds !== null && previousLimit === maxFilledHoleAreaSquareMeters &&
      previousIds.length === cellIds.length &&
      previousIds.every((id, index) => id === cellIds[index])
    ) {
      return previousResult;
    }
    // Publish the cache only after a successful build; snapshot inputs so a
    // caller mutating its array cannot silently invalidate the comparison.
    const result = build(cellIds, maxFilledHoleAreaSquareMeters);
    previousIds = [...cellIds];
    previousLimit = maxFilledHoleAreaSquareMeters;
    previousResult = result;
    return result;
  };
}
