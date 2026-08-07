import type { AppLanguage } from "../i18n";

export type AreaComparison = {
  areaSquareMeters: number;
  id: string;
  labels: Record<AppLanguage, string>;
  sourceUrl: string;
};

const wikidata = (id: string) => `https://www.wikidata.org/wiki/${id}`;

// A deliberately international, offline ladder. Areas are rounded from the
// linked governing-body or Wikidata records so comparisons remain playful,
// stable, and available without a network connection while exploring.
export const AREA_COMPARISONS: AreaComparison[] = [
  { areaSquareMeters: 261, id: "tennis-court", labels: { en: "a doubles tennis court", fr: "un court de tennis double" }, sourceUrl: "https://www.itftennis.com/en/about-us/organisation/publications-and-resources/" },
  { areaSquareMeters: 420, id: "basketball-court", labels: { en: "a basketball court", fr: "un terrain de basket" }, sourceUrl: "https://www.fiba.basketball/documents/official-basketball-rules/current.pdf" },
  { areaSquareMeters: 1_250, id: "olympic-pool", labels: { en: "an Olympic swimming pool", fr: "une piscine olympique" }, sourceUrl: "https://www.worldaquatics.com/rules/competition-regulations" },
  { areaSquareMeters: 1_800, id: "ice-rink", labels: { en: "an international ice rink", fr: "une patinoire internationale" }, sourceUrl: "https://www.iihf.com/en/statichub/4719/rules-and-regulations" },
  { areaSquareMeters: 7_140, id: "football-pitch", labels: { en: "an international football pitch", fr: "un terrain de football international" }, sourceUrl: "https://www.theifab.com/laws/latest/the-field-of-play/" },
  { areaSquareMeters: 9_200, id: "trafalgar-square", labels: { en: "Trafalgar Square", fr: "Trafalgar Square" }, sourceUrl: wikidata("Q129143") },
  { areaSquareMeters: 9_400, id: "plaza-mayor", labels: { en: "Madrid's Plaza Mayor", fr: "la Plaza Mayor de Madrid" }, sourceUrl: wikidata("Q1123493") },
  { areaSquareMeters: 14_350, id: "piazza-san-marco", labels: { en: "Venice's Piazza San Marco", fr: "la place Saint-Marc de Venise" }, sourceUrl: wikidata("Q217527") },
  { areaSquareMeters: 39_000, id: "bryant-park", labels: { en: "Bryant Park", fr: "Bryant Park" }, sourceUrl: wikidata("Q995174") },
  { areaSquareMeters: 59_500, id: "liberty-island", labels: { en: "Liberty Island", fr: "Liberty Island" }, sourceUrl: wikidata("Q319821") },
  { areaSquareMeters: 85_000, id: "alcatraz", labels: { en: "Alcatraz Island", fr: "l'île d'Alcatraz" }, sourceUrl: wikidata("Q131354") },
  { areaSquareMeters: 111_300, id: "ellis-island", labels: { en: "Ellis Island", fr: "Ellis Island" }, sourceUrl: wikidata("Q202175") },
  { areaSquareMeters: 200_000, id: "boston-common", labels: { en: "Boston Common", fr: "Boston Common" }, sourceUrl: wikidata("Q49132") },
  { areaSquareMeters: 225_000, id: "ile-de-la-cite", labels: { en: "Île de la Cité", fr: "l'île de la Cité" }, sourceUrl: wikidata("Q190063") },
  { areaSquareMeters: 230_000, id: "luxembourg-garden", labels: { en: "Luxembourg Garden", fr: "le jardin du Luxembourg" }, sourceUrl: wikidata("Q309458") },
  { areaSquareMeters: 231_000, id: "vatican-gardens", labels: { en: "the Vatican Gardens", fr: "les jardins du Vatican" }, sourceUrl: wikidata("Q42003") },
  { areaSquareMeters: 490_000, id: "vatican-city", labels: { en: "Vatican City", fr: "la Cité du Vatican" }, sourceUrl: wikidata("Q237") },
  { areaSquareMeters: 538_000, id: "ueno-park", labels: { en: "Tokyo's Ueno Park", fr: "le parc d'Ueno à Tokyo" }, sourceUrl: wikidata("Q746216") },
  { areaSquareMeters: 1_180_000, id: "retiro-park", labels: { en: "Madrid's Retiro Park", fr: "le parc du Retiro à Madrid" }, sourceUrl: wikidata("Q1131807") },
  { areaSquareMeters: 1_377_200, id: "hyde-park", labels: { en: "London's Hyde Park", fr: "Hyde Park à Londres" }, sourceUrl: wikidata("Q123738") },
  { areaSquareMeters: 1_580_000, id: "ibirapuera-park", labels: { en: "São Paulo's Ibirapuera Park", fr: "le parc d'Ibirapuera à São Paulo" }, sourceUrl: "https://www.parquedoibirapuera.org/historia-do-parque-ibirapuera/" },
  { areaSquareMeters: 2_080_000, id: "monaco", labels: { en: "Monaco", fr: "Monaco" }, sourceUrl: wikidata("Q235") },
  { areaSquareMeters: 2_100_000, id: "tiergarten", labels: { en: "Berlin's Tiergarten", fr: "le Tiergarten de Berlin" }, sourceUrl: wikidata("Q694020") },
  { areaSquareMeters: 3_411_500, id: "central-park", labels: { en: "Central Park", fr: "Central Park" }, sourceUrl: wikidata("Q160409") },
  { areaSquareMeters: 3_750_000, id: "english-garden", labels: { en: "Munich's English Garden", fr: "le Jardin anglais de Munich" }, sourceUrl: wikidata("Q260223") },
  { areaSquareMeters: 4_040_000, id: "stanley-park", labels: { en: "Vancouver's Stanley Park", fr: "le parc Stanley de Vancouver" }, sourceUrl: wikidata("Q1126258") },
  { areaSquareMeters: 4_120_000, id: "golden-gate-park", labels: { en: "Golden Gate Park", fr: "le Golden Gate Park" }, sourceUrl: wikidata("Q635559") },
  { areaSquareMeters: 7_070_000, id: "phoenix-park", labels: { en: "Dublin's Phoenix Park", fr: "le Phoenix Park de Dublin" }, sourceUrl: "https://www.phoenixpark.ie/wp-content/uploads/2017/08/Phoenix-Park-Visitors-Guide.pdf" },
  { areaSquareMeters: 10_400_000, id: "capri", labels: { en: "the island of Capri", fr: "l'île de Capri" }, sourceUrl: wikidata("Q173292") },
  { areaSquareMeters: 21_000_000, id: "nauru", labels: { en: "Nauru", fr: "Nauru" }, sourceUrl: wikidata("Q697") },
  { areaSquareMeters: 30_550_000, id: "bora-bora", labels: { en: "Bora Bora", fr: "Bora-Bora" }, sourceUrl: wikidata("Q183113") },
  { areaSquareMeters: 61_200_000, id: "san-marino", labels: { en: "San Marino", fr: "Saint-Marin" }, sourceUrl: wikidata("Q238") },
  { areaSquareMeters: 79_194_000, id: "santorini", labels: { en: "Santorini", fr: "Santorin" }, sourceUrl: wikidata("Q129296") },
  { areaSquareMeters: 80_400_000, id: "hong-kong-island", labels: { en: "Hong Kong Island", fr: "l'île de Hong Kong" }, sourceUrl: wikidata("Q19483") },
  { areaSquareMeters: 87_000_000, id: "manhattan", labels: { en: "Manhattan", fr: "Manhattan" }, sourceUrl: wikidata("Q11299") },
  { areaSquareMeters: 164_000_000, id: "easter-island", labels: { en: "Easter Island", fr: "l'île de Pâques" }, sourceUrl: wikidata("Q14452") },
  { areaSquareMeters: 316_000_000, id: "malta", labels: { en: "Malta", fr: "Malte" }, sourceUrl: wikidata("Q233") },
  { areaSquareMeters: 468_000_000, id: "andorra", labels: { en: "Andorra", fr: "Andorre" }, sourceUrl: wikidata("Q228") },
  { areaSquareMeters: 490_000_000, id: "lake-tahoe", labels: { en: "Lake Tahoe", fr: "le lac Tahoe" }, sourceUrl: wikidata("Q169962") },
  { areaSquareMeters: 580_030_000, id: "lake-geneva", labels: { en: "Lake Geneva", fr: "le lac Léman" }, sourceUrl: wikidata("Q694804") },
  { areaSquareMeters: 605_000_000, id: "dead-sea", labels: { en: "the Dead Sea", fr: "la mer Morte" }, sourceUrl: wikidata("Q23883") },
  { areaSquareMeters: 735_700_000, id: "singapore", labels: { en: "Singapore", fr: "Singapour" }, sourceUrl: wikidata("Q334") },
  { areaSquareMeters: 778_200_000, id: "new-york-city-land", labels: { en: "New York City's land area", fr: "la superficie terrestre de New York" }, sourceUrl: "https://www.census.gov/quickfacts/fact/table/newyorkcitynewyork/LND110210" },
  { areaSquareMeters: 891_800_000, id: "berlin", labels: { en: "Berlin", fr: "Berlin" }, sourceUrl: wikidata("Q64") },
  { areaSquareMeters: 1_114_000_000, id: "hong-kong", labels: { en: "Hong Kong", fr: "Hong Kong" }, sourceUrl: wikidata("Q8646") },
  { areaSquareMeters: 1_572_000_000, id: "greater-london", labels: { en: "Greater London", fr: "le Grand Londres" }, sourceUrl: wikidata("Q23306") },
  { areaSquareMeters: 2_194_000_000, id: "tokyo-metropolis", labels: { en: "Tokyo Metropolis", fr: "la métropole de Tokyo" }, sourceUrl: wikidata("Q1490") },
  { areaSquareMeters: 2_586_000_000, id: "luxembourg", labels: { en: "Luxembourg", fr: "le Luxembourg" }, sourceUrl: wikidata("Q32") },
  { areaSquareMeters: 4_001_000_000, id: "rhode-island", labels: { en: "Rhode Island", fr: "le Rhode Island" }, sourceUrl: wikidata("Q1387") },
  { areaSquareMeters: 4_862_893_000, id: "grand-canyon-national-park", labels: { en: "Grand Canyon National Park", fr: "le parc national du Grand Canyon" }, sourceUrl: wikidata("Q220289") },
  { areaSquareMeters: 5_780_000_000, id: "bali", labels: { en: "Bali", fr: "Bali" }, sourceUrl: wikidata("Q4648") },
  { areaSquareMeters: 8_983_490_000, id: "yellowstone", labels: { en: "Yellowstone National Park", fr: "le parc national de Yellowstone" }, sourceUrl: wikidata("Q351") },
  { areaSquareMeters: 9_251_000_000, id: "cyprus", labels: { en: "Cyprus", fr: "Chypre" }, sourceUrl: wikidata("Q229") },
  { areaSquareMeters: 10_991_000_000, id: "jamaica", labels: { en: "Jamaica", fr: "la Jamaïque" }, sourceUrl: wikidata("Q766") },
  { areaSquareMeters: 11_581_000_000, id: "qatar", labels: { en: "Qatar", fr: "le Qatar" }, sourceUrl: wikidata("Q846") }
];
