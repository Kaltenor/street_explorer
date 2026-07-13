import { haversineDistanceMeters } from "./distance";
import { MODE_LOCATION_CONFIG } from "../constants/config";
import { MapCoordinate } from "./explorationArea";
import { OsmStreetSegment } from "../types/street";
import { ActivityMode, GpsPoint } from "../types/walk";

const MAX_SAFE_STREET_SNAP_CONNECTOR_METERS = 12;

const MODE_PATH_GAP_CONFIG: Record<
  ActivityMode,
  {
    maxConfirmedStraightLineMeters: number;
    maxUninferredGapSeconds: number;
  }
> = {
  walk: {
    maxConfirmedStraightLineMeters: 15,
    maxUninferredGapSeconds: 6
  },
  wheel: {
    maxConfirmedStraightLineMeters: 35,
    maxUninferredGapSeconds: 6
  },
  car: {
    maxConfirmedStraightLineMeters: 90,
    maxUninferredGapSeconds: 6
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
  const routingContext = createStreetRoutingContext(activityMode, streetSegments);

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

    const inferredPath = inferPathBetweenPointsWithContext(
      startPoint,
      endPoint,
      activityMode,
      routingContext
    );

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
  return inferPathBetweenPointsWithContext(
    startPoint,
    endPoint,
    activityMode,
    createStreetRoutingContext(activityMode, streetSegments)
  );
}

function inferPathBetweenPointsWithContext(
  startPoint: GpsPoint,
  endPoint: GpsPoint,
  activityMode: ActivityMode,
  routingContext: StreetRoutingContext | null
): InferredPathResult {
  if (!routingContext) {
    return {
      reason: "street graph routing is not configured",
      status: "not_configured"
    };
  }

  const route = inferStreetRoute(startPoint, endPoint, activityMode, routingContext);

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

    if (speedMetersPerSecond > MODE_LOCATION_CONFIG[activityMode].maxSpeedMetersPerSecond) {
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

type StreetRoutingContext = {
  graph: Map<string, GraphNode>;
  nextSnapId: number;
  streetSegments: OsmStreetSegment[];
};

function createStreetRoutingContext(
  activityMode: ActivityMode,
  streetSegments: OsmStreetSegment[]
): StreetRoutingContext | null {
  const usableStreetSegments = streetSegments
    .filter((segment) => isStreetUsableForMode(segment, activityMode));

  if (usableStreetSegments.length === 0) {
    return null;
  }

  return {
    graph: buildStreetGraph(usableStreetSegments),
    nextSnapId: 0,
    streetSegments: usableStreetSegments
  };
}

function inferStreetRoute(
  startPoint: GpsPoint,
  endPoint: GpsPoint,
  activityMode: ActivityMode,
  routingContext: StreetRoutingContext
): InferredPathSegment | null {
  const graph = routingContext.graph;
  const startNode = attachPointToStreetGraph(
    startPoint,
    graph,
    routingContext.streetSegments,
    String(routingContext.nextSnapId++)
  );
  const endNode = attachPointToStreetGraph(
    endPoint,
    graph,
    routingContext.streetSegments,
    String(routingContext.nextSnapId++)
  );
  const maxSnapDistanceMeters = {
    walk: 30,
    wheel: 35,
    car: 45
  }[activityMode];

  if (
    !startNode ||
    !endNode ||
    startNode.distanceMeters > maxSnapDistanceMeters ||
    endNode.distanceMeters > maxSnapDistanceMeters
  ) {
    return null;
  }

  if (startNode.edgeKey === endNode.edgeKey) {
    connectGraphNodes(graph, startNode.key, endNode.key);
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

  if (routeDistance > Math.max(straightDistance * 2.25, straightDistance + 250)) {
    return null;
  }

  if (speedMetersPerSecond > MODE_LOCATION_CONFIG[activityMode].maxSpeedMetersPerSecond) {
    return null;
  }

  const graphRoutePoints = route.keys
    .map((key) => graph.get(key)?.coordinate)
    .filter((point): point is MapCoordinate => Boolean(point))
    .map((point, index) => toGpsPoint(point, index + 1, startPoint.timestamp));
  const routePoints = [
    ...(startNode.distanceMeters <= MAX_SAFE_STREET_SNAP_CONNECTOR_METERS
      ? [startPoint]
      : []),
    ...graphRoutePoints,
    ...(endNode.distanceMeters <= MAX_SAFE_STREET_SNAP_CONNECTOR_METERS
      ? [endPoint]
      : [])
  ];
  const isHighConfidence =
    startNode.distanceMeters <= 12 &&
    endNode.distanceMeters <= 12 &&
    routeDistance <= Math.max(straightDistance * 1.35, straightDistance + 60);

  return {
    confidence: isHighConfidence ? "high" : "medium",
    distanceMeters: routeDistance,
    endPoint,
    points: routePoints,
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

function attachPointToStreetGraph(
  point: GpsPoint,
  graph: Map<string, GraphNode>,
  streetSegments: OsmStreetSegment[],
  keySuffix: string
) {
  let nearest: {
    coordinate: MapCoordinate;
    distanceMeters: number;
    edgeKey: string;
    fromKey: string;
    toKey: string;
  } | null = null;

  for (const segment of streetSegments) {
    for (let index = 1; index < segment.coordinates.length; index += 1) {
      const from = segment.coordinates[index - 1];
      const to = segment.coordinates[index];

      if (!from || !to) {
        continue;
      }

      const coordinate = projectCoordinateOntoSegment(point, from, to);
      const distanceMeters = haversineDistanceMeters(point, toGpsPoint(coordinate));

      if (!nearest || distanceMeters < nearest.distanceMeters) {
        const fromKey = coordinateKey(from);
        const toKey = coordinateKey(to);

        nearest = {
          coordinate,
          distanceMeters,
          edgeKey: [fromKey, toKey].sort().join(">"),
          fromKey,
          toKey
        };
      }
    }
  }

  if (!nearest) {
    return null;
  }

  const key = "snap:" + keySuffix;
  ensureGraphNode(graph, key, nearest.coordinate);
  connectGraphNodes(graph, key, nearest.fromKey);
  connectGraphNodes(graph, key, nearest.toKey);

  return {
    distanceMeters: nearest.distanceMeters,
    edgeKey: nearest.edgeKey,
    key
  };
}

function connectGraphNodes(graph: Map<string, GraphNode>, leftKey: string, rightKey: string) {
  if (leftKey === rightKey) {
    return;
  }

  const left = graph.get(leftKey);
  const right = graph.get(rightKey);

  if (!left || !right) {
    return;
  }

  const distanceMeters = haversineDistanceMeters(
    toGpsPoint(left.coordinate),
    toGpsPoint(right.coordinate)
  );

  if (!left.edges.some((edge) => edge.key === rightKey)) {
    left.edges.push({ distanceMeters, key: rightKey });
  }

  if (!right.edges.some((edge) => edge.key === leftKey)) {
    right.edges.push({ distanceMeters, key: leftKey });
  }
}

function projectCoordinateOntoSegment(
  point: Pick<MapCoordinate, "latitude" | "longitude">,
  from: MapCoordinate,
  to: MapCoordinate
) {
  const latitudeRadians = (point.latitude * Math.PI) / 180;
  const longitudeScale = Math.max(1, 111_320 * Math.cos(latitudeRadians));
  const fromX = (from.longitude - point.longitude) * longitudeScale;
  const fromY = (from.latitude - point.latitude) * 111_320;
  const toX = (to.longitude - point.longitude) * longitudeScale;
  const toY = (to.latitude - point.latitude) * 111_320;
  const deltaX = toX - fromX;
  const deltaY = toY - fromY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const progress = lengthSquared > 0
    ? Math.max(0, Math.min(1, -(fromX * deltaX + fromY * deltaY) / lengthSquared))
    : 0;

  return {
    latitude: from.latitude + (to.latitude - from.latitude) * progress,
    longitude: from.longitude + (to.longitude - from.longitude) * progress
  };
}
function findShortestPath(graph: Map<string, GraphNode>, startKey: string, endKey: string) {
  const distances = new Map<string, number>([[startKey, 0]]);
  const previous = new Map<string, string>();
  const visited = new Set<string>();
  const queue: Array<{ distanceMeters: number; key: string }> = [
    { distanceMeters: 0, key: startKey }
  ];

  while (queue.length > 0) {
    const current = popNearestQueueItem(queue);

    if (!current || visited.has(current.key)) {
      continue;
    }

    if (current.distanceMeters !== distances.get(current.key)) {
      continue;
    }

    visited.add(current.key);

    if (current.key === endKey) {
      break;
    }

    for (const edge of graph.get(current.key)?.edges ?? []) {
      if (visited.has(edge.key)) {
        continue;
      }

      const nextDistance = current.distanceMeters + edge.distanceMeters;

      if (nextDistance < (distances.get(edge.key) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.key, nextDistance);
        previous.set(edge.key, current.key);
        pushQueueItem(queue, {
          distanceMeters: nextDistance,
          key: edge.key
        });
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

function pushQueueItem(
  queue: Array<{ distanceMeters: number; key: string }>,
  item: { distanceMeters: number; key: string }
) {
  queue.push(item);
  let index = queue.length - 1;

  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    const parent = queue[parentIndex];

    if (!parent || parent.distanceMeters <= item.distanceMeters) {
      break;
    }

    queue[index] = parent;
    index = parentIndex;
  }

  queue[index] = item;
}

function popNearestQueueItem(
  queue: Array<{ distanceMeters: number; key: string }>
) {
  const nearest = queue[0];
  const last = queue.pop();

  if (!nearest || !last || queue.length === 0) {
    return nearest;
  }

  let index = 0;

  while (true) {
    const leftIndex = index * 2 + 1;
    const rightIndex = leftIndex + 1;
    const left = queue[leftIndex];
    const right = queue[rightIndex];

    if (!left) {
      break;
    }

    const smallerChildIndex =
      right && right.distanceMeters < left.distanceMeters
        ? rightIndex
        : leftIndex;
    const smallerChild = queue[smallerChildIndex];

    if (!smallerChild || smallerChild.distanceMeters >= last.distanceMeters) {
      break;
    }

    queue[index] = smallerChild;
    index = smallerChildIndex;
  }

  queue[index] = last;

  return nearest;
}

function coordinateKey(coordinate: MapCoordinate) {
  return `${coordinate.latitude.toFixed(6)}:${coordinate.longitude.toFixed(6)}`;
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
