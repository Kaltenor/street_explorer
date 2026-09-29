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
  assertFrame(`native-stale-${direction}.png`, true);

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
    mapSource.includes("styles.playerCompassHalo") &&
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
    mapSource.includes("showsUserLocation={false}") &&
    mapSource.includes("PLAYER_WALK_FRAME_INTERVAL_MS = 170") &&
    mapSource.includes("setWalkFrameIndex") &&
    mapSource.includes("setInterval") &&
    mapSource.includes("setMovement(null)") &&
    !mapSource.includes("PLAYER_NATIVE_FRAMES"),
  "Stop/Start persistence, frame timing, movement settling, game-owned location presentation, or stale GPS accessibility is missing"
);
assert(
    mapSource.includes("PLAYER_SPRITES") &&
    mapSource.includes("getPlayerDirection") &&
    mapSource.includes("getPlayerHeading") &&
    mapSource.includes("getMovementBetween") &&
    mapSource.includes("MODE_LOCATION_CONFIG.walk.maxAcceptedAccuracyMeters") &&
    mapSource.includes("PLAYER_SPRITES[direction].stale") &&
    mapSource.includes("PLAYER_SPRITE_HANDOFF_MS = 60") &&
    mapSource.includes("setVisibleSpriteSources") &&
    mapSource.includes("sources.includes(targetSpriteSource)") &&
    mapSource.includes("[...sources, targetSpriteSource]") &&
    mapSource.includes("setVisibleSpriteSources([targetSpriteSource])") &&
    mapSource.includes("opacity: visibleSpriteSources.includes(frame.source) ? 1 : 0") &&
    !mapSource.includes("Marker.Animated") &&
    !mapSource.includes("new AnimatedRegion") &&
    !mapSource.includes("image={") &&
    !mapSource.includes("playerSpriteLayer") &&
    !mapSource.includes('require("../../assets/player-npc-topdown.png")'),
  "Directional frame animation is missing or fragile marker/image animation returned"
);

assert(
  fs.existsSync(path.join(root, "assets", "player", "cartographer-sheet.png")),
  "Original generated cartographer source sheet is missing"
);

console.log("Player animation checks passed.");

// Execute the production helper/effect bodies with deterministic native timers.
// This checks animation policy and timer behavior beyond the source wiring above.
const strictAssert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const ast = ts.createSourceFile('ExplorationMap.tsx', mapSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findNode(predicate) {
  let found;
  function visit(node) { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); }
  visit(ast); strictAssert(found, 'production declaration exists'); return found;
}
function transpile(source) {
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
function evaluateEffect(token, context) {
  const node = findNode(node => ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0].getText(ast).includes(token));
  return vm.runInNewContext(transpile(`(${node.arguments[0].getText(ast)})()`), context);
}
const directionHelpers = ['normalizeHeading', 'getPlayerDirection'].map(name =>
  findNode(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast)
).join('\n');
const directionContext = vm.createContext({}); vm.runInContext(transpile(directionHelpers), directionContext);
for (const [heading, camera, expected] of [
  [0, 0, 'north'], [90, 0, 'east'], [180, 0, 'south'], [270, 0, 'west'],
  [90, 90, 'north'], [0, 90, 'west'], [270, 90, 'south'], [0, 270, 'east'],
  [360, 360, 'north'], [-90, 0, 'west'], [null, 90, 'south']
]) strictAssert.equal(directionContext.getPlayerDirection(heading, camera), expected);
console.log('PASS player direction follows map bearing, wraparound and unknown-heading fallback');

const animateDeclaration = findNode(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'shouldAnimate');
for (const isAppActive of [true, false]) for (const reducedMotion of [true, false]) for (const isMoving of [true, false]) {
  let timer, cleared = false, frame = 2;
  const context = vm.createContext({ isAppActive, reducedMotion, isMoving,
    PLAYER_WALK_FRAME_INTERVAL_MS: 170,
    setWalkFrameIndex: next => { frame = typeof next === 'function' ? next(frame) : next; },
    setInterval: callback => { timer = callback; return 9; },
    clearInterval: id => { strictAssert.equal(id, 9); cleared = true; }
  });
  vm.runInContext(transpile(`const ${animateDeclaration.getText(ast)};`), context);
  const cleanup = evaluateEffect('const frameTimer', context);
  if (isAppActive && !reducedMotion && isMoving) {
    strictAssert.equal(typeof timer, 'function'); timer(); strictAssert.equal(frame, 0);
    cleanup(); strictAssert(cleared);
  } else { strictAssert.equal(timer, undefined); strictAssert.equal(frame, 0); }
}
console.log('PASS walk-frame intervals stop for reduced motion, background and standing; cleanup removes active timers');

let now = 0, standingTick, standingCleanup = false;
const speeches = [];
const standingContext = {
  isAppActive: true, isRecording: true,
  latestMotionRef: { current: { speed: 1.2, location: {} } },
  isPlayerMotionPointFresh: () => true,
  lastMovementAtRef: { current: 0 }, hasStandingSpeechRef: { current: false },
  PLAYER_MOVING_SPEED_METERS_PER_SECOND: 0.45,
  PLAYER_SPEECH_CONFIG: { standingStillDelayMs: 45000 },
  Date: { now: () => now }, enqueueSpeech: behavior => speeches.push(behavior),
  setInterval: callback => { standingTick = callback; return 8; },
  clearInterval: id => { strictAssert.equal(id, 8); standingCleanup = true; }
};
const cleanupStanding = evaluateEffect('const standingTimer', standingContext);
for (now = 1000; now <= 120000; now += 1000) standingTick();
strictAssert.equal(speeches.length, 0, 'constant fresh walking speed must not trigger standing speech');
standingContext.latestMotionRef.current.speed = 0;
standingContext.isPlayerMotionPointFresh = () => false;
now = 200000; standingTick(); strictAssert.equal(speeches.length, 0, 'stale GPS is not evidence of standing still');
standingContext.isPlayerMotionPointFresh = () => true;
now = 164000; standingTick(); strictAssert.equal(speeches.length, 0);
now = 165000; standingTick(); strictAssert.deepEqual(speeches, ['standingStill']);
now = 166000; standingTick(); strictAssert.equal(speeches.length, 1, 'standing speech is emitted once');
cleanupStanding(); strictAssert(standingCleanup);
standingContext.isAppActive = false; standingTick = undefined;
evaluateEffect('const standingTimer', standingContext); strictAssert.equal(standingTick, undefined);
console.log('PASS standing speech uses current motion, does not mistake steady walking for inactivity and pauses in background');

for (const loadedSpriteCount of [0, 19, 20]) for (const shouldAnimate of [false, true]) {
  let timer, tracking = false, redraws = 0, timerCleared = false;
  const cleanup = evaluateEffect('loadedSpriteCount < PLAYER_SPRITE_LAYERS.length', {
    usesGoogleMaps: true, isAppActive: true, shouldAnimate, hasLayout: true, loadedSpriteCount,
    PLAYER_SPRITE_LAYERS: new Array(20), PLAYER_SPRITE_HANDOFF_MS: 60,
    setTracksSnapshot: value => { tracking = value; },
    markerRef: { current: { redraw: () => redraws++ } },
    setTimeout: callback => { timer = callback; return 7; },
    clearTimeout: id => { strictAssert.equal(id, 7); timerCleared = true; }
  });
  strictAssert.equal(tracking, true);
  if (loadedSpriteCount === 20 && !shouldAnimate) {
    strictAssert.equal(typeof timer, 'function'); timer();
    strictAssert.equal(tracking, false); strictAssert.equal(redraws, 1);
    cleanup(); strictAssert(timerCleared);
  } else strictAssert.equal(timer, undefined, 'moving or partially decoded marker stays live');
}
console.log('PASS idle snapshots freeze only after complete sprite decoding and final redraw');

function readRgbaPixels(filePath) {
  const png = fs.readFileSync(filePath);
  strictAssert.equal(png[24], 8, 'sprite uses 8-bit channels');
  strictAssert.equal(png[25], 6, 'sprite retains RGBA transparency');
  strictAssert.equal(png[28], 0, 'sprite is non-interlaced');
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = require('node:zlib').inflateSync(Buffer.concat(chunks));
  const pixels = Buffer.alloc(64 * 64 * 4), stride = 64 * 4;
  for (let y = 0; y < 64; y++) {
    const filter = raw[y * (stride + 1)];
    strictAssert(filter <= 4, 'valid PNG scanline filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const corner = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const p = left + up - corner;
      const paeth = Math.abs(p - left) <= Math.abs(p - up) && Math.abs(p - left) <= Math.abs(p - corner)
        ? left : Math.abs(p - up) <= Math.abs(p - corner) ? up : corner;
      const predicted = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predicted) & 255;
    }
  }
  return pixels;
}
for (const direction of directions) {
  const names = [`native-idle-${direction}.png`, `native-stale-${direction}.png`,
    ...[1, 2, 3].map(frame => `native-walk-${direction}-${frame}.png`)];
  const frames = names.map(name => readRgbaPixels(path.join(root, 'assets/player', name)));
  for (const [index, pixels] of frames.entries()) {
    let top = 64, bottom = -1, left = 64, right = -1;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      if (pixels[(y * 64 + x) * 4 + 3]) {
        top = Math.min(top, y); bottom = Math.max(bottom, y);
        left = Math.min(left, x); right = Math.max(right, x);
      }
    }
    strictAssert(top >= 4 && bottom - top >= 40, `${names[index]} hat fits shared character scale: top=${top}, bottom=${bottom}, left=${left}, right=${right}`);
    strictAssert.equal(bottom, 59, `${names[index]} keeps the shared boot baseline at y=60 exclusive`);
    strictAssert(left >= 2 && right <= 61, `${names[index]} keeps transparent side margins`);
  }
  for (let pixel = 3; pixel < frames[0].length; pixel += 4) {
    strictAssert.equal(frames[0][pixel], frames[1][pixel], 'stale variant preserves idle silhouette');
  }
}
console.log('PASS decoded RGBA sprites keep transparent margins, shared boot baseline and matching stale silhouette');

const backgroundSpeech = {
  isAppActive: false, activeSpeech: { id: 1, text: 'Old message' },
  activeSpeechRef: { current: { id: 1 } }, pendingSpeechRef: { current: { id: 2 } },
  setActiveSpeech: value => { backgroundSpeech.activeSpeech = value; },
  setTypedSpeech: value => { backgroundSpeech.typedSpeech = value; },
  setIsSpeechVisible: value => { backgroundSpeech.visible = value; },
  setInterval: () => { throw new Error('background typing must not run'); },
  setTimeout: () => { throw new Error('background speech must not schedule'); }
};
evaluateEffect('let characterTimer', backgroundSpeech);
strictAssert.equal(backgroundSpeech.activeSpeechRef.current, null);
strictAssert.equal(backgroundSpeech.pendingSpeechRef.current, null);
strictAssert.equal(backgroundSpeech.activeSpeech, null);
strictAssert.equal(backgroundSpeech.typedSpeech, '');
strictAssert.equal(backgroundSpeech.visible, false);
backgroundSpeech.isAppActive = true;
evaluateEffect('let characterTimer', backgroundSpeech);
strictAssert.equal(backgroundSpeech.visible, false, 'resume cannot replay a stale speech request');
console.log('PASS background discards current and queued speech without replaying stale text on resume');
