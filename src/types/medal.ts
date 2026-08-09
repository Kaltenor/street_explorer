export type MedalCategory =
  | "architecture"
  | "art"
  | "culture"
  | "history"
  | "nature";

export type MedalLanguage = "de" | "en" | "es" | "fr" | "it" | "nl";

export type LocalizedMedalText = {
  en: string;
  fr: string;
} & Partial<Record<Exclude<MedalLanguage, "en" | "fr">, string>>;

export type MedalCountryCode = "be" | "de" | "es" | "fr" | "it" | "nl";

export type MedalExternalSource =
  | "dgamn"
  | "dutch-rce"
  | "flanders-inventaris"
  | "german-state-heritage"
  | "icc"
  | "merimee"
  | "museofile"
  | "openstreetmap"
  | "spanish-culture-ministry"
  | "wallonia-awap"
  | "wikidata";

export type MedalExternalIdentity = {
  source: MedalExternalSource;
  type: "item" | "node" | "record" | "relation" | "way";
  id: number | string;
};

export type LandmarkMedalDefinition = {
  id: string;
  arrondissement?: number;
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
  cityZoneId: string;
  cityName: LocalizedMedalText;
  countryCode?: MedalCountryCode;
  localLanguage?: MedalLanguage;
  version: number;
  publishedAt: string;
  sourceAttribution: string;
  medals: LandmarkMedalDefinition[];
};

export type MedalCountryPack = {
  albums: MedalAlbumDefinition[];
  countryCode: Exclude<MedalCountryCode, "fr">;
  formatVersion: 1;
  generatedAt: string;
  languages: MedalLanguage[];
  publishedAt: string;
  sourceAttribution: string;
  version: number;
};

export type MedalAcquisitionReason =
  | "discovered_area"
  | "recording"
  | "retro_scan";
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

export type CollectedMedalCity = {
  albumId: string;
  cityName: LocalizedMedalText;
  medals: CollectedMedal[];
  sourceAttribution: string;
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
