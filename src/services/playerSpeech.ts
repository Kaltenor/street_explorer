import type { AppLanguage } from "../i18n";

export type PlayerSpeechBehavior =
  | "cheer"
  | "distanceMilestone"
  | "explorationStreak"
  | "newArea"
  | "poorGps"
  | "revisit"
  | "standingStill"
  | "walkStarted"
  | "walkStopped";

export const PLAYER_SPEECH_CONFIG = {
  cheerMaximumDelayMs: 42_000,
  cheerMinimumDelayMs: 26_000,
  distanceMilestoneMeters: 250,
  newAreaCellInterval: 10,
  poorGpsAccuracyMeters: 25,
  revisitDistanceMeters: 180,
  standingStillDelayMs: 45_000,
  streakCellCount: 24,
  streakWindowMs: 90_000,
  typewriterIntervalMs: 38,
  visiblePauseMs: 1_900
} as const;

export const PLAYER_SPEECH_MESSAGES: Record<
  AppLanguage,
  Record<PlayerSpeechBehavior, readonly string[]>
> = {
  en: {
    cheer: [
      "Onward, street sleuth!",
      "The map fears your boots.",
      "Adventure looks good on you.",
      "Every corner hides a tale.",
      "Keep going, bold cartographer!",
      "More streets for the legend!",
      "The horizon owes us answers.",
      "Excellent wandering form!",
      "Curiosity is excellent navigation.",
      "Another fine step into the unknown!",
      "The atlas is taking notes.",
      "Magnificent pace, fearless wanderer!",
      "Somewhere ahead, a street needs discovering."
    ],
    distanceMilestone: [
      "{distance} charted. Splendid!",
      "{distance}! The boots demand applause.",
      "Another {distance} for the chronicles!"
    ],
    explorationStreak: [
      "The map cannot keep up!",
      "Cartographer on a glorious roll!",
      "Uncharted ground is surrendering!"
    ],
    newArea: [
      "Blank map, meet boot.",
      "Fresh ground for the atlas!",
      "A new patch of world, claimed!"
    ],
    poorGps: [
      "Satellite fog ahead. Hold the course!",
      "The satellites have lost the plot.",
      "Our sky compass needs a moment."
    ],
    revisit: [
      "Old roads, new stories.",
      "Even legends retrace their steps.",
      "Familiar stones, still worth a salute.",
      "This road remembers our footsteps.",
      "Back again? The cobbles are flattered.",
      "A seasoned explorer knows every return.",
      "Familiar ground, impeccable company.",
      "The atlas calls this a victory lap."
    ],
    standingStill: [
      "Plotting the next daring turn?",
      "The compass is pretending not to stare.",
      "A strategic pause. Very explorer-like.",
      "Consulting the invisible map?",
      "A heroic pause for dramatic effect.",
      "Even adventurers admire the scenery.",
      "The boots have called a brief meeting.",
      "No rush. The road will wait."
    ],
    walkStarted: [
      "Boots laced. Adventure awaits!",
      "The expedition begins!",
      "Forward! There are streets to conquer.",
      "A fresh route awaits our footprints.",
      "Compass ready. Curiosity forward!",
      "The streets have opened their next chapter.",
      "Coat fastened. Courage packed.",
      "Let us put some mystery behind us.",
      "One small step for the boots, one grand route for the atlas."
    ],
    walkStopped: [
      "Quill down. A fine chapter!",
      "Expedition complete. Boots may celebrate.",
      "A worthy route for the chronicles!",
      "The streets may rest now.",
      "Route secured. Legend improved.",
      "Another corner of the world, properly wandered.",
      "The compass approves this ending.",
      "Excellent work. Return with fresh boots.",
      "Today's trail belongs in the atlas."
    ]
  },
  fr: {
    cheer: [
      "En avant, fin limier des rues !",
      "La carte tremble sous tes bottes.",
      "L'aventure te va bien.",
      "Chaque coin cache une histoire.",
      "Continue, vaillant cartographe !",
      "Encore des rues pour la légende !",
      "L'horizon nous doit des réponses.",
      "Quelle élégance d'explorateur !",
      "La curiosité est une excellente boussole.",
      "Encore un beau pas vers l'inconnu !",
      "L'atlas prend des notes.",
      "Quelle allure, intrépide voyageur !",
      "Quelque part devant, une rue attend d'être découverte."
    ],
    distanceMilestone: [
      "{distance} cartographiés. Superbe !",
      "{distance} ! Les bottes exigent des applaudissements.",
      "Encore {distance} pour les chroniques !"
    ],
    explorationStreak: [
      "La carte n'arrive plus à suivre !",
      "Le cartographe est lancé !",
      "L'inconnu bat en retraite !"
    ],
    newArea: [
      "Carte vierge, voici ma botte.",
      "Du terrain neuf pour l'atlas !",
      "Un nouveau bout du monde, conquis !"
    ],
    poorGps: [
      "Brouillard satellite. Gardons le cap !",
      "Les satellites ont perdu le fil.",
      "Notre boussole céleste hésite un instant."
    ],
    revisit: [
      "Vieilles rues, nouvelles histoires.",
      "Même les légendes repassent par ici.",
      "Pierres familières, toujours dignes d'un salut.",
      "Cette rue se souvient de nos pas.",
      "Déjà de retour ? Les pavés sont flattés.",
      "Un explorateur aguerri connaît l'art du retour.",
      "Terrain familier, compagnie impeccable.",
      "L'atlas appelle cela un tour d'honneur."
    ],
    standingStill: [
      "On prépare le prochain virage audacieux ?",
      "La boussole fait semblant de ne pas regarder.",
      "Une pause stratégique. Très explorateur.",
      "On consulte la carte invisible ?",
      "Une pause héroïque pour l'effet dramatique.",
      "Même les aventuriers admirent le paysage.",
      "Les bottes ont demandé une courte réunion.",
      "Rien ne presse. La route attendra."
    ],
    walkStarted: [
      "Bottes lacées. L'aventure nous attend !",
      "L'expédition commence !",
      "En avant ! Des rues nous attendent.",
      "Un nouvel itinéraire attend nos pas.",
      "Boussole prête. Curiosité en avant !",
      "Les rues ouvrent leur prochain chapitre.",
      "Manteau fermé. Courage embarqué.",
      "Laissons quelques mystères derrière nous.",
      "Un petit pas pour les bottes, une grande route pour l'atlas."
    ],
    walkStopped: [
      "Plume posée. Quel beau chapitre !",
      "Expédition terminée. Les bottes peuvent fêter ça.",
      "Un itinéraire digne des chroniques !",
      "Les rues peuvent se reposer maintenant.",
      "Itinéraire assuré. Légende améliorée.",
      "Encore un coin du monde parcouru comme il se doit.",
      "La boussole approuve cette fin.",
      "Excellent travail. Revenons avec des bottes fraîches.",
      "Le chemin du jour mérite sa place dans l'atlas."
    ]
  }
};

export function createPlayerSpeechMessage(
  behavior: PlayerSpeechBehavior,
  language: AppLanguage,
  options: { distanceMeters?: number; randomValue?: number } = {}
) {
  const messages = PLAYER_SPEECH_MESSAGES[language][behavior];
  const randomValue = clampRandomValue(options.randomValue ?? Math.random());
  const message = messages[Math.floor(randomValue * messages.length)] ?? messages[0] ?? "";

  return message.replace(
    "{distance}",
    formatPlayerSpeechDistance(options.distanceMeters ?? 0, language)
  );
}

export function getPlayerSpeechCharacterCount(
  elapsedMs: number,
  messageLength: number
) {
  const safeElapsedMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const safeMessageLength = Number.isFinite(messageLength)
    ? Math.max(0, Math.floor(messageLength))
    : 0;

  return Math.min(
    safeMessageLength,
    Math.floor(safeElapsedMs / PLAYER_SPEECH_CONFIG.typewriterIntervalMs)
  );
}

export function formatPlayerSpeechDistance(
  distanceMeters: number,
  language: AppLanguage
) {
  if (distanceMeters < 1_000) {
    return `${Math.max(0, Math.round(distanceMeters))} m`;
  }

  const kilometers = distanceMeters / 1_000;
  const formatted = Number.isInteger(kilometers)
    ? String(kilometers)
    : kilometers.toFixed(2).replace(/0$/, "");

  return language === "fr" ? `${formatted.replace(".", ",")} km` : `${formatted} km`;
}

function clampRandomValue(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(0.999_999, value));
}
