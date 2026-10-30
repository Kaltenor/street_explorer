type Coordinate = { latitude: number; longitude: number };
const METERS_PER_DEGREE = Math.PI * 6371000 / 180;
const longitudeDelta = (value: number) => ((value + 540) % 360 + 360) % 360 - 180;

/** Local metric projection for the planner's short (at most 6 km) routes.
 * Prepare once per route, then measure against segments rather than sparse OSM nodes.
 */
export function prepareGuidanceRoute(coordinates: readonly Coordinate[]) {
  const origin = coordinates[0];
  if (!origin) return null;
  const longitudeScale = METERS_PER_DEGREE * Math.cos(origin.latitude * Math.PI / 180);
  const project = (point: Coordinate) => ({
    x: longitudeDelta(point.longitude - origin.longitude) * longitudeScale,
    y: (point.latitude - origin.latitude) * METERS_PER_DEGREE
  });
  const points = coordinates.map(project);
  return {
    distanceTo(point: Coordinate) {
      const position = project(point);
      let closestSquared = Infinity;
      for (let index = 0; index < points.length; index++) {
        const start = points[index]!;
        const end = points[index + 1] ?? start;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lengthSquared = dx * dx + dy * dy;
        const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
          ((position.x - start.x) * dx + (position.y - start.y) * dy) / lengthSquared
        ));
        const offsetX = position.x - (start.x + fraction * dx);
        const offsetY = position.y - (start.y + fraction * dy);
        closestSquared = Math.min(closestSquared, offsetX * offsetX + offsetY * offsetY);
      }
      return Math.sqrt(closestSquared);
    }
  };
}
