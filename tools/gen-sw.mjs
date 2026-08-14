#!/usr/bin/env node
/* MILA · regenerate sw.js's precache manifest FROM the shipped index.html.
 *
 * Why this exists (p117, finding F-2): the manifest was hand-maintained and had
 * drifted a whole build. 30 of the 65 photos index.html actually references were
 * missing from it, while 30 photos nothing references were downloaded on every
 * install — so for 70% of the photo bytes the worker was not doing the one job it
 * was written for, and the "scroll, blank, wait" symptom it was meant to kill was
 * still there on those records.
 *
 * A hand-kept list of derived facts drifts. This derives it, and refuses to write
 * a manifest that would ship a broken app.
 *
 *   node tools/gen-sw.mjs            check only — exit 1 if sw.js is out of date
 *   node tools/gen-sw.mjs --write    rewrite the ASSETS array in place
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const HTML = path.join(ROOT, 'index.html');
const SW   = path.join(ROOT, 'sw.js');
const IMG  = path.join(ROOT, 'assets', 'img');
const write = process.argv.includes('--write');

for (const f of [HTML, SW]) if (!fs.existsSync(f)) { console.error('missing ' + f); process.exit(2); }

const html = fs.readFileSync(HTML, 'utf8');
const refs = [...new Set([...html.matchAll(/assets\/img\/([0-9a-f]{16}\.[a-z0-9]+)/g)].map(m => m[1]))].sort();
const disk = new Set(fs.existsSync(IMG) ? fs.readdirSync(IMG) : []);

const missing = refs.filter(r => !disk.has(r));
if (missing.length) {
  console.error(`ABORT: index.html references ${missing.length} image(s) that are not in assets/img/:`);
  missing.forEach(m => console.error('  ' + m));
  console.error('Publishing this would put a broken app online.');
  process.exit(1);
}

const sw = fs.readFileSync(SW, 'utf8');
const m = sw.match(/var ASSETS = (\[[^;]+\]);/);
if (!m) { console.error('ABORT: could not find the ASSETS array in sw.js'); process.exit(2); }

const current = JSON.parse(m[1]).map(x => x.split('/').pop());
const want = refs;
const add = want.filter(x => !current.includes(x));
const drop = current.filter(x => !want.includes(x));
const orphans = [...disk].filter(f => !want.includes(f)).sort();

console.log(`index.html references ${want.length} image(s); sw.js lists ${current.length}`);
if (orphans.length) console.log(`note: ${orphans.length} file(s) in assets/img/ are referenced by nothing (safe to delete)`);

if (!add.length && !drop.length) { console.log('ok  sw.js manifest matches the shipped HTML'); process.exit(0); }

console.log(`${add.length} to add, ${drop.length} to drop`);
if (!write) { console.log('out of date — re-run with --write'); process.exit(1); }

const out = sw.slice(0, m.index) +
            'var ASSETS = ' + JSON.stringify(want.map(x => 'assets/img/' + x)) + ';' +
            sw.slice(m.index + m[0].length);
fs.writeFileSync(SW, out);
console.log('sw.js rewritten');
