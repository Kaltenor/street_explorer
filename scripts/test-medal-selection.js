const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const medal = (albumId, id) => ({ albumId, id, isCollected: true, category: 'history', name: { en: id, fr: id }, description: { en: 'Description', fr: 'Description' } });
const target = medal('lyon', 'landmark');
const other = medal('paris', 'landmark'); // IDs alone are not globally unique.
const cities = [other, target].map(item => ({ albumId: item.albumId, cityName: { en: item.albumId, fr: item.albumId }, medals: [item] }));
function mount(props) {
  let cursor = 0;
  const slots = [];
  const hooks = {
    useEffect() {}, useMemo: fn => fn(),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = next; }]; },
    useRef(current) { const i = cursor++; return slots[i] ??= { current }; }
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  const mocks = {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': new Proxy({ StyleSheet: { hairlineWidth: 1 } }, { get: (target, name) => target[name] ?? name }),
    '../constants/appearance': { createAppearanceStyles: value => value },
    '../constants/theme': { APP_COLORS: { gold: 'gold', cardHighlight: 'highlight' } },
    '../services/zoneCompletion': { isPointInsideZone: () => false },
    '@expo/vector-icons/Ionicons': 'Icon', './AtlasCabinet': {}, './MedalWikipediaReader': {}
  };
  vm.runInNewContext(compile(fs.readFileSync('src/components/MedalCollectionModal.tsx', 'utf8') + '\nexport { MedalSection };'), {
    exports, require: id => { assert(id in mocks, id); return mocks[id]; }
  });
  const render = next => { cursor = 0; return exports.MedalCollectionModal(next ?? props); };
  return { render, section: props => exports.MedalSection(props) };
}
const defaults = { collectedCities: cities, districtZones: [], language: 'en', visible: true,
  progress: { album: { id: 'lyon', cityName: { en: 'Lyon', fr: 'Lyon' } }, medals: [medal('lyon', 'first'), target], collectedCount: 2 } };
const layout = y => ({ nativeEvent: { layout: { y } } });
for (const foreign of [false, true]) {
  const props = { ...defaults, initialSelectedMedal: foreign ? other : target };
  for (const order of [['show', 'content', 'section', 'card'], ['card', 'section', 'content', 'show'], ['show', 'card', 'section', 'content']]) {
    const h = mount(props);
    const tree = h.render();
    const list = nodes(tree).find(node => node.props?.onContentSizeChange);
    const scrolls = [];
    list.props.ref.current = { scrollTo: value => scrolls.push(value) };
    const sections = nodes(tree).filter(node => typeof node.type === 'function' && node.type.name === 'MedalSection');
    const section = sections.find(node => node.props.medals.some(item => item.albumId === props.initialSelectedMedal.albumId && item.id === props.initialSelectedMedal.id));
    assert(section, 'correct scope contains tapped medal');
    const cardTree = h.section(section.props);
    const selectedButton = nodes(cardTree).find(node => node.props?.accessibilityState?.selected);
    assert(selectedButton, 'tapped card is selected');
    const card = nodes(cardTree).find(node => node !== cardTree && node.props?.onLayout);
    assert(card.props.style.some(style => style?.borderColor === 'gold'), 'selection is visibly highlighted');
    const events = {
      show: () => tree.props.onShow(), content: () => list.props.onContentSizeChange(400, 3000),
      section: () => cardTree.props.onLayout(layout(1000)), card: () => card.props.onLayout(layout(200))
    };
    for (const event of order.slice(0, -1)) { events[event](); assert.equal(scrolls.length, 0); }
    events[order.at(-1)]();
    assert.equal(scrolls.length, 1); assert.equal(scrolls[0].y, 1188); assert.equal(scrolls[0].animated, false);
    events.content(); events.card(); events.show(); assert.equal(scrolls.length, 1, 'refreshes must not hijack manual scrolling');
    for (const item of sections.filter(item => item !== section)) {
      assert(!nodes(h.section(item.props)).some(node => node.props?.accessibilityState?.selected), 'other album with same ID stays unselected');
    }
  }
}
const ordinary = mount(defaults);
const overview = ordinary.render();
assert(!nodes(overview).filter(node => node.type?.name === 'MedalSection').flatMap(node => nodes(ordinary.section(node.props))).some(node => node.props?.accessibilityState?.selected));
// Data arriving after presentation must still reveal the selected medal.
const pendingProps = { ...defaults, progress: null, collectedCities: [], initialSelectedMedal: target };
const pending = mount(pendingProps);
pending.render().props.onShow();
const loaded = pending.render({ ...pendingProps, collectedCities: cities });
const list = nodes(loaded).find(node => node.props?.onContentSizeChange);
let revealed = false;
list.props.ref.current = { scrollTo: () => { revealed = true; } };
list.props.onContentSizeChange();
const section = nodes(loaded).find(node => node.type?.name === 'MedalSection' && node.props.medals[0].albumId === 'lyon');
const rendered = pending.section(section.props);
rendered.props.onLayout(layout(200));
nodes(rendered).find(node => node !== rendered && node.props?.onLayout).props.onLayout(layout(80));
assert(revealed, 'delayed collection data reveals selection');

const mapSource = fs.readFileSync('src/screens/MapScreen.tsx', 'utf8');
const callback = mapSource.slice(mapSource.indexOf('const handleMapMedalPress ='), mapSource.indexOf('const handleMapReady ='));
const events = [];
vm.runInNewContext(compile(callback + '\nhandleMapMedalPress(medal);'), {
  medal: target, useCallback: fn => fn, setFocusedMedal: value => events.push(['focus', value]),
  setCollectionMedal: value => events.push(['selection', value]), setMedalsVisible: value => events.push(['open', value])
});
assert.deepEqual(events, [['focus', target], ['selection', target], ['open', true]]);
assert.match(mapSource, /initialSelectedMedal=\{collectionMedal\}/);
assert.match(mapSource, /const closeAllAtlasPages =[\s\S]*?setCollectionMedal\(null\)/);
console.log('PASS map medal selection: callback handoff, current/foreign albums, duplicate IDs, delayed data, layout/show ordering, one-time scroll, highlight and normal overview');
