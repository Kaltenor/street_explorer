const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const mapSource = fs.readFileSync(
  path.join(root, "src", "components", "ExplorationMap.tsx"),
  "utf8"
);
const mapScreenSource = fs.readFileSync(
  path.join(root, "src", "screens", "MapScreen.tsx"),
  "utf8"
);
const settingsSource = fs.readFileSync(
  path.join(root, "src", "database", "settingsRepository.ts"),
  "utf8"
);
const directions = ["east", "north", "south", "west"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readPngDimensions(filePath) {
  const png = fs.readFileSync(filePath);
  assert(
    png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    `Not a PNG: ${filePath}`
  );
  return { height: png.readUInt32BE(20), width: png.readUInt32BE(16) };
}

function assertFrame(name, shouldBeBundled) {
  const filePath = path.join(root, "assets", "player", name);
  assert(fs.existsSync(filePath), `Missing player frame: ${name}`);
  const dimensions = readPngDimensions(filePath);
  assert(
    dimensions.width === 64 && dimensions.height === 64,
    `Unexpected player frame size for ${name}: ${dimensions.width}x${dimensions.height}`
  );
  if (shouldBeBundled) {
    assert(
      mapSource.includes(`../../assets/player/${name}`),
      `Native marker frame is not bundled: ${name}`
    );
  }
}

for (const direction of directions) {
  assertFrame(`idle-${direction}.png`, false);
  assertFrame(`native-idle-${direction}.png`, true);
  assertFrame(`native-stale-${direction}.png`, false);

  for (let frame = 1; frame <= 3; frame += 1) {
    assertFrame(`walk-${direction}-${frame}.png`, false);
    assertFrame(`native-walk-${direction}-${frame}.png`, true);
  }
}

assert(
  mapSource.includes("persistentPlayerLocationRef") &&
    mapSource.includes("shouldAdoptPlayerLocation"),
  "Player location is not preserved across recording transitions"
);
assert(
  mapSource.includes("onPanDrag={handleMapPan}") &&
    !mapSource.includes("pointForCoordinate") &&
    !mapSource.includes("schedulePlayerProjection") &&
    !mapSource.includes("playerScreenPoint") &&
    !mapSource.includes("animateCamera") &&
    !mapSource.includes("isAutoFollowEnabled") &&
    !mapSource.includes("isMapMoving"),
  "Player panning still depends on delayed screen-space projection or camera following"
);
assert(
  mapSource.includes("PlayerLocationMarker") &&
    mapSource.includes('identifier="street-explorer-player"') &&
    mapSource.includes("coordinate={pointToCoordinate(location)}") &&
    mapSource.includes("tracksViewChanges") &&
    mapSource.includes("collapsable={false}") &&
    mapSource.includes("PLAYER_SPRITE_LAYERS.map") &&
    mapSource.includes("source={frame.source}") &&
    mapSource.includes("styles.playerSpriteImage") &&
    mapSource.includes("height: 64") &&
    mapSource.includes("width: 64") &&
    (mapSource.match(/identifier="street-explorer-player"/g) ?? []).length === 1,
  "Player animation is not contained in one stable, explicitly sized native map annotation"
);
assert(
  mapSource.includes("playerVisible && playerLocation") &&
    mapScreenSource.includes("playerVisible={isLaunchDismissed}"),
  "Player marker is not launch-gated"
);
assert(
  settingsSource.includes('LAST_PLAYER_LOCATION_KEY = "last_player_location"') &&
    settingsSource.includes("getSavedPlayerLocation") &&
    settingsSource.includes("savePlayerLocation") &&
    mapScreenSource.includes("playerLocationPersistenceCandidate") &&
    mapScreenSource.includes("PLAYER_LOCATION_PERSIST_INTERVAL_MS") &&
    mapSource.includes("pendingPlayerFocusTimestampRef") &&
    mapSource.includes("getPointTimestamp(playerLocation) <= pendingTimestamp") &&
    mapScreenSource.includes("Failed to restore the last player position") &&
    mapScreenSource.includes("Failed to persist the backgrounded player position"),
  "Last trustworthy player position is not durable across app and session relaunches"
);
assert(
  mapSource.includes("Last known player location, GPS signal stale") &&
    mapSource.includes("showsUserLocation") &&
    mapSource.includes("PLAYER_WALK_FRAME_INTERVAL_MS = 170") &&
    mapSource.includes("setWalkFrameIndex") &&
    mapSource.includes("setInterval") &&
    mapSource.includes("setMovement(null)") &&
    !mapSource.includes("PLAYER_NATIVE_FRAMES"),
  "Stop/Start persistence, frame timing, movement settling, native fallback, or stale GPS accessibility is missing"
);
assert(
    mapSource.includes("PLAYER_SPRITES") &&
    mapSource.includes("getPlayerDirection") &&
    mapSource.includes("getPlayerHeading") &&
    mapSource.includes("getMovementBetween") &&
    mapSource.includes("MODE_LOCATION_CONFIG.walk.maxAcceptedAccuracyMeters") &&
    mapSource.includes("opacity: frame.source === visibleSpriteSource ? 1 : 0") &&
    !mapSource.includes("Marker.Animated") &&
    !mapSource.includes("new AnimatedRegion") &&
    !mapSource.includes("image={") &&
    !mapSource.includes("playerSpriteLayer") &&
    !mapSource.includes('require("../../assets/player-npc-topdown.png")'),
  "Directional frame animation is missing or fragile marker/image animation returned"
);

console.log("Player animation checks passed.");
