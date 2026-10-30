import type { SQLiteDatabase } from "expo-sqlite";
import { getDatabase } from "./db";
import { assertRoutePlan, FOLLOWING_PLAN_KEY, MAX_SAVED_PLANS, type RoutePlan } from "../services/routePlanning";

export { FOLLOWING_PLAN_KEY } from "../services/routePlanning";
export type FollowingPlan = { plan: RoutePlan; sessionId: number | null };

export async function getRoutePlans(database?: SQLiteDatabase) {
  const db = database ?? await getDatabase();
  const rows = await db.getAllAsync<{ data: string }>("SELECT data FROM route_plans ORDER BY updated_at DESC LIMIT 51");
  const plans = rows.map(row => { const plan: unknown = JSON.parse(row.data); assertRoutePlan(plan); return plan; });
  if (plans.length > MAX_SAVED_PLANS) throw new Error("Too many route plans");
  return plans;
}
export async function saveRoutePlan(plan: RoutePlan) {
  assertRoutePlan(plan);
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async tx => {
    const exists = await tx.getFirstAsync("SELECT id FROM route_plans WHERE id = ?", plan.id);
    const count = await tx.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM route_plans");
    if (!exists && (count?.n ?? 0) >= MAX_SAVED_PLANS) throw new Error("Plan limit reached");
    await tx.runAsync("INSERT INTO route_plans (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at", plan.id, JSON.stringify(plan), plan.updatedAt);
  });
}
export async function deleteRoutePlan(id: string) {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM route_plans WHERE id = ?", id);
}
export async function getFollowingPlan(): Promise<FollowingPlan | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", FOLLOWING_PLAN_KEY);
  if (!row) return null;
  const value = JSON.parse(row.value) as FollowingPlan;
  assertRoutePlan(value.plan);
  if (value.sessionId !== null && (!Number.isInteger(value.sessionId) || value.sessionId < 1)) throw new Error("Invalid plan association");
  return value;
}
export async function saveFollowingPlan(value: FollowingPlan | null) {
  const db = await getDatabase();
  if (!value) { await db.runAsync("DELETE FROM app_settings WHERE key = ?", FOLLOWING_PLAN_KEY); return; }
  assertRoutePlan(value.plan);
  await db.runAsync("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", FOLLOWING_PLAN_KEY, JSON.stringify(value));
}
