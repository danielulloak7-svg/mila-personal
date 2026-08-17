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
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP  = path.resolve(HERE, '..', 'index.html');
const DATA = path.join(HERE, 'data');
const SNAP = path.join(DATA, 'allergen-snapshot.json');
const REVS = path.join(DATA, 'revocations.json');
/* (p126) Un RENOMBRADO no es un borrado. Cuando 'Seafood' se pliega dentro de 'Fish',
   la advertencia no desaparece: cambia de etiqueta. El guardia de "nunca se quita un
   present" se queda intacto — lo que se agrega es la unica excepcion que puede
   demostrarse: el renombrado esta registrado con firma Y la etiqueta destino esta
   present AHORA. Si el destino no quedo marcado, sigue siendo un borrado y falla. */
const RENS = path.join(DATA, 'renames.json');

/* (p127) Un BORRADO autorizado es la unica salida que faltaba, y su vara es a proposito mas
   alta que la del renombrado: un renombrado conserva la advertencia bajo otra etiqueta, un
   borrado la apaga. Solo pasa si esta declarado en data/removals.json con firma humana,
   fecha, fuente y motivo. Sin entrada en el registro, un present que baja sigue siendo un
   FALLO, igual que antes. */
const RMVS = path.join(DATA, 'removals.json');

/* (p126) "Seafood" retirado del vocabulario: el POS lo usa y usa "fish" para lo mismo
   y nunca juntos, asi que se pliega dentro de Fish. Ver data/renames.json. */
const VOCAB = ["Gluten","Dairy","Egg","Fish","Shellfish","Soy","Sesame","Nuts","Peanut",
 "Allium","Garlic","Onion","Citrus","Spice","Pepper","Mustard","Alcohol","Caffeine","Mushroom",
 "Cilantro","Chili","Coconut","Mollusk"];
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
/* (p140) La capa de dieta es un OBJETO, no un array. Mismo recorte de llaves,
   misma regla: si no parsea, no se juzga en silencio - se falla arriba. */
function datasetObj(name){
  const m = h.match(new RegExp("(?:const|var|let)\\s+" + name + "\\s*=\\s*\\{"));
  if (!m) return null;
  const j = h.indexOf("{", m.index); let d = 0, k = j;
  for(;;){ const c = h[k]; if(c === "{") d++; else if(c === "}"){ d--; if(!d) break; } k++; }
  return eval("(" + h.slice(j, k + 1) + ")");
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
  const rens = fs.existsSync(RENS) ? JSON.parse(fs.readFileSync(RENS, 'utf8')) : [];
  const renMap = new Map(rens.map(r => [r.dish + "|" + r.from, r.to]));
  const rmvs = fs.existsSync(RMVS) ? JSON.parse(fs.readFileSync(RMVS, 'utf8')) : [];
  const rmvMap = new Map(rmvs
    .filter(r => r.removedBy && r.date && r.source && r.reason)
    .map(r => [r.dish + "|" + r.allergen, r]));
  const rmvBad = rmvs.filter(r => !(r.removedBy && r.date && r.source && r.reason));
  rmvBad.forEach(r => bad("removals.json: la entrada " + r.dish + " / " + r.allergen +
      " no lleva firma, fecha, fuente y motivo completos — no autoriza nada"));
  let removed = 0, auth = 0, renamed = 0, authRm = 0;
  for (const [id, o] of Object.entries(prev)){
    const n = now[id];
    if (!n){ bad("desaparecio el registro " + o.name); continue; }
    for (const [k, v] of Object.entries(o.state)){
      const nv = n.state[k];
      if (v === nv) continue;
      if (v === "present" && nv !== "present"){
        const to = renMap.get(id + "|" + k);
        if (to && n.state[to] === "present"){ renamed++; continue; }
        if (to){
          bad(o.name + " · " + k + " se registro como renombrado a " + to +
              " pero " + to + " NO quedo present — eso es un borrado, no un renombrado");
          removed++; continue;
        }
        if (rmvMap.has(id + "|" + k)){ authRm++; continue; }
        bad(o.name + " · " + k + " bajo de present a " + nv + " — eso es quitar una marca de alergeno");
        removed++;
      } else if (v === "absent_verified" && nv !== "absent_verified"){
        if (allowed.has(id + "|" + k + "|" + nv)) auth++;
        else { bad(o.name + " · " + k + " perdio su ausencia verificada sin revocacion registrada"); removed++; }
      }
    }
  }
  if (!removed) okly("nada se quito ni se degrado"
      + (auth ? " (" + auth + " revocacion(es) autorizada(s))" : "")
      + (renamed ? " (" + renamed + " renombrado(s) autorizado(s), la advertencia sigue viva bajo la nueva etiqueta)" : "")
      + (authRm ? " (" + authRm + " borrado(s) autorizado(s) con firma, fuente y motivo en removals.json)" : ""));
}

/* 6 — el informe de fantasmas (p129) -------------------------------------------
   Dani, 2026-08-15: "no seas tan extremo infiriendo cosas que no son". Tenia razon y las
   banderas de gluten en las carnes eran mias: salieron de leer el nombre de una salsa y
   suponer que llevaba. En MILA existen versiones sin gluten de las salsas justo para que
   los platos no lo lleven, asi que la inferencia no solo no tenia fuente: iba al reves.

   La regla es: una alergia se marca cuando ESTA DICHA — por la fila del POS de ese plato, o
   porque los componentes del propio plato nombran el alergeno (mushroom, enoki, tobiko). El
   nombre de una salsa no es una afirmacion sobre su contenido.

   Esto NO falla el run y a proposito: una bandera sin respaldo escrito no es lo mismo que
   una bandera equivocada (el tiramisu lleva gluten aunque nadie lo haya escrito). Lo que
   hace es CONTAR, en cada corrida, cuantas banderas no tienen fuente en ninguno de los dos
   lados — para que el numero se pueda bajar en vez de crecer callado. */
/* (p132) El diccionario de abajo se amplio despues de que este informe llamara "fantasma" a
   dos hechos que SI estaban escritos: el Coconut del Hamachi Crudo (sus componentes dicen
   "Coconut Avocado Coulis") y el Alcohol del Yuzu Moon ("Mint Cachaca Granite"). El detector
   no conocia la palabra cachaca. Un detector que inventa preguntas gasta justo la atencion
   que este sistema existe para proteger. */
console.log("\n6. informe de fantasmas (banderas sin fuente escrita)");
{
  const POSF = path.join(DATA, 'pos-extraction-2026-08-10.jsonl');
  const MAPF = path.join(DATA, 'pos-map.json');
  if (!fs.existsSync(POSF) || !fs.existsSync(MAPF)){
    warn("falta el POS o el mapa POS->plato: no puedo contar fantasmas");
  } else {
    const posRows = fs.readFileSync(POSF,'utf8').split("\n").filter(Boolean).map(l => JSON.parse(l));
    const posBy = new Map(posRows.map(r => [r.pos, r]));
    const map = JSON.parse(fs.readFileSync(MAPF,'utf8'));
    const inv = new Map(Object.entries(map).filter(([k,v]) => !String(v).startsWith('?')).map(([k,v]) => [v,k]));
    const T = {sesame:['Sesame'],spice:['Spice'],citrus:['Citrus'],soy:['Soy'],
      'garlic (allium)':['Garlic','Allium'],garlic:['Garlic','Allium'],allium:['Allium'],
      onion:['Onion','Allium'],gluten:['Gluten'],dairy:['Dairy'],egg:['Egg'],eggs:['Egg'],
      alcohol:['Alcohol'],seafood:['Fish'],fish:['Fish'],shellfish:['Shellfish'],
      mollusk:['Mollusk'],mushroom:['Mushroom'],mustard:['Mustard'],chili:['Chili','Spice'],
      nut:['Nuts'],nuts:['Nuts'],coconut:['Coconut']};
    const LIT = {Gluten:['gluten','wheat','flour','bread','panko','tempura','cracker','brioche','pasta','spaghetti','noodle','soy sauce','furikake','wafu','arare','teriyaki','eel sauce','wasabi','chimichurri','cookie','biscuit','crumble','opaline','wafer'],
      Dairy:['milk','cream','butter','cheese','yoghurt','yogurt','burrata','parmesan','mascarpone','ricotta','panna cotta','gelato','ice cream','creamy','curd','sorbet'],
      Egg:['egg','mayo','mayonnaise','aioli','meringue','tiramis','custard'],
      Fish:['fish','salmon','tuna','hamachi','madai','seabass','sea bass','cod','branzino','sole','anchovy','bonito','katsuobushi','tobiko','caviar','roe','toro'],
      Shellfish:['shrimp','prawn','crab','lobster','langoustine'],
      Mollusk:['octopus','squid','scallop','clam','mussel','oyster'],
      Soy:['soy','tamari','miso','ponzu','edamame','tofu'],Sesame:['sesame','tahini','goma','furikake'],
      Nuts:['almond','hazelnut','pistachio','cashew','walnut','pecan','macadamia','praline','nut'],
      'Tree Nut':['almond','hazelnut','pistachio','cashew','walnut','pecan','macadamia','nut'],
      Peanut:['peanut'],Garlic:['garlic'],Onion:['onion','shallot','scallion','leek'],
      Allium:['garlic','onion','shallot','scallion','leek','chive'],
      Citrus:['citrus','yuzu','lemon','lime','orange','sudachi','kabosu','ponzu'],
      Mustard:['mustard','karashi','dijon'],
      Alcohol:['sake','mirin','wine','rum','vodka','whisk','tequila','champagne','marsala','vermouth','liqueur','beer','cachaca','cachaça','granite','granité','gin','soju','shochu','amaretto','kirsch'],
      Mushroom:['mushroom','fungi','shiitake','enoki','maitake','truffle','porcini'],
      Cilantro:['coriander','cilantro'],
      Chili:['chili','chilli','jalape','serrano','gochujan','harissa','sriracha','togarashi'],
      Coconut:['coconut'],Caffeine:['coffee','espresso','matcha','tea','cacao','chocolate'],
      Spice:['spice','pepper','chili','wasabi','togarashi','harissa','espelette','peppercorn','tobanjan','kosho'],
      Pepper:['pepper','peppercorn','piquillo','espelette']};
    let ghosts = 0; const byA = {};
    for (const r of (SETS.FOOD || [])){
      const pn = inv.get(r.id);
      const row = pn ? posBy.get(pn) : null;
      const posSet = new Set();
      if (row) for (const t of row.list) for (const c of (T[String(t).toLowerCase()] || [])) posSet.add(c);
      const blob = [r.name, ...(r.ingredients||[]), ...(r.sauces||[]), ...(r.garnish||[]), r.tableside||'']
        .join(' ').toLowerCase();
      for (const a of (r.allerg || [])){
        if (row && posSet.has(String(a))) continue;
        if ((LIT[String(a)] || []).some(w => blob.includes(w))) continue;
        ghosts++; byA[a] = (byA[a] || 0) + 1;
      }
    }
    const top = Object.entries(byA).sort((x,y) => y[1]-x[1]).slice(0,6)
      .map(([a,n]) => a + " " + n).join(", ");
    if (ghosts) warn(ghosts + " bandera(s) sin fuente escrita ni en el POS ni en los componentes"
        + (top ? " — las mas frecuentes: " + top : "")
        + ". No son necesariamente falsas; son las que no pueden citarse.");
    else okly("toda bandera viva se puede citar contra el POS o contra los componentes del plato");
  }
}

/* 7 - las marcas de dieta del manual (p140) -----------------------------------
   Esta seccion NO juzga el SIGNIFICADO de una marca. Dani fijo la regla el
   2026-08-16: un titulo GF y una bandera de Gluten NO se contradicen, porque en
   MILA el GF puede querer decir "el gluten sale a peticion". Prohibir esa pareja
   habria borrado informacion verdadera. Lo que si se comprueba es la CADENA:
   que cada marca publicada venga del registro, que el registro venga del PDF
   fijado por sha256, y que cada override firmado este realmente aplicado. */
console.log("\n7. marcas de dieta del manual (GF / V)");
{
  const REGF = path.join(DATA, 'diet-badges.json');
  const PDF  = path.join(DATA, 'MILA_3F_FOOD_MANUAL_08.03.26.pdf');
  let live = null; try { live = datasetObj('DIET'); } catch(e){ bad("DIET no parsea: " + e.message); }
  if (!fs.existsSync(REGF)){
    if (live && Object.keys(live).length) bad("la app publica marcas de dieta y no existe tools/data/diet-badges.json");
    else okly("no hay capa de dieta y no hay registro: coherente");
  } else {
    const reg = JSON.parse(fs.readFileSync(REGF,'utf8'));
    if (fs.existsSync(PDF)){
      const sha = crypto.createHash('sha256').update(fs.readFileSync(PDF)).digest('hex');
      if (sha !== reg.source.sha256) bad("el PDF del manual ya no coincide con el sha256 del registro - reextraer antes de confiar en una sola marca");
      else okly("la fuente sigue fijada: " + reg.source.sha256.slice(0,12) + "...");
    } else warn("no encuentro el PDF del manual aqui: el sha256 del registro no se puede reverificar en esta maquina");

    const byDish = new Map(reg.badges.map(b => [b.dish, b]));
    const dropped = new Map();
    for (const o of (reg.overrides||[])) dropped.set(o.dish + "|" + String(o.drop).toUpperCase(), o);
    const ids = new Set((SETS.FOOD||[]).map(r => r.id));
    let problems = 0, published = 0;
    const flag = (m) => { bad(m); problems++; };
    for (const [id, m] of Object.entries(live || {})){
      if (!ids.has(id)){ flag("DIET publica " + id + " y ese plato no existe en FOOD"); continue; }
      const b = byDish.get(id);
      if (!b){ flag("DIET publica " + id + " y el registro no lo trae"); continue; }
      if (m.p !== b.page || m.t !== b.title) flag(id + ": la pagina o el titulo publicados no son los del registro");
      if (m.gf && !b.gf) flag(id + ": publica GF y el registro no lo trae");
      if (m.v  && !b.v ) flag(id + ": publica V y el registro no lo trae");
      if (m.gf && dropped.has(id + "|GF")) flag(id + ": hay un override firmado que retira GF y la app lo sigue publicando");
      if (m.v  && dropped.has(id + "|V") ) flag(id + ": hay un override firmado que retira V y la app lo sigue publicando");
      published += (m.gf?1:0) + (m.v?1:0);
    }
    for (const o of (reg.overrides||[])){
      if (!o.by || !o.date || !o.source || !o.reason)
        flag("override sobre " + o.dish + " sin firma, fecha, fuente o motivo - no vale");
    }
    if (!problems)
      okly(published + " marca(s) publicada(s), todas con pagina y titulo del registro; " +
           (reg.overrides||[]).length + " override(s) firmado(s) y aplicado(s)");
    const foodById = new Map((SETS.FOOD||[]).map(r => [r.id, r]));
    const pairs = Object.entries(live || {}).filter(([id,m]) => {
      const r = foodById.get(id); if (!r || !m.gf) return false;
      return (r.allergenState && r.allergenState.Gluten === 'present') || (r.allerg||[]).includes('Gluten');
    }).map(([id]) => (foodById.get(id)||{}).name);
    if (pairs.length) okly(pairs.length + " plato(s) con GF impreso y Gluten en ficha - se muestran los dos, en ambar: " + pairs.join(", "));
  }
}

console.log("\n" + "-".repeat(58));
console.log(fails ? "RESULTADO: " + fails + " fallo(s)" + (warns ? ", " + warns + " aviso(s)" : "")
                  : "RESULTADO: todo en orden" + (warns ? " (" + warns + " aviso(s))" : ""));
console.log("-".repeat(58) + "\n");
process.exit(fails ? 1 : 0);
