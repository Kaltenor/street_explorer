import { ActivityMode } from "./types/walk";

export type AppLanguage = "en" | "fr";

export const APP_LANGUAGES: Array<{ code: AppLanguage; label: string }> = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" }
];

export const ACTIVITY_MODE_TEXT: Record<
  AppLanguage,
  {
    labels: Record<ActivityMode, string>;
    descriptions: Record<ActivityMode, string>;
    recordingNouns: Record<ActivityMode, string>;
    countLabels: Record<ActivityMode, string>;
  }
> = {
  en: {
    countLabels: {
      walk: "Walks",
    },
    descriptions: {
      walk: "Explore on foot",
    },
    labels: {
      walk: "Walk",
    },
    recordingNouns: {
      walk: "Walk",
    }
  },
  fr: {
    countLabels: {
      walk: "Marches",
    },
    descriptions: {
      walk: "Explorer à pied",
    },
    labels: {
      walk: "Marche",
    },
    recordingNouns: {
      walk: "marche",
    }
  }
};

export const STRINGS = {
  en: {
    app: {
      loading: "Loading"
    },
    common: {
      all: "All",
      cancel: "Cancel",
      clear: "Clear",
      completion: "Completion",
      details: "Details",
      diagnostics: "Diagnostics",
      distance: "Distance",
      duration: "Duration",
      history: "History",
      language: "Language",
      loading: "Loading",
      mode: "Mode",
      options: "Options",
      pending: "pending",
      refresh: "Refresh",
      restore: "Restore",
      save: "Save",
      steps: "Steps",
      unknown: "Unknown",
      walk: "Walk",
    },
    launch: {
      loadingMap: "Loading current area map",
      pressToStart: "Press here to start"
    },
    walkControls: {
      gps: "GPS",
      gpsPoints: "GPS pts",
      hideRecordingDetails: "Hide recording details",
      recordingDetails: "Recording details",
      speed: "Speed",
      start: "Start",
      stepsToday: "Steps today",
      stop: "Stop"
    },
    map: {
      addNewDataOnMap: "Add new data on map",
      background: "Background",
      backupFailedMessage: "Street Explorer could not create the backup file.",
      backupFailedPrepareMessage: "Street Explorer could not prepare the backup data.",
      backupFailedShareMessage: "The backup file was created, but iOS could not open the share sheet.",
      backupFailedTitle: "Backup failed",
      backupFailedWriteMessage: "Street Explorer could not write the backup file.",
      backupFailureDetail: "Technical detail",
      backgroundEnabled: "Background tracking enabled.",
      backgroundForegroundOnly:
        "Background recording is not enabled yet. Foreground recording is active. {hint}",
      backgroundNeedsDevelopmentBuild:
        "Background tracking needs a development build; Expo Go will record only while open.",
      backgroundUnavailable:
        "Background tracking is unavailable here; foreground recording is still active.",
      boundariesFailedMessage: "Street Explorer could not fetch nearby OSM boundaries.",
      computingInfo: "Computing information",
      computingInfoText: "Updating your route, explored area, loops, and recording report.",
      foregroundHintAskAgain: "iOS may show another permission prompt after recording starts.",
      foregroundHintSettings:
        "Open iPhone Settings > Street Explorer > Location and choose Always. If Always is missing, reinstall the latest development build.",
      locationOff: "Location permission is off",
      locationOffText:
        "You can still view saved walks, but location permission is required to record a new walk.",
      recordingActive: "Recording active",
      recordingActiveBackup: "Stop the current recording before restoring a backup.",
      recordingActiveReprocess: "Stop the current recording before reprocessing walks.",
      restoreBackupMessage: "This replaces all local recordings with the selected backup file.",
      restoreBackupTitle: "Restore backup?",
      restoreFailedMessage: "Street Explorer could not restore this backup file.",
      restoreFailedTitle: "Restore failed"
    },
    options: {
      layers: "Map layers",
      pathDisplay: "Paths shown on map",
      profile: "Recording profile",
      subtitle: "App preferences and map controls"
    },
    details: {
      mapSubtitle: "{mode} exploration map",
      openHistory: "Open history",
      paths: "Paths",
      reprocessRecordings: "Reprocess recordings",
      selected: "Selected",
      sevenDays: "7 days",
      today: "Today"
    },
    stats: {
      area: "Area",
      automaticRefreshInProgress: "Refreshing boundaries automatically…",
      cells: "Cells",
      latest: "Latest",
      longest: "Longest",
      new: "New",
      recordingsToday: "{count} {recording} today",
      today: "Today"
    },
    mapLegend: {
      exploredCells: "Explored cells",
      recording: "Recording",
      savedRoute: "Saved route"
    },
    modeProfile: {
      gps: "GPS",
      jumpCap: "Jump cap",
      profile: "{mode} profile"
    },
    history: {
      backup: "Backup",
      delete: "Delete",
      diagnostics: "Diagnostics",
      ended: "Ended",
      exportGpx: "Export GPX",
      focusOnMap: "Focus on map",
      gpsAccepted: "GPS accepted",
      gpsPoints: "GPS pts",
      gpsRejected: "GPS rejected",
      hiddenGaps: "Hidden gaps",
      frozenRoute: "Frozen",
      bridgeEvidenceUnavailable: "Evidence unavailable for this legacy snapshot",
      bridgeSummary: "{count} accepted · {cells} inferred cells · {high} high / {medium} medium",
      streetBridges: "Street bridges",
      inferredSections: "Street-matched sections",
      legacyRoute: "Legacy GPS",
      history: "History",
      loopCells: "Loop cells",
      loopExplanation: "Loop explanation",
      loopFill: "Loop fill",
      loopFillDebug: "Loop fill debug",
      loopResult: "Loop result",
      loops: "Loops",
      noRecordings: "No recordings yet",
      noRecordingsText: "Saved {mode} explorations will appear here.",
      quality: "Quality",
      reason: "Reason",
      recording: "recording",
      recordingName: "Recording name",
      recordingReport: "Recording report",
      routeGeometry: "Route geometry",
      savedRecordings: "{count} saved recordings",
      started: "Started",
      stepsSuffix: "steps"
    },
    completionMenu: {
      area: "Area",
      automaticRefreshInProgress: "Refreshing boundaries automatically…",
      approxBounds: "Approx bounds",
      boundaryLoadFailed: "Boundary load failed",
      boundaryLoadFailedMessage: "Street Explorer could not fetch nearby OSM boundaries.",
      boundariesRefreshed: "Boundaries refreshed",
      cached: "Cached",
      cities: "Cities",
      cellsPending: "cells pending",
      clearCachedZones: "Clear cached zones?",
      clearCachedZonesMessage: "This removes cached boundaries and denominators, not recordings or permanent achievements.",
      completed: "Completed",
      completedZones: "Permanent achievements",
      currentObjective: "Current objective",
      currentObjectiveButton: "Current objective",
      directGps: "Direct GPS",
      districts: "Districts",
      exactPolygon: "Exact polygon",
      exactPolygonNotice: "Exact polygon from OSM boundary geometry.",
      exactPolygonWithHoles: "Exact polygon with inner holes excluded from completion.",
      explored: "explored",
      exploredCells: "Explored cells",
      focusOnMap: "Focus on map",
      inferred: "Inferred",
      large: "Large",
      lastUpdated: "Last updated {date}",
      left: "left",
      loading: "Loading",
      locationUnavailable: "Location unavailable",
      locationUnavailableMessage: "Wait for GPS before refreshing boundaries.",
      loopFilled: "Loop-filled",
      nearbyBoundaryZonesCached: "{count} nearby boundary zones were cached.",
      nearbyIncompleteArea: "Nearby incomplete area",
      nearestArea: "Nearest area",
      nearestDistrict: "Nearest district",
      neverRefreshed: "Boundaries have not been refreshed yet.",
      noCachedBoundary: "No cached {scope} boundary yet. Tap Refresh to load nearby OSM boundaries.",
      noUsableBoundaries: "No usable boundaries were found. Raw: {raw}, relations: {relations}, usable: {usable}.",
      objectiveCellsToday: "+{count} cells today",
      progressSubtitle: "Walking exploration progress by area",
      refreshFailed: "The latest automatic boundary refresh failed.",
      refreshesEveryThirtyDays: "Auto-refreshes every 30 days",
      scope: "Scope",
      selectArea: "Select area",
      setObjective: "Set objective",
      sourceNoticeApprox: "Completion is approximate: this zone is using OSM bounds because the exact polygon could not be assembled yet.",
      sourceNoticeUnavailable: "Display-only boundary: the OSM multipolygon is incomplete, so progress and completion awards are unavailable until a valid boundary is fetched.",
      unavailable: "Unavailable",
      useAsObjective: "Use as objective",
      v1Rules: "V1 rules",
      v1RulesText: "The main map stays readable: cells and recorded paths are the primary game layer. OSM is kept as hidden analysis data for street matching, loop-fill checks, and future city or district boundaries.",
      youAreHere: "You are here",
      zoneCells: "Zone cells"
    }
  },
  fr: {
    app: {
      loading: "Chargement"
    },
    common: {
      all: "Tous",
      cancel: "Annuler",
      clear: "Effacer",
      completion: "Progression",
      details: "Détails",
      diagnostics: "Diagnostic",
      distance: "Distance",
      duration: "Durée",
      history: "Historique",
      language: "Langue",
      loading: "Chargement",
      mode: "Mode",
      options: "Options",
      pending: "en attente",
      refresh: "Actualiser",
      restore: "Restaurer",
      save: "Enregistrer",
      steps: "Pas",
      unknown: "Inconnu",
      walk: "Marche",
    },
    launch: {
      loadingMap: "Chargement de la carte locale",
      pressToStart: "Appuyez ici pour commencer"
    },
    walkControls: {
      gps: "GPS",
      gpsPoints: "Pts GPS",
      hideRecordingDetails: "Masquer les détails",
      recordingDetails: "Détails d'enregistrement",
      speed: "Vitesse",
      start: "Démarrer",
      stepsToday: "Pas aujourd'hui",
      stop: "Arrêter"
    },
    map: {
      addNewDataOnMap: "Ajouter les données sur la carte",
      background: "Arrière-plan",
      backupFailedMessage: "Street Explorer n'a pas pu créer la sauvegarde.",
      backupFailedPrepareMessage: "Street Explorer n'a pas pu préparer les données de sauvegarde.",
      backupFailedShareMessage: "Le fichier de sauvegarde a été créé, mais iOS n'a pas pu ouvrir la feuille de partage.",
      backupFailedTitle: "Sauvegarde impossible",
      backupFailedWriteMessage: "Street Explorer n'a pas pu écrire le fichier de sauvegarde.",
      backupFailureDetail: "Détail technique",
      backgroundEnabled: "Suivi en arrière-plan activé.",
      backgroundForegroundOnly:
        "Le suivi en arrière-plan n'est pas encore activé. L'enregistrement au premier plan est actif. {hint}",
      backgroundNeedsDevelopmentBuild:
        "Le suivi en arrière-plan nécessite un build de développement; Expo Go n'enregistre que lorsque l'app est ouverte.",
      backgroundUnavailable:
        "Le suivi en arrière-plan est indisponible ici; l'enregistrement au premier plan reste actif.",
      boundariesFailedMessage: "Street Explorer n'a pas pu récupérer les limites OSM proches.",
      computingInfo: "Calcul des informations",
      computingInfoText: "Mise à jour de l'itinéraire, de la zone explorée, des boucles et du rapport.",
      foregroundHintAskAgain: "iOS peut afficher une autre demande d'autorisation après le début de l'enregistrement.",
      foregroundHintSettings:
        "Ouvrez Réglages iPhone > Street Explorer > Position et choisissez Toujours. Si Toujours manque, réinstallez le dernier build de développement.",
      locationOff: "L'autorisation de localisation est désactivée",
      locationOffText:
        "Vous pouvez consulter les marches enregistrées, mais la localisation est nécessaire pour enregistrer une nouvelle marche.",
      recordingActive: "Enregistrement actif",
      recordingActiveBackup: "Arrêtez l'enregistrement en cours avant de restaurer une sauvegarde.",
      recordingActiveReprocess: "Arrêtez l'enregistrement en cours avant de recalculer les marches.",
      restoreBackupMessage: "Cela remplacera tous les enregistrements locaux par le fichier sélectionné.",
      restoreBackupTitle: "Restaurer la sauvegarde ?",
      restoreFailedMessage: "Street Explorer n'a pas pu restaurer cette sauvegarde.",
      restoreFailedTitle: "Restauration impossible"
    },
    options: {
      layers: "Couches de carte",
      pathDisplay: "Traces affichées sur la carte",
      profile: "Profil d'enregistrement",
      subtitle: "Préférences de l'app et contrôles de carte"
    },
    details: {
      mapSubtitle: "Carte d'exploration {mode}",
      openHistory: "Ouvrir l'historique",
      paths: "Traces",
      reprocessRecordings: "Recalculer les enregistrements",
      selected: "Sélection",
      sevenDays: "7 jours",
      today: "Aujourd'hui"
    },
    stats: {
      area: "Surface",
      cells: "Cellules",
      latest: "Dernier",
      longest: "Plus long",
      new: "Nouv.",
      recordingsToday: "{count} {recording} aujourd'hui",
      today: "Aujourd'hui"
    },
    mapLegend: {
      exploredCells: "Cellules explorées",
      recording: "En cours",
      savedRoute: "Trace enregistrée"
    },
    modeProfile: {
      gps: "GPS",
      jumpCap: "Limite de saut",
      profile: "Profil {mode}"
    },
    history: {
      backup: "Sauvegarder",
      delete: "Supprimer",
      diagnostics: "Diagnostic",
      ended: "Fin",
      exportGpx: "Exporter GPX",
      focusOnMap: "Centrer sur la carte",
      gpsAccepted: "GPS acceptés",
      gpsPoints: "Pts GPS",
      gpsRejected: "GPS rejetés",
      hiddenGaps: "Coupures masquées",
      frozenRoute: "Figée",
      bridgeEvidenceUnavailable: "Preuves indisponibles pour cet ancien instantané",
      bridgeSummary: "{count} acceptés · {cells} cellules déduites · {high} haute / {medium} moyenne",
      streetBridges: "Ponts de parcours",
      inferredSections: "Sections calées sur rue",
      legacyRoute: "GPS historique",
      history: "Historique",
      loopCells: "Cellules de boucle",
      loopExplanation: "Explication de boucle",
      loopFill: "Remplissage",
      loopFillDebug: "Debug remplissage",
      loopResult: "Résultat de boucle",
      loops: "Boucles",
      noRecordings: "Aucun enregistrement",
      noRecordingsText: "Les explorations {mode} enregistrées apparaîtront ici.",
      quality: "Qualité",
      reason: "Raison",
      recording: "enregistrement",
      recordingName: "Nom de l'enregistrement",
      recordingReport: "Rapport d'enregistrement",
      routeGeometry: "Géométrie de trace",
      savedRecordings: "{count} enregistrements sauvegardés",
      started: "Début",
      stepsSuffix: "pas"
    },
    completionMenu: {
      area: "Zone",
      automaticRefreshInProgress: "Actualisation automatique des limites…",
      approxBounds: "Limites approx.",
      boundaryLoadFailed: "Chargement impossible",
      boundaryLoadFailedMessage: "Street Explorer n'a pas pu récupérer les limites OSM proches.",
      boundariesRefreshed: "Limites actualisées",
      cached: "En cache",
      cities: "Villes",
      cellsPending: "cellules en attente",
      clearCachedZones: "Effacer les zones en cache ?",
      clearCachedZonesMessage: "Cela supprime les limites et dénominateurs en cache, pas les enregistrements ni les accomplissements permanents.",
      completed: "Terminée",
      completedZones: "Accomplissements permanents",
      currentObjective: "Objectif actuel",
      currentObjectiveButton: "Objectif actuel",
      directGps: "GPS direct",
      districts: "Quartiers",
      exactPolygon: "Polygone exact",
      exactPolygonNotice: "Polygone exact depuis la géométrie de limite OSM.",
      exactPolygonWithHoles: "Polygone exact avec trous internes exclus de la progression.",
      explored: "explorées",
      exploredCells: "Cellules explorées",
      focusOnMap: "Centrer sur la carte",
      inferred: "Déduit",
      large: "Grande",
      lastUpdated: "Dernière actualisation le {date}",
      left: "restantes",
      loading: "Chargement",
      locationUnavailable: "Position indisponible",
      locationUnavailableMessage: "Attendez le GPS avant d'actualiser les limites.",
      loopFilled: "Remplies",
      nearbyBoundaryZonesCached: "{count} limites proches ont été mises en cache.",
      nearbyIncompleteArea: "Zone proche incomplète",
      nearestArea: "Zone la plus proche",
      nearestDistrict: "Quartier le plus proche",
      neverRefreshed: "Les limites n'ont pas encore été actualisées.",
      noCachedBoundary: "Aucune limite {scope} en cache. Touchez Actualiser pour charger les limites OSM proches.",
      noUsableBoundaries: "Aucune limite utilisable trouvée. Brut : {raw}, relations : {relations}, utilisables : {usable}.",
      objectiveCellsToday: "+{count} cellules aujourd'hui",
      progressSubtitle: "Progression de la marche par zone",
      refreshFailed: "La dernière actualisation automatique des limites a échoué.",
      refreshesEveryThirtyDays: "Actualisation automatique tous les 30 jours",
      scope: "Portée",
      selectArea: "Choisir une zone",
      setObjective: "Définir l'objectif",
      sourceNoticeApprox: "La progression est approximative : cette zone utilise les limites OSM car le polygone exact n'a pas encore pu être assemblé.",
      sourceNoticeUnavailable: "Limite d'affichage uniquement : le multipolygone OSM est incomplet. La progression et les accomplissements restent indisponibles jusqu'à la réception d'une limite valide.",
      unavailable: "Indisponible",
      useAsObjective: "Utiliser comme objectif",
      v1Rules: "Règles V1",
      v1RulesText: "La carte principale reste lisible : les cellules et les traces enregistrées sont la couche de jeu principale. OSM reste une donnée d'analyse cachée pour l'association des rues, les vérifications de boucle et les futures limites de ville ou de quartier.",
      youAreHere: "Vous êtes ici",
      zoneCells: "Cellules de zone"
    }
  }
} as const;

export type AppStrings = typeof STRINGS.en;

export function getStrings(language: AppLanguage) {
  return STRINGS[language];
}

export function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, "g"), String(value)),
    template
  );
}
