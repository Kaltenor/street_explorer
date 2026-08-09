export const DISTRICT_EXPEDITION_KINDS = [
  "explore_cells",
  "frontier_push",
  "seal_breach",
  "dense_survey",
  "sector_sweep",
  "northward_scout",
  "southward_scout",
  "eastward_scout",
  "westward_scout",
  "boundary_scout",
  "district_heart",
  "outer_reach",
  "complete_street",
  "complete_street_pair",
  "street_and_cells",
  "close_loop",
  "double_loop",
  "loop_and_cells",
  "loop_and_frontier",
  "street_and_loop",
  "collect_medal",
  "collect_medal_pair",
  "medal_and_cells",
  "field_triad",
  "grand_tour"
] as const;

export type DistrictExpeditionKind = typeof DISTRICT_EXPEDITION_KINDS[number];

export type DistrictExpedition = {
  abandonedAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  districtId: string;
  districtName: string;
  id: string;
  kind: DistrictExpeditionKind;
  localDate: string;
  progress: number;
  slot: number;
  target: number;
  updatedAt: string;
};

export type DistrictExpeditionSeal = {
  districtId: string;
  districtName: string;
  earnedAt: string;
  expeditionId: string;
  id: string;
  kind: DistrictExpeditionKind;
  localDate: string;
};

export type DistrictExpeditionLoopEvidence = {
  detectedAt: string;
  expeditionId: string;
  sessionId: number;
};

export type DistrictExpeditionDefinition = {
  kind: DistrictExpeditionKind;
  slot: number;
  target: number;
};

export type DistrictExpeditionDashboard = {
  active: DistrictExpedition[];
  choices: DistrictExpedition[];
  localDate: string;
  seals: DistrictExpeditionSeal[];
};

export type BackupDistrictExpeditionSystem = {
  expeditions: DistrictExpedition[];
  loopEvidence: DistrictExpeditionLoopEvidence[];
  seals: DistrictExpeditionSeal[];
};
