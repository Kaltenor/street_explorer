import assert from "node:assert/strict";

import { partitionExplorationCellIdsByCity } from "../src/services/countrysideExploration.ts";

const cityBoundary = {
  geometry: [[
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 10 },
    { latitude: 10, longitude: 10 },
    { latitude: 10, longitude: 0 },
    { latitude: 0, longitude: 0 }
  ]],
  holes: [[
    { latitude: 4, longitude: 4 },
    { latitude: 4, longitude: 6 },
    { latitude: 6, longitude: 6 },
    { latitude: 6, longitude: 4 },
    { latitude: 4, longitude: 4 }
  ]]
};
const centers = new Map([
  ["inside", { latitude: 2, longitude: 2 }],
  ["city-hole", { latitude: 5, longitude: 5 }],
  ["outside", { latitude: 12, longitude: 12 }]
]);
const partition = partitionExplorationCellIdsByCity({
  cellIds: ["inside", "city-hole", "outside"],
  cityBoundaries: [cityBoundary],
  getCellCenter: (cellId) => centers.get(cellId)
});

assert.deepEqual(partition.cityCellIds, ["inside"]);
assert.deepEqual(partition.countrysideCellIds, ["city-hole", "outside"]);

const noKnownCities = partitionExplorationCellIdsByCity({
  cellIds: ["outside"],
  cityBoundaries: [],
  getCellCenter: (cellId) => centers.get(cellId)
});

assert.deepEqual(noKnownCities.cityCellIds, []);
assert.deepEqual(noKnownCities.countrysideCellIds, ["outside"]);

console.log("Countryside exploration partition checks passed.");
