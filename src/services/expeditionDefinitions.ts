import type {
  DistrictExpeditionDefinition,
  DistrictExpeditionKind
} from "../types/expedition";

export function buildDailyExpeditionDefinitions(input: {
  districtId: string;
  hasMedalOpportunity: boolean;
  hasStreetOpportunity: boolean;
  localDate: string;
}): DistrictExpeditionDefinition[] {
  const seed = hashText(`${input.districtId}:${input.localDate}`);
  const cellTargets = [15, 20, 25];
  const cellTarget = cellTargets[seed % cellTargets.length] ?? 20;
  const optionalKinds: DistrictExpeditionKind[] = [
    "close_loop",
    ...(input.hasStreetOpportunity ? ["complete_street" as const] : []),
    ...(input.hasMedalOpportunity ? ["collect_medal" as const] : [])
  ];
  const rotatedKinds = rotate(optionalKinds, seed % optionalKinds.length);
  const selectedKinds = rotatedKinds.slice(0, 2);
  const definitions: DistrictExpeditionDefinition[] = [
    { kind: "explore_cells", slot: 0, target: cellTarget },
    ...selectedKinds.map((kind, index) => ({ kind, slot: index + 1, target: 1 }))
  ];

  if (definitions.length < 3) {
    definitions.push({
      kind: "explore_cells",
      slot: 2,
      target: cellTarget + 15
    });
  }

  return definitions;
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

function rotate<T>(items: readonly T[], offset: number) {
  if (items.length === 0) {
    return [];
  }

  return [...items.slice(offset), ...items.slice(0, offset)];
}
