import { getDatabase } from "../database/db";
import { haversineDistanceMeters } from "./distance";
import { withRequestDeadline } from "./networkRequest";
import { checkPlanningCancellation, PlanningError, validPlanPoint, type PlanningData, type PlanPoint } from "./routePlanning";

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const MAX_BYTES = 12_000_000;
const CACHE_AGE = 7 * 24 * 60 * 60 * 1000;

export function planningQuery(start: PlanPoint, radius: number) {
  if (!validPlanPoint(start) || radius < 500 || radius > 6500) throw new PlanningError("invalid");
  return `[out:json][timeout:22][maxsize:32000000];way["highway"]["area"!="yes"](around:${Math.ceil(radius)},${start.latitude},${start.longitude});(._;>;);out body;`;
}

export async function loadPlanningData(start: PlanPoint, radius: number, signal: AbortSignal): Promise<{ data: PlanningData; cached: boolean; fetchedAt: string }> {
  const query = planningQuery(start, radius);
  const db = await getDatabase();
  const cached = await db.getAllAsync<{ data: string; latitude: number; longitude: number; radius: number; fetched_at: string }>("SELECT * FROM planning_cache ORDER BY fetched_at DESC LIMIT 3");
  checkPlanningCancellation(signal);
  for (const row of cached) {
    if (Date.now() - Date.parse(row.fetched_at) < CACHE_AGE && haversineDistanceMeters(start, row) + radius <= row.radius) {
      try {
        const data = JSON.parse(row.data) as PlanningData;
        if (Array.isArray(data.elements) && !data.remark) return { data, cached: true, fetchedAt: row.fetched_at };
      } catch { /* Invalid disposable cache: retrieve it again. */ }
    }
  }
  for (const endpoint of ENDPOINTS) {
    checkPlanningCancellation(signal);
    try {
      const data = await withRequestDeadline(async requestSignal => {
        const response = await fetch(endpoint, { method: "POST", body: `data=${encodeURIComponent(query)}`, headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: requestSignal });
        if (!response.ok) throw new PlanningError("unavailable");
        if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new PlanningError("large");
        const body = await response.text();
        if (body.length > MAX_BYTES) throw new PlanningError("large");
        const parsed = JSON.parse(body) as PlanningData;
        if (!Array.isArray(parsed.elements) || parsed.remark) throw new PlanningError("unavailable");
        if (parsed.elements.length > 90000) throw new PlanningError("large");
        return parsed;
      }, 28000, signal);
      checkPlanningCancellation(signal);
      const fetchedAt = new Date().toISOString();
      await db.withExclusiveTransactionAsync(async tx => {
        checkPlanningCancellation(signal);
        await tx.runAsync("INSERT INTO planning_cache (latitude, longitude, radius, data, fetched_at) VALUES (?, ?, ?, ?, ?)", start.latitude, start.longitude, radius, JSON.stringify(data), fetchedAt);
        await tx.execAsync("DELETE FROM planning_cache WHERE id NOT IN (SELECT id FROM planning_cache ORDER BY id DESC LIMIT 3)");
      });
      checkPlanningCancellation(signal);
      return { data, cached: false, fetchedAt };
    } catch (error) {
      checkPlanningCancellation(signal);
      if (error instanceof PlanningError && error.code === "large") throw error;
    }
  }
  throw new PlanningError("unavailable");
}
