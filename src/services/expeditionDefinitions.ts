import type {
  DistrictExpeditionDefinition,
  DistrictExpeditionKind
} from "../types/expedition";

export const DAILY_DISTRICT_EXPEDITION_COUNT = 5;

type ExpeditionCatalogEntry = {
  kind: DistrictExpeditionKind;
  medalOpportunities?: number;
  streetOpportunities?: number;
  targets: readonly number[];
};

export const DISTRICT_EXPEDITION_CATALOG: readonly ExpeditionCatalogEntry[] = [
  { kind: "explore_cells", targets: [15, 20, 25] },
  { kind: "frontier_push", targets: [8, 12, 16] },
  { kind: "seal_breach", targets: [4, 6, 8] },
  { kind: "dense_survey", targets: [8, 12, 16] },
  { kind: "sector_sweep", targets: [3] },
  { kind: "northward_scout", targets: [8, 12] },
  { kind: "southward_scout", targets: [8, 12] },
  { kind: "eastward_scout", targets: [8, 12] },
  { kind: "westward_scout", targets: [8, 12] },
  { kind: "boundary_scout", targets: [6, 9] },
  { kind: "district_heart", targets: [6, 9] },
  { kind: "outer_reach", targets: [8, 12] },
  { kind: "complete_street", streetOpportunities: 1, targets: [1] },
  { kind: "complete_street_pair", streetOpportunities: 2, targets: [2] },
  { kind: "street_and_cells", streetOpportunities: 1, targets: [2] },
  { kind: "close_loop", targets: [1] },
  { kind: "double_loop", targets: [2] },
  { kind: "loop_and_cells", targets: [2] },
  { kind: "loop_and_frontier", targets: [2] },
  { kind: "street_and_loop", streetOpportunities: 1, targets: [2] },
  { kind: "collect_medal", medalOpportunities: 1, targets: [1] },
  { kind: "collect_medal_pair", medalOpportunities: 2, targets: [2] },
  { kind: "medal_and_cells", medalOpportunities: 1, targets: [2] },
  { kind: "field_triad", streetOpportunities: 1, targets: [3] },
  {
    kind: "grand_tour",
    medalOpportunities: 1,
    streetOpportunities: 1,
    targets: [4]
  }
] as const;

export function buildDailyExpeditionDefinitions(input: {
  districtId: string;
  excludedKinds?: readonly DistrictExpeditionKind[];
  localDate: string;
  medalOpportunityCount: number;
  slots?: readonly number[];
  streetOpportunityCount: number;
}): DistrictExpeditionDefinition[] {
  const seed = hashText(`${input.districtId}:${input.localDate}`);
  const excludedKinds = new Set(input.excludedKinds ?? []);
  const slots = input.slots ?? Array.from(
    { length: DAILY_DISTRICT_EXPEDITION_COUNT },
    (_, index) => index
  );
  const eligible = DISTRICT_EXPEDITION_CATALOG.filter(
    (entry) =>
      !excludedKinds.has(entry.kind) &&
      input.medalOpportunityCount >= (entry.medalOpportunities ?? 0) &&
      input.streetOpportunityCount >= (entry.streetOpportunities ?? 0)
  );
  const shuffled = shuffle(eligible, seed);

  return slots.map((slot, index) => {
    const entry = shuffled[index];

    if (!entry) {
      throw new Error("Not enough viable expedition definitions for the daily rotation.");
    }

    return {
      kind: entry.kind,
      slot,
      target: entry.targets[(seed + slot * 17) % entry.targets.length] ?? entry.targets[0]!
    };
  });
}

export function isLoopExpeditionKind(kind: DistrictExpeditionKind) {
  return kind === "close_loop" ||
    kind === "double_loop" ||
    kind === "loop_and_cells" ||
    kind === "loop_and_frontier" ||
    kind === "street_and_loop" ||
    kind === "field_triad" ||
    kind === "grand_tour";
}

export function getLocalExpeditionDate(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hashText(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function shuffle<T>(items: readonly T[], seed: number) {
  const shuffled = [...items];
  let state = seed || 1;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = Math.imul(state ^ (state >>> 15), 2246822519) >>> 0;
    state = Math.imul(state ^ (state >>> 13), 3266489917) >>> 0;
    state = (state ^ (state >>> 16)) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }

  return shuffled;
}
