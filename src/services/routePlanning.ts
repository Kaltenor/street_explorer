import { haversineDistanceMeters } from "./distance";
import { collectPlannedRouteCellIds, explorationCellKeyToCenterCoordinate, EXPLORATION_CELL_SIZE_METERS } from "./explorationArea";

export type PlanPoint = { latitude: number; longitude: number };
export type PlanStop = PlanPoint & { label: string };
export type PlanningPreference = "balanced" | "discovery" | "medals";
export type RoutePlan = {
  id: string;
  name: string;
  updatedAt: string;
  stops: PlanStop[];
  returnToStart: boolean;
  coordinates: PlanPoint[];
  distanceMeters: number;
  durationMinutes: number;
  estimatedNewMeters: number;
  estimatedNewCellCount?: number;
  medalOpportunities: number;
  targetMeters: number | null;
  preference: PlanningPreference;
};
export type PlanningElement = {
  type: string; id: number; lat?: number; lon?: number; nodes?: number[];
  tags?: Record<string, string>;
};
export type PlanningData = { elements: PlanningElement[]; remark?: string };
type Edge = { to: string; meters: number; key: string; fresh: boolean; inScope: boolean };
type Vertex = { point: PlanPoint; edges: Edge[] };
export type PlanningGraph = Map<string, Vertex>;
export type PlanningContext = {
  explored: (point: PlanPoint) => boolean;
  forbidden: (point: PlanPoint) => boolean;
  inScope?: (point: PlanPoint) => boolean;
  medals: PlanPoint[];
  isNewCell?: (cellId: string) => boolean;
};

export function estimateNewRouteCells(coordinates: readonly PlanPoint[], context: PlanningContext) {
  return collectPlannedRouteCellIds(coordinates).filter(id => {
    if (context.isNewCell) return context.isNewCell(id);
    const point = explorationCellKeyToCenterCoordinate(id);
    return !context.explored(point) && !context.forbidden(point);
  }).length;
}
export const MAX_PLAN_METERS = 6000;
export const FOLLOWING_PLAN_KEY = "following_route_plan";
export const MAX_SAVED_PLANS = 50;
const ALLOWED = new Set(["yes", "designated", "permissive", "official"]);
const HIGHWAYS = new Set(["footway", "pedestrian", "path", "steps", "living_street", "residential", "service", "track", "unclassified", "tertiary", "tertiary_link", "secondary", "secondary_link", "primary", "primary_link"]);

export class PlanningError extends Error {
  constructor(public code: "unavailable" | "large" | "snap" | "disconnected" | "distance" | "suggestion" | "cancelled" | "invalid") {
    super(code); this.name = "PlanningError";
  }
}
export function checkPlanningCancellation(signal?: AbortSignal) {
  if (signal?.aborted) throw new PlanningError("cancelled");
}
async function yieldPlanning(signal?: AbortSignal) {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  checkPlanningCancellation(signal);
}
export function validPlanPoint(point: unknown): point is PlanPoint {
  if (!point || typeof point !== "object") return false;
  const p = point as PlanPoint;
  return Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 85 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180;
}

// Conservative routing: foot overrides general access; unresolved time restrictions
// and unknown barriers are excluded. Shared OSM node IDs are the only junctions.
export function pedestrianAccess(tags: Record<string, string>, node = false) {
  if (tags["foot:conditional"] || (!tags.foot && tags["access:conditional"]) || tags.opening_hours) return false;
  if (tags.foot && !ALLOWED.has(tags.foot ?? "")) return false;
  if (!tags.foot && tags.access && !ALLOWED.has(tags.access)) return false;
  if (tags.locked === "yes") return false;
  if (node) return !tags.barrier || ALLOWED.has(tags.foot ?? "") || ["bollard", "cycle_barrier", "entrance", "kerb"].includes(tags.barrier);
  return tags.area !== "yes" && (HIGHWAYS.has(tags.highway ?? "") || (tags.highway === "cycleway" && ALLOWED.has(tags.foot ?? ""))) && tags.indoor !== "yes";
}

export async function buildPlanningGraph(data: PlanningData, context: PlanningContext, signal?: AbortSignal): Promise<PlanningGraph> {
  if (!Array.isArray(data.elements) || data.remark) throw new PlanningError("unavailable");
  if (data.elements.length > 90000) throw new PlanningError("large");
  const nodes = new Map<number, PlanningElement>();
  for (const element of data.elements) if (element.type === "node") nodes.set(element.id, element);
  const graph: PlanningGraph = new Map();
  let processed = 0;
  const add = (key: string, point: PlanPoint) => {
    if (!graph.has(key)) graph.set(key, { point, edges: [] });
    if (graph.size > 70000) throw new PlanningError("large");
  };
  for (const way of data.elements) {
    if (++processed % 128 === 0) await yieldPlanning(signal);
    if (way.type !== "way" || !way.nodes || !pedestrianAccess(way.tags ?? {})) continue;
    for (let i = 1; i < way.nodes.length; i++) {
      const a = nodes.get(way.nodes[i - 1]!), b = nodes.get(way.nodes[i]!);
      if (!a || !b || !pedestrianAccess(a.tags ?? {}, true) || !pedestrianAccess(b.tags ?? {}, true)) continue;
      const start = { latitude: a.lat!, longitude: a.lon! }, end = { latitude: b.lat!, longitude: b.lon! };
      if (!validPlanPoint(start) || !validPlanPoint(end)) throw new PlanningError("unavailable");
      const meters = haversineDistanceMeters(start, end);
      if (!meters || meters > MAX_PLAN_METERS || Math.abs(start.longitude - end.longitude) > 180) continue;
      const steps = Math.ceil(meters / 10);
      const chain = Array.from({ length: steps + 1 }, (_, j) => ({
        key: j === 0 ? `n${a.id}` : j === steps ? `n${b.id}` : `w${way.id}:${i}:${j}`,
        point: { latitude: start.latitude + (end.latitude - start.latitude) * j / steps, longitude: start.longitude + (end.longitude - start.longitude) * j / steps }
      }));
      // Reject the entire OSM edge if it crosses a user-marked inaccessible cell.
      if (chain.some(p => context.forbidden(p.point))) continue;
      for (let j = 1; j < chain.length; j++) {
        const left = chain[j - 1]!, right = chain[j]!;
        add(left.key, left.point); add(right.key, right.point);
        const key = `${way.id}:${i}:${j}`;
        const fresh = estimateNewRouteCells([left.point, right.point], context) > 0;
        const inScope = context.inScope?.(right.point) ?? true;
        const edge = { meters: meters / steps, key, fresh, inScope };
        if (way.tags?.["oneway:foot"] !== "-1") graph.get(left.key)!.edges.push({ ...edge, to: right.key });
        if (way.tags?.["oneway:foot"] !== "yes" && way.tags?.["oneway:foot"] !== "1") graph.get(right.key)!.edges.push({ ...edge, to: left.key });
      }
    }
  }
  checkPlanningCancellation(signal);
  if (!graph.size) throw new PlanningError("disconnected");
  return graph;
}

function snap(graph: PlanningGraph, point: PlanPoint) {
  if (!validPlanPoint(point)) throw new PlanningError("invalid");
  let key = "", nearest = 40;
  for (const [id, vertex] of graph) {
    const distance = haversineDistanceMeters(point, vertex.point);
    if (distance < nearest && vertex.edges.length) { key = id; nearest = distance; }
  }
  if (!key) throw new PlanningError("snap");
  return key;
}

class MinHeap {
  items: { key: string; cost: number }[] = [];
  push(value: { key: string; cost: number }) {
    let i = this.items.length; this.items.push(value);
    while (i > 0) { const p = (i - 1) >> 1; if (this.items[p]!.cost <= value.cost) break; this.items[i] = this.items[p]!; i = p; }
    this.items[i] = value;
  }
  pop() {
    const first = this.items[0]!, last = this.items.pop()!;
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1]!.cost < this.items[child]!.cost) child++;
        if (this.items[child]!.cost >= last.cost) break;
        this.items[i] = this.items[child]!; i = child;
      }
      this.items[i] = last;
    }
    return first;
  }
}
type GraphRoute = { keys: string[]; edges: Edge[]; meters: number };
async function shortest(graph: PlanningGraph, start: string, end: string, preference: PlanningPreference, used: Set<string>, signal?: AbortSignal): Promise<GraphRoute> {
  const destination = graph.get(end)!.point;
  const heuristic = (key: string) => haversineDistanceMeters(graph.get(key)!.point, destination) * 0.78;
  const heap = new MinHeap(); heap.push({ key: start, cost: heuristic(start) });
  const costs = new Map([[start, 0]]), lengths = new Map([[start, 0]]);
  const parents = new Map<string, { from: string; edge: Edge }>();
  let visits = 0;
  while (heap.items.length) {
    if (++visits % 512 === 0) await yieldPlanning(signal);
    const current = heap.pop();
    const currentCost = costs.get(current.key)!;
    if (current.cost !== currentCost + heuristic(current.key)) continue;
    if (current.key === end) {
      const keys = [end], edges: Edge[] = [];
      let key = end;
      while (key !== start) { const parent = parents.get(key)!; edges.push(parent.edge); keys.push(parent.from); key = parent.from; }
      return { keys: keys.reverse(), edges: edges.reverse(), meters: lengths.get(end)! };
    }
    for (const edge of graph.get(current.key)!.edges) {
      const meters = lengths.get(current.key)! + edge.meters;
      if (meters > MAX_PLAN_METERS) continue;
      const cost = currentCost + edge.meters * (used.has(edge.key) ? 3 : 1) * (!edge.inScope ? 1.6 : 1) * (edge.fresh && preference !== "medals" ? 0.78 : 1);
      if (cost >= (costs.get(edge.to) ?? Infinity)) continue;
      costs.set(edge.to, cost); lengths.set(edge.to, meters); parents.set(edge.to, { from: current.key, edge }); heap.push({ key: edge.to, cost: cost + heuristic(edge.to) });
    }
  }
  throw new PlanningError("disconnected");
}

export async function planThroughStops(graph: PlanningGraph, stops: PlanStop[], returnToStart: boolean, context: PlanningContext, preference: PlanningPreference = "balanced", signal?: AbortSignal): Promise<RoutePlan> {
  checkPlanningCancellation(signal);
  if (stops.length < 2 || stops.length > 10) throw new PlanningError("invalid");
  const snapped = stops.map(p => snap(graph, p));
  const itinerary = returnToStart ? [...snapped, snapped[0]] : snapped;
  let lowerBound = 0;
  for (let i = 1; i < itinerary.length; i++) lowerBound += haversineDistanceMeters(graph.get(itinerary[i - 1]!)!.point, graph.get(itinerary[i]!)!.point);
  if (lowerBound > MAX_PLAN_METERS) throw new PlanningError("distance");
  const keys: string[] = [], used = new Set<string>();
  let distanceMeters = 0, estimatedNewMeters = 0;
  for (let i = 1; i < itinerary.length; i++) {
    const route = await shortest(graph, itinerary[i - 1]!, itinerary[i]!, preference, used, signal);
    keys.push(...(keys.length ? route.keys.slice(1) : route.keys));
    distanceMeters += route.meters;
    if (distanceMeters > MAX_PLAN_METERS) throw new PlanningError("distance");
    for (const edge of route.edges) {
      if (!used.has(edge.key) && edge.fresh) estimatedNewMeters += edge.meters;
      used.add(edge.key);
    }
  }
  if (distanceMeters < 25) throw new PlanningError("distance");
  const coordinates = keys.map(key => graph.get(key)!.point);
  let medalOpportunities = 0;
  for (const medal of context.medals) {
    if (coordinates.some(point => haversineDistanceMeters(point, medal) <= 25)) medalOpportunities++;
  }
  return { id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, name: "", updatedAt: new Date().toISOString(),
    stops: stops.map((p, i) => ({ ...graph.get(snapped[i]!)!.point, label: p.label })), returnToStart,
    coordinates, distanceMeters, durationMinutes: Math.ceil(distanceMeters / 75), estimatedNewMeters,
    estimatedNewCellCount: estimateNewRouteCells(coordinates, context), medalOpportunities, targetMeters: null, preference };
}

export async function suggestRoute(graph: PlanningGraph, start: PlanStop, targetMeters: number, returnToStart: boolean, context: PlanningContext, preference: PlanningPreference, seed: number, signal?: AbortSignal, radiusScale = 1): Promise<RoutePlan> {
  if (![2000, 4000, 6000].includes(targetMeters)) throw new PlanningError("invalid");
  const origin = graph.get(snap(graph, start))!.point;
  const radius = targetMeters * (returnToStart ? 0.23 : 0.72) * radiusScale;
  const sectors: Array<{ point: PlanPoint; error: number } | undefined> = Array(16);
  for (const vertex of graph.values()) {
    const d = haversineDistanceMeters(origin, vertex.point);
    if (d < radius * 0.35 || d > targetMeters) continue;
    const angle = Math.atan2(vertex.point.latitude - origin.latitude, (vertex.point.longitude - origin.longitude) * Math.cos(origin.latitude * Math.PI / 180));
    const sector = Math.floor((angle + Math.PI) / (2 * Math.PI) * 16) % 16;
    const error = Math.abs(d - radius) + ((context.inScope && !context.inScope(vertex.point)) ? radius : 0);
    if (!sectors[sector] || error < sectors[sector]!.error) sectors[sector] = { point: vertex.point, error };
  }
  const candidates: PlanStop[][] = [];
  for (let k = 0; k < 16; k++) {
    const i = (k + seed * 3) % 16, a = sectors[i], b = sectors[(i + 4 + seed % 2) % 16];
    if (!a) continue;
    candidates.push([start, { ...a.point, label: "" }, ...(returnToStart && b ? [{ ...b.point, label: "" }] : [])]);
  }
  if (preference !== "discovery") for (const medal of [...context.medals].sort((a, b) => haversineDistanceMeters(origin, a) - haversineDistanceMeters(origin, b)).slice(0, 8)) {
    if (haversineDistanceMeters(origin, medal) <= targetMeters * (returnToStart ? 0.45 : 0.9)) {
      candidates.unshift([start, { ...medal, label: "" }]);
    }
  }
  let best: RoutePlan | null = null, bestScore = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    await yieldPlanning(signal);
    try {
      const plan = await planThroughStops(graph, candidates[i]!, returnToStart, context, preference, signal);
      if (plan.distanceMeters < targetMeters * 0.75 || plan.distanceMeters > Math.min(MAX_PLAN_METERS, targetMeters * 1.15)) continue;
      const score = -Math.abs(plan.distanceMeters - targetMeters) * 1.3 + (plan.estimatedNewCellCount ?? 0) * EXPLORATION_CELL_SIZE_METERS * (preference === "discovery" ? 1 : 0.45) + plan.medalOpportunities * (preference === "medals" ? 650 : 180) + Math.sin(i * 7 + seed * 17) * targetMeters * 0.06;
      if (score > bestScore) { best = plan; bestScore = score; }
    } catch (error) {
      if (!(error instanceof PlanningError) || !["disconnected", "distance", "snap"].includes(error.code)) throw error;
    }
  }
  // Dense grids and indirect networks can exceed the budget despite nearby stops.
  // Retry one smaller ring, always retaining the original distance acceptance band.
  if (!best && radiusScale === 1) return suggestRoute(graph, start, targetMeters, returnToStart, context, preference, seed, signal, 0.8);
  if (!best) throw new PlanningError("suggestion");
  return { ...best, targetMeters };
}

export function assertRoutePlan(value: unknown): asserts value is RoutePlan {
  const p = value as RoutePlan;
  if (!p || typeof p.id !== "string" || p.id.length > 100 || !p.id || typeof p.name !== "string" || !p.name.trim() || p.name.length > 80 ||
    typeof p.updatedAt !== "string" || !Number.isFinite(Date.parse(p.updatedAt)) || typeof p.returnToStart !== "boolean" ||
    !["balanced", "discovery", "medals"].includes(p.preference) || (p.targetMeters !== null && ![2000, 4000, 6000].includes(p.targetMeters)) ||
    !Array.isArray(p.stops) || p.stops.length < 2 || p.stops.length > 10 || p.stops.some(s => !validPlanPoint(s) || typeof s.label !== "string" || s.label.length > 100) ||
    !Array.isArray(p.coordinates) || p.coordinates.length < 2 || p.coordinates.length > 15000 || p.coordinates.some(c => !validPlanPoint(c)) ||
    !Number.isFinite(p.distanceMeters) || p.distanceMeters < 25 || p.distanceMeters > MAX_PLAN_METERS ||
    !Number.isFinite(p.estimatedNewMeters) || p.estimatedNewMeters < 0 || p.estimatedNewMeters > p.distanceMeters + 1 ||
    !Number.isInteger(p.medalOpportunities) || p.medalOpportunities < 0 || p.medalOpportunities > 10000 ||
    p.durationMinutes !== Math.ceil(p.distanceMeters / 75)) throw new PlanningError("invalid");
  if (p.estimatedNewCellCount !== undefined && (!Number.isInteger(p.estimatedNewCellCount) || p.estimatedNewCellCount < 0 || p.estimatedNewCellCount > 1_000_000)) throw new PlanningError("invalid");
  let measured = 0;
  for (let i = 1; i < p.coordinates.length; i++) measured += haversineDistanceMeters(p.coordinates[i - 1]!, p.coordinates[i]!);
  if (Math.abs(measured - p.distanceMeters) > Math.max(5, p.distanceMeters * 0.01) ||
    haversineDistanceMeters(p.coordinates[0]!, p.stops[0]!) > 1 ||
    haversineDistanceMeters(p.coordinates.at(-1)!, p.returnToStart ? p.stops[0]! : p.stops.at(-1)!) > 1) throw new PlanningError("invalid");
}
