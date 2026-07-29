const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const mapSource = fs.readFileSync(
  path.join(root, "src", "components", "ExplorationMap.tsx"),
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
  mapSource.includes("new AnimatedRegion") &&
    mapSource.includes("Marker.Animated") &&
    mapSource.includes("animatedCoordinate.timing"),
  "Native coordinate smoothing is missing"
);
assert(
  mapSource.includes("image={spriteSource}") &&
    mapSource.includes("tracksViewChanges={false}"),
  "Player is not rendered as a stable native marker image"
);
assert(
  mapSource.includes("persistentSpriteSourceRef") &&
    mapSource.includes('identifier="street-explorer-player"') &&
    mapSource.includes("Last known player location, GPS signal stale") &&
    !mapSource.includes("PLAYER_STALE_SPRITES"),
  "Stop/Start marker persistence or stale GPS accessibility is missing"
);
assert(
  !mapSource.includes("<Animated.View") &&
    !mapSource.includes("playerSpriteLayer") &&
    !mapSource.includes('require("../../assets/player-npc-topdown.png")'),
  "Fragile custom-view or legacy static player rendering is still active"
);

console.log("Player marker checks passed.");
