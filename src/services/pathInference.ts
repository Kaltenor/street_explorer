import { haversineDistanceMeters } from "./distance";
import { MODE_LOCATION_CONFIG } from "../constants/config";
import { MapCoordinate } from "./explorationArea";
import { OsmStreetSegment } from "../types/street";
import { ActivityMode, GpsPoint, RouteBridgeEvidence } from "../types/walk";

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
  bridgeEvidence: RouteBridgeEvidence;
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
  const routingContext = createStreetRoutingContext(streetSegments);

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
    createStreetRoutingContext(streetSegments)
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

type GraphConnectionType = "endpoint_join" | "intersection" | "snap" | "street";

type GraphEdge = {
  connectionType: GraphConnectionType;
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

type StreetSnapNode = {
  distanceMeters: number;
  edgeKey: string;
  key: string;
};

const MAX_STREET_SNAP_CANDIDATES = 6;
const STREET_SNAP_AMBIGUITY_METERS = 4;

function createStreetRoutingContext(
  streetSegments: OsmStreetSegment[]
): StreetRoutingContext | null {
  const usableStreetSegments = streetSegments
    .filter((segment) => isStreetUsable(segment));

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
  const maxSnapDistanceMeters = 30;
  const startNodes = attachPointCandidatesToStreetGraph(
    startPoint,
    graph,
    routingContext.streetSegments,
    String(routingContext.nextSnapId++),
    maxSnapDistanceMeters
  );
  const endNodes = attachPointCandidatesToStreetGraph(
    endPoint,
    graph,
    routingContext.streetSegments,
    String(routingContext.nextSnapId++),
    maxSnapDistanceMeters
  );

  if (startNodes.length === 0 || endNodes.length === 0) {
    return null;
  }

  for (const startNode of startNodes) {
    for (const endNode of endNodes) {
      if (startNode.edgeKey === endNode.edgeKey) {
        connectGraphNodes(graph, startNode.key, endNode.key, "street");
      }
    }
  }

  let selectedMatch: {
    endNode: StreetSnapNode;
    route: NonNullable<ReturnType<typeof findShortestPath>>;
    routeDistance: number;
    startNode: StreetSnapNode;
  } | null = null;

  for (const startNode of startNodes) {
    for (const endNode of endNodes) {
      const candidateRoute = findShortestPath(graph, startNode.key, endNode.key);

      if (!candidateRoute || candidateRoute.keys.length < 2) {
        continue;
      }

      const candidateDistance =
        startNode.distanceMeters + candidateRoute.distanceMeters + endNode.distanceMeters;

      if (!selectedMatch || candidateDistance < selectedMatch.routeDistance) {
        selectedMatch = {
          endNode,
          route: candidateRoute,
          routeDistance: candidateDistance,
          startNode
        };
      }
    }
  }

  if (!selectedMatch) {
    return null;
  }

  const { endNode, route, routeDistance, startNode } = selectedMatch;
  const straightDistance = haversineDistanceMeters(startPoint, endPoint);
  const seconds = getSecondsBetweenPoints(startPoint, endPoint);
  // Snap connectors correct GPS drift onto the street graph; they are not
  // additional walked distance. Counting them against the speed ceiling can
  // reject a valid outage whose raw endpoints already passed the hard speed
  // guard, especially when the two fixes drift to opposite sides of a road.
  const routedStreetDistance = route.distanceMeters;
  const speedMetersPerSecond = seconds > 0 ? routedStreetDistance / seconds : 0;

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
  const endpointJoinEdges = route.edges.filter(
    (edge) => edge.connectionType === "endpoint_join"
  );
  const endpointJoinCount = endpointJoinEdges.length;
  const intersectionJoinCount = new Set(
    route.keys.filter((key) => key.startsWith("intersection:"))
  ).size;
  const isHighConfidence =
    endpointJoinCount === 0 &&
    startNode.distanceMeters <= 12 &&
    endNode.distanceMeters <= 12 &&
    routeDistance <= Math.max(straightDistance * 1.35, straightDistance + 60);

  return {
    bridgeEvidence: {
      acceptanceReason: endpointJoinCount > 0
        ? "near_endpoint_join"
        : intersectionJoinCount > 0
          ? "geometric_crossing"
          : "exact_topology",
      endSnapDistanceMeters: endNode.distanceMeters,
      endpointJoinCount,
      gapDistanceMeters: straightDistance,
      gapDurationSeconds: seconds,
      inferredCellCount: 0,
      intersectionJoinCount,
      maxEndpointJoinDistanceMeters: endpointJoinEdges.reduce(
        (maximum, edge) => Math.max(maximum, edge.distanceMeters),
        0
      ),
      routeDistanceMeters: routeDistance,
      schemaVersion: 1,
      sourceStreetSegmentCount: routingContext.streetSegments.length,
      startSnapDistanceMeters: startNode.distanceMeters,
      straightDistanceMeters: straightDistance
    },
    confidence: isHighConfidence ? "high" : "medium",
    distanceMeters: routeDistance,
    endPoint,
    points: routePoints,
    source: "inferred",
    startPoint,
    type: "inferred"
  };
}

function isStreetUsable(segment: OsmStreetSegment) {
  if (
    ["motorway", "motorway_link", "trunk", "trunk_link"].includes(segment.highway)
  ) {
    return false;
  }

  const access = segment.access?.toLowerCase() ?? null;
  const foot = segment.foot?.toLowerCase() ?? null;
  const explicitlyWalkable = ["designated", "permissive", "yes"].includes(foot ?? "");

  if (["no", "private", "use_sidepath"].includes(foot ?? "")) {
    return false;
  }

  if (["no", "private"].includes(access ?? "") && !explicitlyWalkable) {
    return false;
  }

  return true;
}

type StreetGraphLine = {
  from: MapCoordinate;
  fromKey: string;
  segment: OsmStreetSegment;
  to: MapCoordinate;
  toKey: string;
};

type ProjectedPoint = {
  x: number;
  y: number;
};

function buildStreetGraph(streetSegments: OsmStreetSegment[]) {
  const graph = new Map<string, GraphNode>();
  const lines: StreetGraphLine[] = [];

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

      ensureGraphNode(graph, fromKey, from).edges.push({
        connectionType: "street",
        distanceMeters,
        key: toKey
      });
      ensureGraphNode(graph, toKey, to).edges.push({
        connectionType: "street",
        distanceMeters,
        key: fromKey
      });
      lines.push({ from, fromKey, segment, to, toKey });
    }
  }

  connectSafeGeometricCrossings(graph, lines);
  connectSafeEndpointJoins(graph, lines);

  return graph;
}

function connectSafeGeometricCrossings(
  graph: Map<string, GraphNode>,
  lines: StreetGraphLine[]
) {
  const originLatitude = lines[0]?.from.latitude ?? 0;
  const bucketSizeMeters = 32;
  const buckets = new Map<string, number[]>();

  lines.forEach((line, index) => {
    if (!isGroundLevelStreet(line.segment)) {
      return;
    }

    const from = projectForTopology(line.from, originLatitude);
    const to = projectForTopology(line.to, originLatitude);
    const minX = Math.floor((Math.min(from.x, to.x) - 0.5) / bucketSizeMeters);
    const maxX = Math.floor((Math.max(from.x, to.x) + 0.5) / bucketSizeMeters);
    const minY = Math.floor((Math.min(from.y, to.y) - 0.5) / bucketSizeMeters);
    const maxY = Math.floor((Math.max(from.y, to.y) + 0.5) / bucketSizeMeters);

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = `${x}:${y}`;
        const entries = buckets.get(key) ?? [];
        entries.push(index);
        buckets.set(key, entries);
      }
    }
  });

  const checkedPairs = new Set<string>();

  for (const entries of buckets.values()) {
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
        const leftLineIndex = entries[leftIndex];
        const rightLineIndex = entries[rightIndex];

        if (leftLineIndex === undefined || rightLineIndex === undefined) {
          continue;
        }

        const pairKey = leftLineIndex < rightLineIndex
          ? `${leftLineIndex}:${rightLineIndex}`
          : `${rightLineIndex}:${leftLineIndex}`;

        if (checkedPairs.has(pairKey)) {
          continue;
        }

        checkedPairs.add(pairKey);
        const left = lines[leftLineIndex];
        const right = lines[rightLineIndex];

        if (
          !left ||
          !right ||
          left.segment.id === right.segment.id ||
          !isGroundLevelStreet(right.segment) ||
          sharesExactEndpoint(left, right)
        ) {
          continue;
        }

        const crossing = getLineIntersection(left, right, originLatitude);

        if (!crossing) {
          continue;
        }

        const crossingKey = `intersection:${coordinateKey(crossing)}`;
        ensureGraphNode(graph, crossingKey, crossing);

        for (const endpointKey of [left.fromKey, left.toKey, right.fromKey, right.toKey]) {
          connectGraphNodes(graph, crossingKey, endpointKey, "intersection");
        }
      }
    }
  }
}

function connectSafeEndpointJoins(
  graph: Map<string, GraphNode>,
  lines: StreetGraphLine[]
) {
  const maximumJoinMeters = 8;
  const originLatitude = lines[0]?.from.latitude ?? 0;
  const endpoints = lines.flatMap((line, lineIndex) => [
    { coordinate: line.from, key: line.fromKey, lineIndex, segment: line.segment },
    { coordinate: line.to, key: line.toKey, lineIndex, segment: line.segment }
  ]);
  const buckets = new Map<string, number[]>();

  endpoints.forEach((endpoint, index) => {
    const projected = projectForTopology(endpoint.coordinate, originLatitude);
    const x = Math.floor(projected.x / maximumJoinMeters);
    const y = Math.floor(projected.y / maximumJoinMeters);
    const key = `${x}:${y}`;
    const entries = buckets.get(key) ?? [];
    entries.push(index);
    buckets.set(key, entries);
  });

  const checkedPairs = new Set<string>();

  endpoints.forEach((left, leftIndex) => {
    const projected = projectForTopology(left.coordinate, originLatitude);
    const x = Math.floor(projected.x / maximumJoinMeters);
    const y = Math.floor(projected.y / maximumJoinMeters);

    for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
      for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
        for (const rightIndex of buckets.get(`${x + deltaX}:${y + deltaY}`) ?? []) {
          if (rightIndex <= leftIndex) {
            continue;
          }

          const right = endpoints[rightIndex];
          const pairKey = `${leftIndex}:${rightIndex}`;

          if (
            !right ||
            checkedPairs.has(pairKey) ||
            left.lineIndex === right.lineIndex ||
            left.key === right.key ||
            !isGradeCompatible(left.segment, right.segment)
          ) {
            continue;
          }

          checkedPairs.add(pairKey);
          const distanceMeters = haversineDistanceMeters(
            toGpsPoint(left.coordinate),
            toGpsPoint(right.coordinate)
          );

          if (distanceMeters > 0.15 && distanceMeters <= maximumJoinMeters) {
            connectGraphNodes(
              graph,
              left.key,
              right.key,
              "endpoint_join",
              distanceMeters
            );
          }
        }
      }
    }
  });
}

function isGroundLevelStreet(segment: OsmStreetSegment) {
  return !segment.bridge && !segment.tunnel && segment.layer === 0;
}

function isGradeCompatible(left: OsmStreetSegment, right: OsmStreetSegment) {
  return (
    left.bridge === right.bridge &&
    left.tunnel === right.tunnel &&
    left.layer === right.layer
  );
}

function sharesExactEndpoint(left: StreetGraphLine, right: StreetGraphLine) {
  return (
    left.fromKey === right.fromKey ||
    left.fromKey === right.toKey ||
    left.toKey === right.fromKey ||
    left.toKey === right.toKey
  );
}

function getLineIntersection(
  left: StreetGraphLine,
  right: StreetGraphLine,
  originLatitude: number
): MapCoordinate | null {
  const p = projectForTopology(left.from, originLatitude);
  const p2 = projectForTopology(left.to, originLatitude);
  const q = projectForTopology(right.from, originLatitude);
  const q2 = projectForTopology(right.to, originLatitude);
  const r = { x: p2.x - p.x, y: p2.y - p.y };
  const s = { x: q2.x - q.x, y: q2.y - q.y };
  const denominator = crossProduct(r, s);

  if (Math.abs(denominator) < 0.000001) {
    return null;
  }

  const qMinusP = { x: q.x - p.x, y: q.y - p.y };
  const leftProgress = crossProduct(qMinusP, s) / denominator;
  const rightProgress = crossProduct(qMinusP, r) / denominator;
  const tolerance = 0.00001;

  if (
    leftProgress < -tolerance ||
    leftProgress > 1 + tolerance ||
    rightProgress < -tolerance ||
    rightProgress > 1 + tolerance
  ) {
    return null;
  }

  const progress = Math.max(0, Math.min(1, leftProgress));

  return {
    latitude: left.from.latitude + (left.to.latitude - left.from.latitude) * progress,
    longitude: left.from.longitude + (left.to.longitude - left.from.longitude) * progress
  };
}

function projectForTopology(
  coordinate: MapCoordinate,
  originLatitude: number
): ProjectedPoint {
  const longitudeScale = Math.max(
    1,
    111_320 * Math.cos((originLatitude * Math.PI) / 180)
  );

  return {
    x: coordinate.longitude * longitudeScale,
    y: coordinate.latitude * 111_320
  };
}

function crossProduct(left: ProjectedPoint, right: ProjectedPoint) {
  return left.x * right.y - left.y * right.x;
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

function attachPointCandidatesToStreetGraph(
  point: GpsPoint,
  graph: Map<string, GraphNode>,
  streetSegments: OsmStreetSegment[],
  keySuffix: string,
  maxSnapDistanceMeters: number
): StreetSnapNode[] {
  const candidatesByEdge = new Map<string, {
    coordinate: MapCoordinate;
    distanceMeters: number;
    edgeKey: string;
    fromKey: string;
    toKey: string;
  }>();

  for (const segment of streetSegments) {
    for (let index = 1; index < segment.coordinates.length; index += 1) {
      const from = segment.coordinates[index - 1];
      const to = segment.coordinates[index];

      if (!from || !to) {
        continue;
      }

      const coordinate = projectCoordinateOntoSegment(point, from, to);
      const distanceMeters = haversineDistanceMeters(point, toGpsPoint(coordinate));
      const fromKey = coordinateKey(from);
      const toKey = coordinateKey(to);
      const edgeKey = [fromKey, toKey].sort().join(">");
      const existing = candidatesByEdge.get(edgeKey);

      if (!existing || distanceMeters < existing.distanceMeters) {
        candidatesByEdge.set(edgeKey, {
          coordinate,
          distanceMeters,
          edgeKey,
          fromKey,
          toKey
        });
      }
    }
  }

  const rankedCandidates = [...candidatesByEdge.values()].sort(
    (left, right) => left.distanceMeters - right.distanceMeters
  );
  const nearestDistance = rankedCandidates[0]?.distanceMeters;

  if (nearestDistance === undefined || nearestDistance > maxSnapDistanceMeters) {
    return [];
  }

  return rankedCandidates
    .filter((candidate) =>
      candidate.distanceMeters <= maxSnapDistanceMeters &&
      candidate.distanceMeters <= nearestDistance + STREET_SNAP_AMBIGUITY_METERS
    )
    .slice(0, MAX_STREET_SNAP_CANDIDATES)
    .map((candidate, index) => {
      const key = `snap:${keySuffix}:${index}`;
      ensureGraphNode(graph, key, candidate.coordinate);
      connectGraphNodes(graph, key, candidate.fromKey, "snap");
      connectGraphNodes(graph, key, candidate.toKey, "snap");

      return {
        distanceMeters: candidate.distanceMeters,
        edgeKey: candidate.edgeKey,
        key
      };
    });
}

function connectGraphNodes(
  graph: Map<string, GraphNode>,
  leftKey: string,
  rightKey: string,
  connectionType: GraphConnectionType,
  explicitDistanceMeters?: number
) {
  if (leftKey === rightKey) {
    return;
  }

  const left = graph.get(leftKey);
  const right = graph.get(rightKey);

  if (!left || !right) {
    return;
  }

  const distanceMeters = explicitDistanceMeters ?? haversineDistanceMeters(
    toGpsPoint(left.coordinate),
    toGpsPoint(right.coordinate)
  );

  if (!left.edges.some((edge) => edge.key === rightKey)) {
    left.edges.push({ connectionType, distanceMeters, key: rightKey });
  }

  if (!right.edges.some((edge) => edge.key === leftKey)) {
    right.edges.push({ connectionType, distanceMeters, key: leftKey });
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
  const previous = new Map<string, { edge: GraphEdge; key: string }>();
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
        previous.set(edge.key, { edge, key: current.key });
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

  const edges: GraphEdge[] = [];
  const keys = [endKey];
  let currentKey = endKey;

  while (currentKey !== startKey) {
    const previousStep = previous.get(currentKey);

    if (!previousStep) {
      return null;
    }

    edges.unshift(previousStep.edge);
    keys.unshift(previousStep.key);
    currentKey = previousStep.key;
  }

  return {
    distanceMeters: distance,
    edges,
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
