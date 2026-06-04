import { haversineDistanceMeters } from "./distance";
import { MapCoordinate } from "./explorationArea";
import { OsmStreetSegment } from "../types/street";
import { ActivityMode, GpsPoint } from "../types/walk";

const MODE_PATH_GAP_CONFIG: Record<
  ActivityMode,
  {
    maxConfirmedStraightLineMeters: number;
    maxDisplaySpeedMetersPerSecond: number;
    maxUninferredGapSeconds: number;
  }
> = {
  walk: {
    maxConfirmedStraightLineMeters: 1000,
    maxDisplaySpeedMetersPerSecond: 15,
    maxUninferredGapSeconds: 900
  },
  wheel: {
    maxConfirmedStraightLineMeters: 2500,
    maxDisplaySpeedMetersPerSecond: 40,
    maxUninferredGapSeconds: 600
  },
  car: {
    maxConfirmedStraightLineMeters: 6000,
    maxDisplaySpeedMetersPerSecond: 120,
    maxUninferredGapSeconds: 600
  }
};

export type ConfirmedPathSegment = {
  distanceMeters: number;
  endPoint: GpsPoint;
  points: GpsPoint[];
  startPoint: GpsPoint;
  type: "confirmed";
};

export type InferredPathSegment = {
  confidence: "low" | "medium" | "high";
  distanceMeters: number;
  endPoint: GpsPoint;
  points: GpsPoint[];
  source: "inferred";
  startPoint: GpsPoint;
  type: "inferred";
};

export type RejectedPathGap = {
  distanceMeters: number;
  endPoint: GpsPoint;
  reason: string;
  startPoint: GpsPoint;
  type: "rejected";
};

export type PathSegment = ConfirmedPathSegment | InferredPathSegment | RejectedPathGap;

export type InferredPathResult =
  | {
      reason: string;
      status: "not_configured";
    }
  | {
      segment: InferredPathSegment;
      status: "inferred";
    }
  | {
      reason: string;
      status: "rejected";
    };

export function buildPathSegments(points: GpsPoint[], activityMode: ActivityMode): PathSegment[] {
  return buildPathSegmentsWithInference(points, activityMode, []);
}

export function buildPathSegmentsWithInference(
  points: GpsPoint[],
  activityMode: ActivityMode,
  streetSegments: OsmStreetSegment[] = []
): PathSegment[] {
  const segments: PathSegment[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const startPoint = points[index - 1];
    const endPoint = points[index];

    if (!startPoint || !endPoint) {
      continue;
    }

    const distanceMeters = haversineDistanceMeters(startPoint, endPoint);
    const suspiciousReason = getSuspiciousGapReason(
      startPoint,
      endPoint,
      activityMode,
      distanceMeters
    );

    if (!suspiciousReason) {
      segments.push({
        distanceMeters,
        endPoint,
        points: [startPoint, endPoint],
        startPoint,
        type: "confirmed"
      });
      continue;
    }

    const inferredPath = inferPathBetweenPoints(startPoint, endPoint, activityMode, streetSegments);

    if (inferredPath.status === "inferred") {
      segments.push(inferredPath.segment);
      continue;
    }

    segments.push({
      distanceMeters,
      endPoint,
      reason: `${suspiciousReason}; inference ${inferredPath.status}`,
      startPoint,
      type: "rejected"
    });
  }

  return segments;
}

export function inferPathBetweenPoints(
  startPoint: GpsPoint,
  endPoint: GpsPoint,
  activityMode: ActivityMode,
  streetSegments: OsmStreetSegment[] = []
): InferredPathResult {
  if (streetSegments.length === 0) {
    return {
      reason: "street graph routing is not configured",
      status: "not_configured"
    };
  }

  const route = inferStreetRoute(startPoint, endPoint, activityMode, streetSegments);

  if (!route) {
    return {
      reason: "no reliable street route found",
      status: "rejected"
    };
  }

  return {
    segment: route,
    status: "inferred"
  };
}

function getSuspiciousGapReason(
  startPoint: GpsPoint,
  endPoint: GpsPoint,
  activityMode: ActivityMode,
  distanceMeters: number
) {
  const gapConfig = MODE_PATH_GAP_CONFIG[activityMode];
  const seconds = getSecondsBetweenPoints(startPoint, endPoint);

  if (seconds > 0) {
    const speedMetersPerSecond = distanceMeters / seconds;

    if (speedMetersPerSecond > gapConfig.maxDisplaySpeedMetersPerSecond) {
      return `impossible ${activityMode} speed`;
    }
  }

  if (
    distanceMeters > gapConfig.maxConfirmedStraightLineMeters &&
    seconds > gapConfig.maxUninferredGapSeconds
  ) {
    return `large GPS gap ${Math.round(distanceMeters)} m over ${Math.round(seconds)} s`;
  }

  return null;
}

function getSecondsBetweenPoints(startPoint: GpsPoint, endPoint: GpsPoint) {
  return Math.max(
    0,
    (new Date(endPoint.timestamp).getTime() - new Date(startPoint.timestamp).getTime()) / 1000
  );
}

type GraphEdge = {
  distanceMeters: number;
  key: string;
};

type GraphNode = {
  coordinate: MapCoordinate;
  edges: GraphEdge[];
};

function inferStreetRoute(
  startPoint: GpsPoint,
  endPoint: GpsPoint,
  activityMode: ActivityMode,
  streetSegments: OsmStreetSegment[]
): InferredPathSegment | null {
  const graph = buildStreetGraph(streetSegments.filter((segment) => isStreetUsableForMode(segment, activityMode)));
  const startNode = findNearestGraphNode(startPoint, graph);
  const endNode = findNearestGraphNode(endPoint, graph);

  if (!startNode || !endNode || startNode.distanceMeters > 75 || endNode.distanceMeters > 75) {
    return null;
  }

  const route = findShortestPath(graph, startNode.key, endNode.key);

  if (!route || route.keys.length < 2) {
    return null;
  }

  const routeDistance =
    startNode.distanceMeters + route.distanceMeters + endNode.distanceMeters;
  const straightDistance = haversineDistanceMeters(startPoint, endPoint);
  const seconds = getSecondsBetweenPoints(startPoint, endPoint);
  const speedMetersPerSecond = seconds > 0 ? routeDistance / seconds : 0;
  const gapConfig = MODE_PATH_GAP_CONFIG[activityMode];

  if (routeDistance > Math.max(straightDistance * 4, straightDistance + 800)) {
    return null;
  }

  if (speedMetersPerSecond > gapConfig.maxDisplaySpeedMetersPerSecond) {
    return null;
  }

  const routePoints = route.keys
    .map((key) => graph.get(key)?.coordinate)
    .filter((point): point is MapCoordinate => Boolean(point))
    .map((point, index) => toGpsPoint(point, index, startPoint.timestamp));

  return {
    confidence: routeDistance <= Math.max(straightDistance * 1.8, straightDistance + 160)
      ? "medium"
      : "low",
    distanceMeters: routeDistance,
    endPoint,
    points: [startPoint, ...routePoints, endPoint],
    source: "inferred",
    startPoint,
    type: "inferred"
  };
}

function isStreetUsableForMode(segment: OsmStreetSegment, activityMode: ActivityMode) {
  if (activityMode === "car") {
    return !["footway", "path", "pedestrian", "steps"].includes(segment.highway);
  }

  if (activityMode === "wheel") {
    return segment.highway !== "steps";
  }

  if (
    ["motorway", "motorway_link", "trunk", "trunk_link"].includes(segment.highway)
  ) {
    return false;
  }

  return true;
}

function buildStreetGraph(streetSegments: OsmStreetSegment[]) {
  const graph = new Map<string, GraphNode>();

  for (const segment of streetSegments) {
    for (let index = 1; index < segment.coordinates.length; index += 1) {
      const from = segment.coordinates[index - 1];
      const to = segment.coordinates[index];

      if (!from || !to) {
        continue;
      }

      const fromKey = coordinateKey(from);
      const toKey = coordinateKey(to);
      const distanceMeters = haversineDistanceMeters(toGpsPoint(from), toGpsPoint(to));

      ensureGraphNode(graph, fromKey, from).edges.push({ distanceMeters, key: toKey });
      ensureGraphNode(graph, toKey, to).edges.push({ distanceMeters, key: fromKey });
    }
  }

  return graph;
}

function ensureGraphNode(graph: Map<string, GraphNode>, key: string, coordinate: MapCoordinate) {
  const existing = graph.get(key);

  if (existing) {
    return existing;
  }

  const node = {
    coordinate,
    edges: []
  };

  graph.set(key, node);

  return node;
}

function findNearestGraphNode(point: GpsPoint, graph: Map<string, GraphNode>) {
  let nearest: { distanceMeters: number; key: string } | null = null;

  for (const [key, node] of graph.entries()) {
    const distanceMeters = haversineDistanceMeters(point, toGpsPoint(node.coordinate));

    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = { distanceMeters, key };
    }
  }

  return nearest;
}

function findShortestPath(graph: Map<string, GraphNode>, startKey: string, endKey: string) {
  const distances = new Map<string, number>([[startKey, 0]]);
  const previous = new Map<string, string>();
  const unvisited = new Set(graph.keys());

  while (unvisited.size > 0) {
    let currentKey: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;

    for (const key of unvisited) {
      const distance = distances.get(key) ?? Number.POSITIVE_INFINITY;

      if (distance < currentDistance) {
        currentDistance = distance;
        currentKey = key;
      }
    }

    if (!currentKey || currentDistance === Number.POSITIVE_INFINITY) {
      break;
    }

    if (currentKey === endKey) {
      break;
    }

    unvisited.delete(currentKey);

    for (const edge of graph.get(currentKey)?.edges ?? []) {
      if (!unvisited.has(edge.key)) {
        continue;
      }

      const nextDistance = currentDistance + edge.distanceMeters;

      if (nextDistance < (distances.get(edge.key) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.key, nextDistance);
        previous.set(edge.key, currentKey);
      }
    }
  }

  const distance = distances.get(endKey);

  if (distance === undefined) {
    return null;
  }

  const keys = [endKey];
  let currentKey = endKey;

  while (currentKey !== startKey) {
    const previousKey = previous.get(currentKey);

    if (!previousKey) {
      return null;
    }

    keys.unshift(previousKey);
    currentKey = previousKey;
  }

  return {
    distanceMeters: distance,
    keys
  };
}

function coordinateKey(coordinate: MapCoordinate) {
  return `${coordinate.latitude.toFixed(5)}:${coordinate.longitude.toFixed(5)}`;
}

function toGpsPoint(
  coordinate: MapCoordinate,
  pointIndex = 0,
  timestamp = ""
): GpsPoint {
  return {
    accuracy: null,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    pointIndex,
    timestamp
  };
}
