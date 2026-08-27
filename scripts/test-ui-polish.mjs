import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  classifyGpsUiStatus,
  GPS_UI_THRESHOLDS
} from "../src/services/gpsStatus.ts";
import {
  shouldCaptureAtlasSwipeBackStart,
  shouldCompleteAtlasSwipeBack,
  shouldStartAtlasSwipeBack
} from "../src/services/atlasSwipeBack.ts";
import { AREA_COMPARISONS } from "../src/data/areaComparisons.ts";
import {
  isHapticFeedbackEnabled,
  isSoundFeedbackEnabled,
  setFeedbackPreferences,
  setHapticFeedbackEnabled,
  setSoundFeedbackEnabled
} from "../src/services/feedbackPreferences.ts";

const NOW = Date.parse("2026-08-02T12:00:00.000Z");

assert.equal(isHapticFeedbackEnabled(), true);
assert.equal(isSoundFeedbackEnabled(), true);
setFeedbackPreferences({ hapticsEnabled: false, soundEnabled: false });
assert.equal(isHapticFeedbackEnabled(), false);
assert.equal(isSoundFeedbackEnabled(), false);
setHapticFeedbackEnabled(true);
setSoundFeedbackEnabled(true);
assert.equal(isHapticFeedbackEnabled(), true);
assert.equal(isSoundFeedbackEnabled(), true);

function status(overrides = {}) {
  return classifyGpsUiStatus({
    accuracyMeters: 8,
    fixTimestamp: "2026-08-02T11:59:58.000Z",
    isRecording: true,
    locationResolved: true,
    nowMs: NOW,
    permissionState: "granted",
    ...overrides
  });
}

assert.equal(status({ permissionState: "unknown" }).state, "acquiring");
assert.equal(status().state, "good");
assert.equal(status({ accuracyMeters: GPS_UI_THRESHOLDS.goodAccuracyMeters + 1 }).state, "weak-stale");
assert.equal(status({ fixTimestamp: "2026-08-02T11:59:40.000Z" }).reason, "stale-fix");
assert.equal(status({ permissionState: "denied" }).state, "denied");
assert.equal(
  shouldCaptureAtlasSwipeBackStart({ enabled: true, startX: 12 }),
  true
);
assert.equal(
  shouldCaptureAtlasSwipeBackStart({ enabled: true, startX: 21 }),
  false
);
assert.equal(
  shouldCaptureAtlasSwipeBackStart({ enabled: false, startX: 12 }),
  false
);
assert.equal(status({ fixTimestamp: null }).state, "unavailable");
assert.equal(
  status({ fixTimestamp: null, locationResolved: false }).state,
  "acquiring"
);

assert.equal(
  shouldStartAtlasSwipeBack({ deltaX: 10, deltaY: 2, enabled: true, startX: 20 }),
  true
);
assert.equal(
  shouldStartAtlasSwipeBack({ deltaX: 3, deltaY: 1, enabled: true, startX: 34 }),
  true
);
assert.equal(
  shouldStartAtlasSwipeBack({ deltaX: 10, deltaY: 2, enabled: true, startX: 37 }),
  false
);
assert.equal(
  shouldStartAtlasSwipeBack({ deltaX: 10, deltaY: 12, enabled: true, startX: 20 }),
  false
);
assert.equal(
  shouldCompleteAtlasSwipeBack({ deltaX: 130, screenWidth: 390, velocityX: 0.2 }),
  true
);
assert.equal(
  shouldCompleteAtlasSwipeBack({ deltaX: 30, screenWidth: 390, velocityX: 0.7 }),
  true
);
assert.equal(
  shouldCompleteAtlasSwipeBack({ deltaX: 80, screenWidth: 390, velocityX: 0.2 }),
  false
);

const mapSource = readFileSync(new URL("../src/components/ExplorationMap.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const atlasSource = readFileSync(new URL("../src/components/AtlasCabinet.tsx", import.meta.url), "utf8");
const completionSource = readFileSync(new URL("../src/components/CompletionModal.tsx", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../src/components/WalkHistoryModal.tsx", import.meta.url), "utf8");
const summarySource = readFileSync(new URL("../src/screens/MapScreen.tsx", import.meta.url), "utf8");
const stopConfirmationSource = summarySource.slice(
  summarySource.indexOf("const STOP_CONFIRM_HOLD_MS"),
  summarySource.indexOf("function RecordingSummaryModal")
);
const medalCollectionSource = readFileSync(new URL("../src/components/MedalCollectionModal.tsx", import.meta.url), "utf8");
const expeditionSource = readFileSync(new URL("../src/components/DistrictExpeditionModal.tsx", import.meta.url), "utf8");
const themeSource = readFileSync(new URL("../src/constants/theme.ts", import.meta.url), "utf8");
const appearanceSource = readFileSync(new URL("../src/constants/appearance.ts", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/database/settingsRepository.ts", import.meta.url), "utf8");
const hudDecorSource = readFileSync(new URL("../src/components/AtlasHudDecor.tsx", import.meta.url), "utf8");
const walkControlsSource = readFileSync(new URL("../src/components/WalkControls.tsx", import.meta.url), "utf8");
const explorerScorePanelSource = readFileSync(new URL("../src/components/ExplorerScorePanel.tsx", import.meta.url), "utf8");
const forbiddenZoneCommentSource = readFileSync(new URL("../src/components/ForbiddenZoneCommentModal.tsx", import.meta.url), "utf8");
const diagnosticsModalSource = readFileSync(new URL("../src/components/RecordingDiagnosticsModal.tsx", import.meta.url), "utf8");
const routeSnapshotSource = readFileSync(new URL("../src/services/routeSnapshot.ts", import.meta.url), "utf8");
const feedbackSource = readFileSync(new URL("../src/services/feedbackPreferences.ts", import.meta.url), "utf8");
const medalCelebrationSource = readFileSync(new URL("../src/components/MedalCelebration.tsx", import.meta.url), "utf8");
const soundAssetReadme = readFileSync(new URL("../assets/sounds/README.md", import.meta.url), "utf8");

assert.ok(existsSync(new URL("../assets/ui/atlas-paper-texture.png", import.meta.url)));
assert.ok(existsSync(new URL("../assets/sounds/atlas-page.wav", import.meta.url)));
assert.ok(existsSync(new URL("../assets/sounds/atlas-reward-jingle.wav", import.meta.url)));
assert.ok(existsSync(new URL("../assets/sounds/atlas-stamp.wav", import.meta.url)));
assert.ok(existsSync(new URL("../assets/sounds/README.md", import.meta.url)));
assert.ok(existsSync(new URL("../assets/fonts/Cinzel-Variable.ttf", import.meta.url)));
assert.ok(existsSync(new URL("../assets/fonts/OFL-Cinzel.txt", import.meta.url)));
assert.ok(AREA_COMPARISONS.length >= 50);
assert.ok(AREA_COMPARISONS.every((entry, index) =>
  entry.areaSquareMeters > 0 &&
  entry.labels.en.length > 0 &&
  entry.labels.fr.length > 0 &&
  entry.sourceUrl.startsWith("https://") &&
  (index === 0 || entry.areaSquareMeters >= AREA_COMPARISONS[index - 1].areaSquareMeters)
));
assert.match(explorerScorePanelSource, /EXPLORER POINTS/);
assert.match(explorerScorePanelSource, /nextProgress/);
assert.match(explorerScorePanelSource, /score\.expeditionSealCount/);
assert.match(explorerScorePanelSource, /200 pts per expedition/);
assert.match(walkControlsSource, /explorerScore/);
assert.match(walkControlsSource, /todayStepCount/);
assert.match(walkControlsSource, /width: "60%"/);
assert.ok(
  walkControlsSource.indexOf("styles.stopButton : styles.startButton") <
    walkControlsSource.indexOf("<GpsStateBadge")
);
assert.match(atlasSource, /pointsAwarded/);
assert.match(atlasSource, /DAYLIGHT_STAMP_GOLD_FACE_STYLE/);
assert.match(atlasSource, /DAYLIGHT_STAMP_PARCHMENT_FACE_STYLE/);
assert.match(summarySource, /calculateExplorerScore/);
assert.match(stopConfirmationSource, /completionTimerRef\.current = setTimeout\(confirmQuit, STOP_CONFIRM_HOLD_MS\)/);
assert.match(stopConfirmationSource, /Date\.now\(\) - startedAt >= STOP_CONFIRM_HOLD_MS/);
assert.match(stopConfirmationSource, /pressRetentionOffset=\{\{ bottom: 32, left: 32, right: 32, top: 32 \}\}/);
assert.match(stopConfirmationSource, /void playImpactHaptic\(\)/);
assert.doesNotMatch(stopConfirmationSource, /onLongPress=/);
assert.match(stopConfirmationSource, /STOP_CONFIRM_BORDEAUX = "#6b1029"/);
assert.match(stopConfirmationSource, /STOP_CONFIRM_HOLD_ORANGE = "#c2410c"/);
assert.match(summarySource, /stopConfirmQuit: \{[\s\S]*backgroundColor: STOP_CONFIRM_BORDEAUX[\s\S]*borderColor: "#f4b4c4"/);
assert.match(summarySource, /stopConfirmQuitFill: \{[\s\S]*backgroundColor: STOP_CONFIRM_HOLD_ORANGE[\s\S]*borderRightColor: "#ffedd5"/);

assert.match(mapSource, /WALKING_COLORS\.activeRoute/);
assert.match(mapSource, /WALKING_COLORS\.selectedRoute/);
assert.match(historySource, /Route quality/);
assert.ok(mapSource.includes("!isDaylightAppearance(appearanceMode)"));
assert.ok(mapSource.includes('? isDaylightAppearance(appearanceMode) ? "light" : "dark"'));
assert.match(mapSource, /showsPointsOfInterest=\{false\}/);
assert.match(mapSource, /showsUserLocation=\{false\}/);
assert.match(mapSource, /AtlasRouteMarker/);
assert.match(mapSource, /AtlasMedalMarker/);
assert.doesNotMatch(mapSource, /pinColor=/);
assert.match(themeSource, /exploredArea: "rgba\(229, 122, 50, 0\.46\)"/);
assert.match(themeSource, /countrysideArea: "rgba\(244, 224, 138, 0\.54\)"/);
assert.match(mapSource, /map\.countryside-exploration-surface/);
assert.match(summarySource, /function CountrysideStatus/);
assert.match(summarySource, /OUT OF THE CITY/);
assert.match(summarySource, /Exploring the countryside/);
assert.match(themeSource, /ATLAS_DISPLAY_FONT = "Cinzel"/);
assert.match(themeSource, /cityBoundary: "#8d5268"/);
assert.match(themeSource, /cityBoundaryMuted: "rgba\(141, 82, 104, 0\.7\)"/);
assert.match(themeSource, /districtBoundary: "#c28a45"/);
assert.match(themeSource, /districtBoundaryMuted: "rgba\(194, 138, 69, 0\.64\)"/);
assert.match(mapSource, /cityZone\.geometry/);
assert.match(themeSource, /selectedZoneFill: "rgba\(242, 217, 166, 0\.12\)"/);
assert.match(appearanceSource, /"explorator",\s+"daylight"/);
assert.doesNotMatch(appearanceSource, /"custom"/);
assert.match(appearanceSource, /export function createAppearanceStyles/);
assert.match(themeSource, /DAYLIGHT_APP_COLORS/);
assert.match(settingsSource, /APPEARANCE_MODE_KEY = "appearance_mode"/);
assert.match(settingsSource, /getAppearanceMode/);
assert.match(settingsSource, /saveAppearanceMode/);
assert.match(appSource, /setActiveAppearanceMode\(savedAppearanceMode\)/);
assert.match(summarySource, /label: "Explorator"/);
assert.match(summarySource, /label: "Daylight"/);
assert.doesNotMatch(summarySource, /label: "Custom"/);
assert.match(summarySource, /accessibilityRole="radio"/);
assert.match(summarySource, /onChangeAppearanceMode\(option\.value\)/);
assert.match(settingsSource, /HAPTICS_ENABLED_KEY = "haptics_enabled"/);
assert.match(settingsSource, /SOUND_ENABLED_KEY = "sound_enabled"/);
assert.match(settingsSource, /getFeedbackPreferences/);
assert.match(settingsSource, /saveHapticsEnabled/);
assert.match(settingsSource, /saveSoundEnabled/);
assert.match(feedbackSource, /hapticsEnabled: true/);
assert.match(feedbackSource, /soundEnabled: true/);
assert.match(feedbackSource, /isHapticFeedbackEnabled/);
assert.match(feedbackSource, /isSoundFeedbackEnabled/);
assert.match(appSource, /setFeedbackPreferences\(savedFeedbackPreferences\)/);
assert.match(appSource, /appearanceMode === "daylight" \? "dark" : "light"/);
assert.match(summarySource, /label=\{language === "fr" \? "Effets sonores" : "Sound effects"\}/);
assert.match(summarySource, /label=\{language === "fr" \? "Vibrations" : "Haptics"\}/);
assert.match(summarySource, /accessibilityRole="switch"/);
assert.match(summarySource, /accessibilityState=\{\{ checked: active \}\}/);
assert.match(atlasSource, /isSoundFeedbackEnabled/);
assert.match(atlasSource, /playImpactHaptic/);
assert.match(medalCelebrationSource, /isSoundFeedbackEnabled/);
assert.match(medalCelebrationSource, /playSuccessHaptic/);
assert.match(mapSource, /city-boundary-/);
assert.match(mapSource, /WALKING_COLORS\.cityBoundaryMuted/);
assert.match(mapSource, /selectedZone\?\.type === "district"/);
assert.match(mapSource, /WALKING_COLORS\.districtBoundaryMuted/);
assert.equal([...mapSource.matchAll(/WALKING_COLORS\.selectedZoneFill/g)].length, 2);
assert.equal([...mapSource.matchAll(/rgba\(229, 122, 50, 0\.(?:54|48|42|36)\)/g)].length, 4);
assert.match(mapSource, /rgba\(126, 58, 176, 0\.42\)/);
assert.match(mapSource, /ForbiddenZoneOverlay/);
assert.match(
  mapSource,
  /ForbiddenZoneOverlay[\s\S]*pointerEvents="none"[\s\S]*tappable=\{false\}/
);
assert.match(mapSource, /ForbiddenZoneMapLabel/);
assert.match(mapSource, /formatForbiddenZoneArea\(zone\.areaM2\)/);
assert.match(summarySource, /onMapPress=\{handleMapPressEvent\}/);
assert.match(summarySource, /visibleForbiddenZoneLabel\.districtId !== activeDistrictObjectiveId/);
assert.match(summarySource, /updateForbiddenZoneComment/);
assert.match(forbiddenZoneCommentSource, /maxLength=\{FORBIDDEN_ZONE_COMMENT_MAX_LENGTH\}/);
assert.match(forbiddenZoneCommentSource, /multiline=\{false\}/);
assert.match(walkControlsSource, /forbiddenZoneModeActive/);
assert.match(walkControlsSource, /accessibilityState=\{\{[\s\S]*selected: forbiddenZoneModeActive/);
assert.match(summarySource, /if \(isForbiddenZoneModeActive\)[\s\S]*handleForbiddenZoneLongPress/);
assert.match(summarySource, /forbiddenZoneModeDisabled=\{Boolean\(activeWalk\)\}/);
assert.match(summarySource, /mapBoundaryContext/);
assert.match(summarySource, /setMapBoundaryContext/);
assert.doesNotMatch(summarySource, /cityBoundaryZone|setDistrictZones/);
assert.match(mapSource, /districtZones\.flatMap/);
assert.match(mapSource, /const isSelectedDistrict/);
assert.match(mapSource, /memo\(function AdministrativeBoundaryOverlay/);
assert.doesNotMatch(mapSource, /unselectedDistrictZones|selectedZone\.geometry\.map/);
assert.ok(summarySource.includes("const visibleMapBoundaryContext = useMemo"));
assert.ok(mapSource.includes('key={`native-map-${appearanceMode}-city-${cityZone?.id ?? "none"}`}'));
assert.match(mapSource, /initialRegion={visibleRegion}/);
assert.ok(summarySource.includes("objectiveMatchesCity"));
assert.ok(summarySource.includes("doesDistrictBelongToCity(objective.zone, mapBoundaryContext.city)"));
assert.ok(summarySource.includes("cityZone={visibleMapBoundaryContext.city}"));
assert.ok(summarySource.includes("districtZones={visibleMapBoundaryContext.districts}"));
assert.match(mapSource, /styles\.playerCompassHalo/);
assert.match(mapSource, /strokeWidth=\{isSelectedDistrict \? 3 : 1\.5\}/);
assert.match(mapSource, /\? 4 : 3/);
assert.match(mapSource, /MEDAL_MARKER_MAX_LATITUDE_DELTA = 0\.14/);
assert.match(
  mapSource,
  /visibleRegion\.latitudeDelta <= MEDAL_MARKER_MAX_LATITUDE_DELTA/
);
assert.match(historySource, /technicalVisible/);
assert.match(appSource, /useFonts/);
assert.match(appSource, /Cinzel-Variable\.ttf/);
assert.match(atlasSource, /fontFamily: ATLAS_DISPLAY_FONT/);
assert.match(mapSource, /onTouchStart=\{onMapInteraction\}/);
assert.match(summarySource, /wordmarkCollapseProgress/);
assert.match(summarySource, /recordingLayoutProgress/);
assert.match(summarySource, /outputRange: \[98, 38\]/);
assert.match(summarySource, /outputRange: \[1, 0\.385\]/);
assert.match(
  summarySource,
  /if \(!activeWalkRef\.current\) \{\s*setIsMapWordmarkCollapsed\(false\);\s*\}/
);
assert.match(
  summarySource,
  /if \(isRecording\) \{\s*setIsMapWordmarkCollapsed\(true\);\s*\}/
);
assert.match(
  summarySource,
  /recordingLayoutProgress[\s\S]*duration: 280,[\s\S]*toValue: isRecording \? 1 : 0/
);
assert.match(summarySource, /height: Animated\.multiply\(/);
assert.match(
  summarySource,
  /outputRange: \[ATLAS_NAVIGATION_DOCK_HEIGHT \+ 6, ATLAS_NAVIGATION_DOCK_HEIGHT\]/
);
assert.match(summarySource, /logo: \{[\s\S]*height: 98,[\s\S]*width: "86%"/);
assert.doesNotMatch(summarySource, /styles\.mapHudRow/);
assert.match(summarySource, /function CityMedalProgress[\s\S]*<ObjectiveToggleButton[\s\S]*function ObjectiveToggleButton/);
assert.match(summarySource, /style=\{styles\.cityMedalMain\}/);
assert.match(summarySource, /style=\{styles\.cityMedalActionDivider\}/);
assert.equal((summarySource.match(/marginHorizontal: -7/g) ?? []).length, 2);
assert.match(summarySource, /cityMedalHud: \{[\s\S]*borderRadius: 10,[\s\S]*marginHorizontal: -7/);
assert.match(summarySource, /objectiveHud: \{[\s\S]*borderRadius: 10,[\s\S]*marginHorizontal: -7/);
assert.match(summarySource, /cityMedalHud: \{[\s\S]*minHeight: 46/);
assert.match(atlasSource, /navigationDockItem: \{[\s\S]*height: 48,[\s\S]*minWidth: 40/);
assert.match(atlasSource, /navigationDock: \{[\s\S]*gap: 1,[\s\S]*minHeight: ATLAS_NAVIGATION_DOCK_HEIGHT,[\s\S]*paddingVertical: 4/);
assert.match(atlasSource, /navigationDock: \{[\s\S]*marginHorizontal: 8/);
assert.doesNotMatch(atlasSource, /mapNavigationDock|pageNavigationDock/);
assert.match(atlasSource, /navigationDockFrame: \{[\s\S]*bottom: 2,[\s\S]*top: 2/);
assert.match(atlasSource, /ATLAS_DOCK_HIT_SLOP/);
assert.match(atlasSource, /ATLAS_DOCK_COMPACT_HIT_SLOP/);
assert.match(atlasSource, /useWindowDimensions\(\)\.width < 360/);
assert.match(atlasSource, /navigationDockItemCompact: \{[\s\S]*minWidth: 34,[\s\S]*width: 34/);
assert.match(atlasSource, /AtlasNavigationProvider/);
assert.match(atlasSource, /\{ icon: "map-outline", id: "map" \}/);
assert.match(atlasSource, /map: strings\.common\.map/);
assert.match(atlasSource, /const expandedPage = previewPage \?\? activePage/);
assert.match(atlasSource, /const previewing = placement === "map" && previewPage === item\.id/);
assert.match(atlasSource, /opacity: previewing \? previewOpacity : 1/);
assert.match(atlasSource, /beginPreview/);
assert.match(atlasSource, /finishPreview/);
assert.match(atlasSource, /previewDismissTimerRef/);
assert.match(atlasSource, /delayLongPress=\{320\}/);
assert.match(atlasSource, /\}, 650\)/);
assert.match(atlasSource, /duration: 220/);
assert.match(atlasSource, /ATLAS_NAVIGATION_DOCK_HEIGHT = 56/);
assert.match(atlasSource, /function AtlasNavigationDockLayer/);
assert.match(atlasSource, /ATLAS_NAVIGATION_DOCK_HEIGHT \+ Math\.max\(safeAreaInsets\.bottom, 6\)/);
assert.match(atlasSource, /disabled=\{swipeBackDisabled\}/);
assert.match(summarySource, /<AtlasNavigationDockLayer/);
assert.match(summarySource, /navigateAtlasPage/);
assert.doesNotMatch(summarySource, /mapDockReturnProgress/);
assert.match(summarySource, /activePage: activeAtlasPage \?\? "map"/);
assert.match(summarySource, /<WalkControls[\s\S]*<AtlasNavigationDockLayer[\s\S]*activePage="map"/);
assert.match(summarySource, /if \(page === "map"\)/);
assert.match(
  summarySource,
  /if \(activeAtlasPage === page\) \{\s*handleReturnToMapFromAtlas\(\)/
);
assert.match(diagnosticsModalSource, /<AtlasScreen/);
assert.match(summarySource, /<AtlasDialogDivider \/>/);
assert.match(summarySource, /imageStyle=\{styles\.dialogPaperTexture\}/);
assert.match(summarySource, /borderColor: APP_COLORS\.border/);
assert.match(summarySource, /summaryQualityPanel/);
assert.equal((summarySource.match(/<AtlasHudTexture/g) ?? []).length, 4);
assert.doesNotMatch(summarySource, /<AtlasHudTexture opacity=\{0\.05\} \/>/);
assert.doesNotMatch(summarySource, /console\.error\((?:"Reprocess recordings failed"|`Reprocess recording)/);
assert.equal((summarySource.match(/console\.warn\((?:"Reprocess recordings failed"|`Reprocess recording)/g) ?? []).length, 2);
assert.doesNotMatch(routeSnapshotSource, /continuing from cache/);
assert.equal((summarySource.match(/<AtlasHudDivider/g) ?? []).length, 2);
assert.match(atlasSource, /navigationDockItemActive:[\s\S]*rgba\(245, 196, 81, 0\.13\)/);
assert.match(atlasSource, /navigationDockLabel:[\s\S]*fontFamily: ATLAS_DISPLAY_FONT/);
assert.match(summarySource, /cityMedalName:[\s\S]*fontFamily: ATLAS_DISPLAY_FONT/);
assert.match(summarySource, /objectiveName:[\s\S]*fontFamily: ATLAS_DISPLAY_FONT/);
assert.match(summarySource, /hitSlop=\{6\}/);
assert.match(summarySource, /mapZoneSelectionOption:[\s\S]*minHeight: 44/);
assert.match(hudDecorSource, /atlas-paper-texture\.png/);
assert.match(hudDecorSource, /export function AtlasHudDivider/);
assert.match(hudDecorSource, /transform: \[\{ rotate: "45deg" \}\]/);
assert.match(walkControlsSource, /<AtlasHudTexture opacity=\{0\.1\} \/>/);
assert.match(walkControlsSource, /FIELD LOG/);
assert.match(walkControlsSource, /fontFamily: ATLAS_DISPLAY_FONT/);
assert.match(walkControlsSource, /style=\{styles\.gpsState\}/);
assert.match(walkControlsSource, /borderColor: APP_COLORS\.border/);
assert.doesNotMatch(walkControlsSource, /borderColor: color/);
assert.match(walkControlsSource, /minHeight: 44/);
assert.match(walkControlsSource, /container: \{[\s\S]*borderRadius: 10,[\s\S]*marginHorizontal: -7/);

assert.match(atlasSource, /isReduceMotionEnabled/);
assert.match(atlasSource, /atlas-paper-texture\.png/);
assert.match(atlasSource, /atlas-page\.wav/);
assert.match(soundAssetReadme, /turned-page-s0164\.html/);
assert.match(atlasSource, /atlas-reward-jingle\.wav/);
assert.match(atlasSource, /atlas-stamp\.wav/);
assert.match(atlasSource, /ATLAS_SOUND_PLAYERS/);
assert.match(atlasSource, /ATLAS_REWARD_JINGLE_DELAY_MS = 90/);
assert.match(atlasSource, /ATLAS_PAGE_SOUND_VOLUME = 0\.5/);
assert.match(atlasSource, /ATLAS_SOUND_PLAYERS\.page\.volume = ATLAS_PAGE_SOUND_VOLUME/);
assert.match(atlasSource, /playPreloadedAtlasSound\("ink"\)/);
assert.match(
  atlasSource,
  /setTimeout\(\s*\(\) => playPreloadedAtlasSound\("reward"\),\s*ATLAS_REWARD_JINGLE_DELAY_MS/
);
assert.doesNotMatch(atlasSource, /import\("expo-audio"\)/);
assert.match(appSource, /interruptionMode: "mixWithOthers"/);
assert.match(appSource, /playsInSilentMode: true/);
assert.match(atlasSource, /atlas-cartographer-stamp\.png/);
assert.match(atlasSource, /styles\.stampArtwork/);
assert.match(atlasSource, /styles\.stampCopy/);
assert.match(atlasSource, /duration: 240/);
assert.match(atlasSource, /PanResponder\.create/);
assert.match(atlasSource, /onMoveShouldSetPanResponderCapture/);
assert.match(atlasSource, /Platform\.OS === "ios"/);
assert.match(atlasSource, /onStartShouldSetPanResponderCapture/);
assert.match(atlasSource, /translateX: swipeTranslateX/);
assert.match(atlasSource, /onAccessibilityEscape/);
assert.match(summarySource, /function returnToMapFromAtlas[\s\S]*playAtlasSound\("page"\)/);
assert.equal((summarySource.match(/returnToMapFromAtlas/g) ?? []).length, 5);
assert.match(completionSource, /<AtlasScreen onSwipeBack=\{onClose\}/);
assert.match(historySource, /onSwipeBack=\{detailWalk \? \(\) => setDetailSessionId\(null\) : onClose\}/);
assert.match(historySource, /swipeBackDisabled=\{dataOperation !== null\}/);
assert.match(medalCollectionSource, /<AtlasScreen onSwipeBack=\{onClose\}/);
assert.match(expeditionSource, /<AtlasScreen onSwipeBack=\{onClose\}/);
assert.match(expeditionSource, /No district selected/);
assert.match(expeditionSource, /onPress=\{onSelectDistrict\}/);
assert.equal((summarySource.match(/<AtlasScreen onSwipeBack=\{onClose\}/g) ?? []).length, 2);
for (const modalSource of [completionSource, historySource, medalCollectionSource, expeditionSource, summarySource]) {
  assert.match(modalSource, /presentationStyle="overFullScreen"/);
  assert.match(modalSource, /transparent/);
}
assert.match(medalCollectionSource, /<AtlasModalHeader/);
assert.match(medalCollectionSource, /emblem="ribbon-outline"/);
assert.match(medalCollectionSource, /animationType="none"/);
assert.match(medalCollectionSource, /<AtlasSectionLabel/);
assert.doesNotMatch(medalCollectionSource, /SafeAreaView/);
assert.doesNotMatch(medalCollectionSource, /styles\.closeButton/);
assert.match(summarySource, /N\\u00c9CESSAIRE DU CARTOGRAPHE/);
assert.match(summarySource, /CARNET DE L'EXPLORATEUR/);
assert.match(summarySource, /<AtlasStamp/);
assert.match(summarySource, /presentation: "map-selection"/);
assert.match(summarySource, /mapContentInsets=\{mapStampInsets\}/);
assert.match(summarySource, /message=\{isLaunchDismissed \? atlasStampMessage : null\}/);
assert.match(
  summarySource,
  /if \(\s*!isLaunchDismissed \|\|\s*!objective \|\|\s*!objectiveStats\?\.permanentlyCompleted\s*\)/
);
assert.match(summarySource, /onLayout=\{handleMapTopPanelLayout\}/);
assert.match(summarySource, /onLayout=\{handleMapBottomPanelLayout\}/);
assert.match(atlasSource, /height: 106/);
assert.match(atlasSource, /Animated\.sequence/);
assert.match(atlasSource, /toValue: 0\.76/);
assert.match(atlasSource, /\? \[4\.8, 2\.72, 3\]/);
assert.match(atlasSource, /stampTextFace/);
assert.match(atlasSource, /textShadowColor: "rgba\(255, 255, 255, 0\.92\)"/);
assert.match(atlasSource, /fontSize: 7\.5/);
assert.match(atlasSource, /fontSize: 7,/);
assert.match(atlasSource, /if \(!message \|\| !artworkReady\) return/);
assert.match(atlasSource, /onLoad=\{\(\) => setLoadedArtworkMessageId\(message\.id\)\}/);
assert.match(atlasSource, /opacity: artworkReady/);
assert.match(atlasSource, /playAtlasSound\(message\.sound \?\? "ink"\)/);
assert.match(atlasSource, /ATLAS_STAMP_MAX_VISIBLE_MS = 4_000/);
assert.match(atlasSource, /setTimeout\(onDismiss, ATLAS_STAMP_MAX_VISIBLE_MS\)/);
assert.match(summarySource, /title: language === "fr" \? "ZONE ENCLOSE" : "AREA ENCLOSED"/);
assert.match(summarySource, /sound: "reward"/);
assert.ok(summarySource.match(/presentation: "map-selection"/g)?.length >= 3);
assert.match(mapSource, /setIsInkRevealing/);
assert.match(mapSource, /highlightedRouteDrawProgress/);
assert.match(mapSource, /drawProgress=\{isHighlighted/);
console.log("PASS GPS UI classifies acquiring, good, weak/stale, denied, and unavailable states");
console.log("PASS iOS Atlas edge-swipe activation, completion, cancellation, and modal wiring");
console.log("PASS map paths use the shared semantic walking palette");
console.log("PASS iOS map switches between Explorator and Daylight while preserving game-owned territory and markers");
console.log("PASS route details and recording summaries use summary-first quality cards");
console.log("PASS visual hierarchy uses collapsing branding, display type, quiet borders, and branded dialogs");
console.log("PASS Map, Details, History, Completion, Expeditions, Options, and Medals share the Atlas Cabinet architecture");
console.log("PASS Expeditions is a permanent engraved navigation destination with a district-selection empty state");
console.log("PASS map HUD uses four separate lightly inset Atlas stripes with a uniformly textured objective action");
console.log("PASS handled reprocess failures avoid LogBox and delegate repair logging to callers");
