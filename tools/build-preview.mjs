// Builds a self-contained copy of the game for a preview host that only serves a few file
// types (html, js, css, json, png, jpg, svg, woff2, txt, md): every .glb model is embedded as
// base64 in js/embed/<name>.js (a module that sets window.__EMBED[name], loaded before
// main.js; js/scene/assets.js parses it instead of fetching the .glb). Licence files without
// an extension are copied as .txt.
//   node tools/build-preview.mjs [outDir]        (default: out/preview)
// Copies index.html, css/app.css, the fonts it uses, the JS import graph of js/main.js
// (relative imports, dynamic imports and the import map), the licences and README/LICENSES.
import { readFile, writeFile, mkdir, rm, copyFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, relative, extname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'out/preview'));
const ALLOWED = new Set(['.html', '.js', '.css', '.json', '.png', '.jpg', '.svg', '.woff2', '.txt', '.md']);

const rel = (p) => relative(ROOT, p).split('\\').join('/');
const files = new Map(); // repo-relative source -> preview-relative target
function add(src, target = src) {
  const ext = extname(target).toLowerCase();
  if (!ALLOWED.has(ext)) throw new Error(`not allowed in the preview: ${target}`);
  files.set(src, target);
}

// ------------------------------------------------------------------ index.html + import map
let html = await readFile(join(ROOT, 'index.html'), 'utf8');
const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!mapMatch) throw new Error('index.html has no import map');
const importMap = JSON.parse(mapMatch[1]).imports;

// resolve a module specifier the way the browser does (import map, then relative URLs)
function resolveSpec(spec, fromFile) {
  for (const [key, target] of Object.entries(importMap)) {
    if (key.endsWith('/') ? spec.startsWith(key) : spec === key) {
      return posix.normalize(posix.join(target.replace(/^\.\//, ''), spec.slice(key.length)));
    }
  }
  if (spec.startsWith('./') || spec.startsWith('../')) return posix.normalize(posix.join(posix.dirname(fromFile), spec));
  throw new Error(`cannot resolve "${spec}" from ${fromFile}`);
}

// ------------------------------------------------------------------ JS import graph
const IMPORT_RE = /(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
async function walk(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  if (file.startsWith('vendor/three/build/')) return seen; // the three.js bundle imports nothing
  const src = await readFile(join(ROOT, file), 'utf8');
  // strip comments so examples in comments are not followed (line comments first: they may
  // contain "/*", e.g. "assets/models/*.glb")
  const code = src.replace(/(^|\s)\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of code.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2];
    await walk(resolveSpec(spec, file), seen);
  }
  return seen;
}
const modules = await walk('js/main.js');
for (const m of modules) add(m);

// ------------------------------------------------------------------ CSS + fonts it uses
add('css/app.css');
const css = await readFile(join(ROOT, 'css/app.css'), 'utf8');
for (const m of css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) {
  if (/^(data:|https?:)/.test(m[1])) continue;
  add(posix.normalize(posix.join('css', m[1])));
}
for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g)) add(m[1]);

// ------------------------------------------------------------------ licences and docs
add('assets/fonts/OFL.txt');
add('assets/fonts/README.md');
add('assets/LICENSE-KayKit.txt');
add('vendor/three/LICENSE', 'vendor/three/LICENSE.txt');
add('LICENSES.md');
add('README.md');

// ------------------------------------------------------------------ write
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
let bytes = 0;
for (const [src, target] of files) {
  const to = join(OUT, target);
  await mkdir(dirname(to), { recursive: true });
  await copyFile(join(ROOT, src), to);
  bytes += (await stat(to)).size;
}

// models -> js/embed/<name>.js
const modelDir = join(ROOT, 'assets/models');
const glbs = (await readdir(modelDir)).filter((f) => f.endsWith('.glb')).sort();
const embedTags = [];
await mkdir(join(OUT, 'js/embed'), { recursive: true });
for (const f of glbs) {
  const name = f.slice(0, -4);
  const b64 = (await readFile(join(modelDir, f))).toString('base64');
  const js = `// ${f} (KayKit, CC0, see assets/LICENSE-KayKit.txt) as base64 for js/scene/assets.js\n` +
    `(window.__EMBED || (window.__EMBED = {}))[${JSON.stringify(name)}] = ${JSON.stringify(b64)};\n`;
  await writeFile(join(OUT, 'js/embed', name + '.js'), js);
  bytes += Buffer.byteLength(js);
  embedTags.push(`<script type="module" src="js/embed/${name}.js"></script>`);
}

// index.html: the embed modules run before main.js (module scripts run in document order)
const mainTag = '<script type="module" src="js/main.js"></script>';
if (!html.includes(mainTag)) throw new Error('index.html: main.js script tag not found');
html = html.replace(mainTag, embedTags.join('\n') + '\n' + mainTag);
await writeFile(join(OUT, 'index.html'), html);
bytes += Buffer.byteLength(html);

// ------------------------------------------------------------------ check the result
const bad = [];
async function check(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await check(p);
    else if (!ALLOWED.has(extname(e.name).toLowerCase())) bad.push(relative(OUT, p));
  }
}
await check(OUT);
if (bad.length) throw new Error('files with other extensions: ' + bad.join(', '));
console.log(`preview: ${files.size + glbs.length + 1} files, ${(bytes / 1048576).toFixed(2)} MB (${glbs.length} models embedded) -> ${OUT}`);
