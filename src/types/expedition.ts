export type DistrictExpeditionKind =
  | "close_loop"
  | "collect_medal"
  | "complete_street"
  | "explore_cells";

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
  active: DistrictExpedition | null;
  choices: DistrictExpedition[];
  localDate: string;
  seals: DistrictExpeditionSeal[];
};

export type BackupDistrictExpeditionSystem = {
  expeditions: DistrictExpedition[];
  loopEvidence: DistrictExpeditionLoopEvidence[];
  seals: DistrictExpeditionSeal[];
};
