#!/usr/bin/env node
/* MILA · allergen invariant checker — mila-personal
   Runs on plain Node, no dependencies, no network. Lives on Dani's machine so a
   container reset can never take it away again (2026-08-08, 2026-08-10).

   Usage:   node tools/check-allergens.mjs            -> run every check
            node tools/check-allergens.mjs --snapshot -> re-baseline after an approved change

   The snapshot is what makes "no silent allergen removal" enforceable across sessions:
   every run compares today's file against the last approved state, and any removal or
   downgrade that is not listed in data/revocations.json fails the run.                    */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP  = path.resolve(HERE, '..', 'index.html');
const DATA = path.join(HERE, 'data');
const SNAP = path.join(DATA, 'allergen-snapshot.json');
const REVS = path.join(DATA, 'revocations.json');

const VOCAB = ["Gluten","Dairy","Egg","Seafood","Fish","Shellfish","Soy","Sesame","Nuts","Peanut",
 "Allium","Garlic","Onion","Citrus","Spice","Mustard","Alcohol","Caffeine","Mushroom","Coriander",
 "Chili","Coconut","Mollusk"];
const CHILDREN = ["Garlic","Onion"];      // Allium is the umbrella (Dani, 2026-08-10)

let fails = 0, warns = 0;
const bad  = (m) => { fails++; console.log("  FALLO   " + m); };
const warn = (m) => { warns++; console.log("  aviso   " + m); };
const okly = (m) => console.log("  ok      " + m);

if (!fs.existsSync(APP)) { console.log("No encuentro index.html en " + APP); process.exit(2); }
const h = fs.readFileSync(APP, 'utf8');

function dataset(name){
  const m = h.match(new RegExp("(?:const|var|let)\\s+" + name + "\\s*=\\s*\\["));
  if (!m) return null;
  const j = h.indexOf("[", m.index); let d = 0, k = j;
  for(;;){ const c = h[k]; if(c === "[") d++; else if(c === "]"){ d--; if(!d) break; } k++; }
  return eval(h.slice(j, k + 1));
}

console.log("\nMILA · comprobacion de alergenos");
console.log("archivo: " + APP + "\n");

/* 1 — los datasets cargan y no tienen huecos ------------------------------- */
console.log("1. datasets");
const SETS = {};
for (const n of ["FOOD","BEV","WINE","SPIRITS","GLOSS"]){
  let a; try { a = dataset(n); } catch(e){ bad(n + " no parsea: " + e.message); continue; }
  if (!a){ bad(n + " no encontrado"); continue; }
  SETS[n] = a;
  const holes = a.filter(x => x === undefined || x === null).length;
  if (holes) bad(n + " tiene " + holes + " hueco(s) en el array — una coma doble parte el render");
  else okly(n.padEnd(8) + a.length + " registros, sin huecos");
}
const items = [...(SETS.FOOD||[]), ...(SETS.BEV||[])].filter(Boolean);

/* 2 — Allium es paraguas ---------------------------------------------------- */
console.log("\n2. regla del paraguas Allium");
const noUmbrella = items.filter(x => x.allergenState &&
  CHILDREN.some(c => x.allergenState[c] === "present") && x.allergenState.Allium !== "present");
if (noUmbrella.length) noUmbrella.forEach(x => bad(x.name + " lleva ajo o cebolla y no lleva Allium"));
else okly("ningun plato con ajo o cebolla se queda sin Allium");

const contra = items.filter(x => x.allergenState &&
  x.allergenState.Allium === "absent_verified" && CHILDREN.some(c => x.allergenState[c] === "present"));
contra.forEach(x => bad(x.name + " declara Allium ausente-verificado con ajo o cebolla presente"));

/* 3 — toda ausencia verificada publica su procedencia ----------------------- */
console.log("\n3. procedencia de las ausencias verificadas");
let av = 0, mute = 0;
for (const x of items){
  for (const a of (x.absentVerified || [])){
    av++;
    const p = (x.allergenProvenance || {})[a];
    if (!p || !p.verifiedBy || !p.date || !p.source)
      bad(x.name + " · " + a + " es absent_verified sin procedencia completa — la app no lo publica y el dato queda mudo");
    if (x.allergenState && x.allergenState[a] !== "absent_verified")
      bad(x.name + " · " + a + " esta en absentVerified pero allergenState dice " + x.allergenState[a]);
  }
  for (const [k, v] of Object.entries(x.allergenState || {}))
    if (v === "absent_verified" && !(x.absentVerified || []).includes(k)){
      mute++;
      bad(x.name + " · " + k + " dice absent_verified pero no esta en absentVerified — no se publica");
    }
}
if (av && !mute) okly(av + " ausencias verificadas, todas con procedencia y coherentes");

/* 4 — vocabulario completo -------------------------------------------------- */
console.log("\n4. vocabulario (" + VOCAB.length + " terminos)");
const short = items.filter(x => x.allergenState && VOCAB.some(t => !(t in x.allergenState)));
if (short.length){
  short.slice(0,5).forEach(x => warn(x.name + " le faltan: " +
    VOCAB.filter(t => !(t in x.allergenState)).join(", ")));
  if (short.length > 5) warn("...y " + (short.length - 5) + " mas");
} else okly("todos los registros con estado llevan los " + VOCAB.length + " terminos");
const noState = items.filter(x => !x.allergenState);
if (noState.length) warn(noState.length + " registro(s) sin allergenState: " +
  noState.slice(0,4).map(x => x.name).join(", ") + (noState.length>4 ? "..." : ""));

/* 5 — nada se borro desde el ultimo estado aprobado ------------------------- */
console.log("\n5. comparacion contra el ultimo estado aprobado");
const now = {};
for (const x of items) if (x.allergenState) now[x.id] = { name: x.name, state: x.allergenState };

if (process.argv.includes("--snapshot")){
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(SNAP, JSON.stringify(now, null, 1));
  okly("snapshot reescrito con " + Object.keys(now).length + " registros");
} else if (!fs.existsSync(SNAP)){
  warn("no hay snapshot todavia — corre con --snapshot para fijar la linea base");
} else {
  const prev = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  const revs = fs.existsSync(REVS) ? JSON.parse(fs.readFileSync(REVS, 'utf8')) : [];
  const allowed = new Set(revs.map(r => r.dish + "|" + r.allergen + "|" + r.to));
  let removed = 0, auth = 0;
  for (const [id, o] of Object.entries(prev)){
    const n = now[id];
    if (!n){ bad("desaparecio el registro " + o.name); continue; }
    for (const [k, v] of Object.entries(o.state)){
      const nv = n.state[k];
      if (v === nv) continue;
      if (v === "present" && nv !== "present"){
        bad(o.name + " · " + k + " bajo de present a " + nv + " — eso es quitar una marca de alergeno");
        removed++;
      } else if (v === "absent_verified" && nv !== "absent_verified"){
        if (allowed.has(id + "|" + k + "|" + nv)) auth++;
        else { bad(o.name + " · " + k + " perdio su ausencia verificada sin revocacion registrada"); removed++; }
      }
    }
  }
  if (!removed) okly("nada se quito ni se degrado" + (auth ? " (" + auth + " revocacion(es) autorizada(s))" : ""));
}

console.log("\n" + "-".repeat(58));
console.log(fails ? "RESULTADO: " + fails + " fallo(s)" + (warns ? ", " + warns + " aviso(s)" : "")
                  : "RESULTADO: todo en orden" + (warns ? " (" + warns + " aviso(s))" : ""));
console.log("-".repeat(58) + "\n");
process.exit(fails ? 1 : 0);
