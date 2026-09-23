const fs = require("node:fs");
const path = require("node:path");

const polygonPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-maps",
  "ios",
  "AirMaps",
  "AIRMapPolygon.m"
);

const original = "    [_map addOverlay:self];";
const replacement = `    // Preserve React child order when a polygon changes coordinates or style.
    // addOverlay: alone moves the changed polygon above later Forbidden Zones.
    BOOL foundSelf = NO;
    for (UIView *sibling in [_map reactSubviews]) {
        if (sibling == self) {
            foundSelf = YES;
            continue;
        }
        if (foundSelf && [sibling conformsToProtocol:@protocol(MKOverlay)] &&
            [_map.overlays containsObject:(id<MKOverlay>)sibling]) {
            [_map insertOverlay:self belowOverlay:(id<MKOverlay>)sibling];
            return;
        }
    }
    [_map addOverlay:self];`;

function patchPolygonOrder(source) {
  if (source.includes(replacement)) return source;
  if (!source.includes(original)) {
    throw new Error("[polygon-order-patch] Could not find AIRMapPolygon update anchor.");
  }
  return source.replace(original, replacement);
}

if (require.main === module) {
  if (!fs.existsSync(polygonPath)) {
    console.warn("[polygon-order-patch] AIRMapPolygon.m not found; skipping patch.");
  } else {
    const source = fs.readFileSync(polygonPath, "utf8");
    const patched = patchPolygonOrder(source);
    if (patched !== source) fs.writeFileSync(polygonPath, patched);
    console.log("[polygon-order-patch] Apple Maps polygon order is preserved.");
  }
}

module.exports = { patchPolygonOrder };
