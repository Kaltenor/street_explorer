export type MedalCategory =
  | "architecture"
  | "art"
  | "culture"
  | "history"
  | "nature";

export type LocalizedMedalText = {
  en: string;
  fr: string;
};

export type MedalExternalIdentity = {
  source: "openstreetmap";
  type: "node" | "relation" | "way";
  id: number;
};

export type LandmarkMedalDefinition = {
  id: string;
  category: MedalCategory;
  name: LocalizedMedalText;
  description: LocalizedMedalText;
  latitude: number;
  longitude: number;
  externalIdentity: MedalExternalIdentity;
};

export type MedalAlbumDefinition = {
  id: string;
  cityId: string;
  cityName: LocalizedMedalText;
  version: number;
  publishedAt: string;
  sourceAttribution: string;
  medals: LandmarkMedalDefinition[];
};

export type MedalAcquisitionReason = "recording" | "retro_scan";
export type MedalPresentationState = "pending" | "presenting" | "presented";

export type CollectedMedal = LandmarkMedalDefinition & {
  albumId: string;
  collectedAt: string | null;
  collectionReason: MedalAcquisitionReason | null;
  enclosureAreaSquareMeters: number | null;
  enclosureId: string | null;
  isCollected: boolean;
  presentationState: MedalPresentationState | null;
  sessionId: number | null;
};

export type MedalAlbumProgress = {
  album: MedalAlbumDefinition;
  collectedCount: number;
  medals: CollectedMedal[];
};

export type MedalCollectionCandidate = {
  albumId: string;
  medalId: string;
  anchorCellId: string;
  enclosureAreaSquareMeters: number;
  enclosureCellIds: string[];
  enclosureId: string;
};

export type MedalCollectionResult = {
  collected: CollectedMedal[];
  evaluatedMedalCount: number;
  trustedPointCount: number;
};
