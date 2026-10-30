const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const source = require("@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json");
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
const names = new Set();
for (const file of [path.join(root, "App.tsx"), ...walk(path.join(root, "src"))]) {
  if (!/\.tsx?$/.test(file) || file.includes(`${path.sep}generated${path.sep}`)) continue;
  const ast = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  function visit(node) {
    // Includes JSX attributes, conditional branches, category maps and typed unions.
    if (ts.isStringLiteralLike(node) && Object.hasOwn(source, node.text)) names.add(node.text);
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const glyphs = Object.fromEntries([...names].sort().map((name) => [name, source[name]]));
if (require.main === module) process.stdout.write(JSON.stringify(glyphs));
module.exports = glyphs;
