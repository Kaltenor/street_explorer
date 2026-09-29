const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { appendGpsPoint, createActiveWalk, evaluateGpsPoint } = require('../src/services/recordingState.ts');
const valid = { latitude: 45, longitude: 4, timestamp: '2026-09-29T10:00:00Z', accuracy: 5, pointIndex: 0 };
for (const patch of [
  { timestamp: 'invalid' }, { latitude: NaN }, { longitude: Infinity },
  { latitude: 91 }, { latitude: -91 }, { longitude: 181 }, { longitude: -181 },
  { accuracy: -1 }, { accuracy: NaN }, { accuracy: Infinity }
]) {
  for (const previous of [null, { ...valid, timestamp: '2026-09-29T09:59:00Z' }]) {
    assert.equal(evaluateGpsPoint('walk', previous, { ...valid, ...patch }).accepted, false, JSON.stringify(patch));
  }
  const initial = createActiveWalk('walk', 1);
  const rejected = appendGpsPoint(initial, { ...valid, ...patch });
  assert.equal(rejected.acceptedPoint, null);
  assert.equal(rejected.walk.points.length, 0);
  assert.equal(appendGpsPoint(rejected.walk, valid).walk.acceptedGpsPointCount, 1);
}
assert.equal(evaluateGpsPoint('walk', null, { ...valid, accuracy: null }).accepted, true);
assert.equal(evaluateGpsPoint('walk', null, valid).accepted, true);
console.log('PASS invalid first and subsequent GPS values are rejected without poisoning later valid recording');
