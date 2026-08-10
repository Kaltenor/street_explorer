import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  createPlayerSpeechMessage,
  formatPlayerSpeechDistance,
  getPlayerSpeechCharacterCount,
  PLAYER_SPEECH_CONFIG,
  PLAYER_SPEECH_MESSAGES
} from "../src/services/playerSpeech.ts";

const root = path.resolve(import.meta.dirname, "..");
const mapSource = fs.readFileSync(
  path.join(root, "src", "components", "ExplorationMap.tsx"),
  "utf8"
);
const mapScreenSource = fs.readFileSync(
  path.join(root, "src", "screens", "MapScreen.tsx"),
  "utf8"
);
const behaviors = [
  "cheer",
  "distanceMilestone",
  "explorationStreak",
  "newArea",
  "poorGps",
  "revisit",
  "standingStill",
  "walkStarted",
  "walkStopped"
];

for (const language of ["en", "fr"]) {
  assert.deepEqual(Object.keys(PLAYER_SPEECH_MESSAGES[language]).sort(), [...behaviors].sort());

  for (const behavior of behaviors) {
    const messages = PLAYER_SPEECH_MESSAGES[language][behavior];
    assert(messages.length >= 3, `${language}/${behavior} needs several variants`);
    assert(messages.every((message) => message.length > 0));
  }

  assert(PLAYER_SPEECH_MESSAGES[language].cheer.length >= 8);
  assert.equal(PLAYER_SPEECH_MESSAGES[language].cheer.length, 13);
  assert.equal(PLAYER_SPEECH_MESSAGES[language].revisit.length, 8);
  assert.equal(PLAYER_SPEECH_MESSAGES[language].standingStill.length, 8);
  assert.equal(PLAYER_SPEECH_MESSAGES[language].walkStarted.length, 9);
  assert.equal(PLAYER_SPEECH_MESSAGES[language].walkStopped.length, 9);
}

assert(!PLAYER_SPEECH_MESSAGES.en.walkStarted.includes("Boots laced. The map has been warned."));
assert(!PLAYER_SPEECH_MESSAGES.fr.walkStarted.includes("Bottes lacées. La carte est prévenue."));

assert.equal(formatPlayerSpeechDistance(250, "en"), "250 m");
assert.equal(formatPlayerSpeechDistance(1_250, "en"), "1.25 km");
assert.equal(formatPlayerSpeechDistance(1_250, "fr"), "1,25 km");
assert.equal(
  createPlayerSpeechMessage("distanceMilestone", "en", {
    distanceMeters: 500,
    randomValue: 0
  }),
  "500 m charted. Splendid!"
);
assert.equal(
  createPlayerSpeechMessage("cheer", "fr", { randomValue: 0.999 }),
  "Quelque part devant, une rue attend d'être découverte."
);

assert.equal(PLAYER_SPEECH_CONFIG.distanceMilestoneMeters, 250);
assert.equal(PLAYER_SPEECH_CONFIG.newAreaCellInterval, 10);
assert.equal(PLAYER_SPEECH_CONFIG.standingStillDelayMs, 45_000);
assert(PLAYER_SPEECH_CONFIG.cheerMinimumDelayMs < PLAYER_SPEECH_CONFIG.cheerMaximumDelayMs);
assert(PLAYER_SPEECH_CONFIG.typewriterIntervalMs > 0);
assert(PLAYER_SPEECH_CONFIG.visiblePauseMs >= 1_500);
assert.equal(getPlayerSpeechCharacterCount(0, 50), 0);
assert.equal(getPlayerSpeechCharacterCount(37, 50), 0);
assert.equal(getPlayerSpeechCharacterCount(38, 50), 1);
assert.equal(getPlayerSpeechCharacterCount(380, 50), 10);
assert.equal(getPlayerSpeechCharacterCount(10_000, 50), 50);

for (const behavior of behaviors) {
  assert(
    mapSource.includes(`enqueueSpeech("${behavior}"`),
    `Player marker does not trigger ${behavior}`
  );
}

assert(
    mapSource.includes('identifier="street-explorer-player-speech"') &&
    mapSource.includes("anchor={{ x: 0.5, y: 1 }}") &&
    mapSource.includes("const PLAYER_SPEECH_IOS_CENTER_OFFSET_Y = -58") &&
    mapSource.includes('Platform.OS === "ios"') &&
    mapSource.includes("y: PLAYER_SPEECH_IOS_CENTER_OFFSET_Y") &&
    mapSource.includes("const PlayerSpeechMarker = memo") &&
    mapSource.includes("tappable={false}") &&
    mapSource.includes("styles.playerSpeechMarkerHidden") &&
    mapSource.includes("!isSpeechVisible ? styles.playerSpeechMarkerHidden : null") &&
    mapSource.includes("height: 128") &&
    !mapSource.includes("opacity={isSpeechVisible ? 1 : 0}") &&
    !mapSource.includes("tracksViewChanges={isSpeechVisible}") &&
    mapSource.includes("setIsSpeechVisible(true)") &&
    mapSource.includes("setIsSpeechVisible(false)") &&
    mapSource.includes("styles.playerSpeechMarker") &&
    mapSource.includes("activeSpeech.text.slice(0, characterCount)") &&
    mapSource.includes("getPlayerSpeechCharacterCount(") &&
    mapSource.includes("Date.now() - typingStartedAt") &&
    mapSource.includes("PLAYER_SPEECH_CONFIG.typewriterIntervalMs") &&
    mapSource.includes("PLAYER_SPEECH_CONFIG.visiblePauseMs") &&
    mapSource.includes("if (reducedMotion)") &&
    !mapSource.includes("<Callout") &&
    !mapSource.includes("showCallout()") &&
    !mapSource.includes("hideCallout()") &&
    !mapSource.includes('title={isGpsFresh ? "Current player location"'),
  "Non-selecting speech annotation, typewriter dismissal, Reduce Motion fallback, or native-callout removal is missing"
);

const playerMarkerStart = mapSource.indexOf("const PlayerLocationMarker = memo");
const speechMarkerStart = mapSource.indexOf("const PlayerSpeechMarker = memo");
const playerMarkerSource = mapSource.slice(playerMarkerStart, speechMarkerStart);
const speechMarkerSource = mapSource.slice(speechMarkerStart);

assert(
  playerMarkerStart >= 0 &&
    speechMarkerStart > playerMarkerStart &&
    (mapSource.match(/identifier="street-explorer-player-speech"/g) ?? []).length === 1 &&
    !playerMarkerSource.includes("activeSpeech") &&
    !playerMarkerSource.includes("typedSpeech") &&
    !playerMarkerSource.includes("PlayerSpeechMarker") &&
    !playerMarkerSource.includes("<>") &&
    speechMarkerSource.includes("activeSpeech.text.slice(0, characterCount)"),
  "Speech state is not isolated from the persistent player marker"
);

assert(
  mapScreenSource.includes("recordingExploredCellCount={activeNewCellIds.length}") &&
    mapScreenSource.includes("recordingDistanceMeters={activeWalk?.distanceMeters ?? 0}") &&
    mapScreenSource.includes("recordingSpeedMetersPerSecond={activeWalk?.currentSpeedMetersPerSecond ?? 0}") &&
    mapScreenSource.includes("gpsStatus={activeWalk?.lastRejectedPointReason ?? null}") &&
    mapScreenSource.includes("language={language}"),
  "Live behavior or localization inputs are not wired to the player marker"
);

console.log("Player speech checks passed.");
