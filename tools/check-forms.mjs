/* MILA · comprobacion de formularios del editor — mila-personal
   Requiere Playwright (npm i -D playwright). Si no lo tienes instalado, este
   check se salta: el de alergenos NO depende de el.
   Prueba que cada tipo de item reciba SU formulario y no el de otro:
   una botella y un BTG el de vino, un sake y una cerveza el suyo, un coctel
   y un plato el de comida. Ese cruce fue el defecto que Dani reporto el
   2026-08-10: los sakes heredaban el formulario de vino (les pedia Cuvee y
   Uvas) y las cervezas el de comida (les pedia Ingredientes y Guarnicion). */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const APP='file://'+path.resolve(HERE,'..','index.html');
let chromium;
try{ ({chromium}=await import('playwright')); }
catch(e){
  console.log("\ncheck-forms: Playwright no esta instalado, me salto esta comprobacion.");
  console.log("Para activarla:  npm i -D playwright   y luego  npx playwright install chromium");
  console.log("La comprobacion de alergenos NO depende de esta y sigue funcionando.\n");
  process.exit(0);
}
let b;
try{ b=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}); }
catch(e){
  console.log("\ncheck-forms: Playwright esta instalado pero no encuentra un navegador.");
  console.log("Arreglalo con:  npx playwright install chromium");
  console.log("O apunta a un Chrome que ya tengas:  set CHROME_PATH=C:\\...\\chrome.exe");
  console.log("La comprobacion de alergenos NO depende de esta.\n");
  process.exit(0);
}
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(APP,{waitUntil:'load'});await p.waitForTimeout(1500);
const CASES=[
 ["drink.serenello-extra-dry-prosecco","BTG vino",       {wf:true,  bf:false, food:false}],
 ["wine.billecart-salmon-louis-salmon-2013-750","botella",{wf:true,  bf:false, food:false}],
 ["drink.jade-reverie","coctel",                          {wf:false, bf:false, food:true }],
 ["dish.oysters","plato",                                 {wf:false, bf:false, food:true }],
 ["drink.amabuki-himawarai-ginjo","sake",                 {wf:false, bf:true,  food:false}],
 ["drink.sapporo","cerveza",                              {wf:false, bf:true,  food:false}],
];
let fails=0;
for(const [id,label,exp] of CASES){
  const r=await p.evaluate((id)=>{
    try{window.__openEditor(id);}catch(e){return{err:String(e)};}
    const b=document.getElementById('edBody');if(!b)return{err:'no edBody'};
    return {wf:b.querySelectorAll('[data-wf]').length,bf:b.querySelectorAll('[data-bf]').length,
            food:b.querySelectorAll('[data-add]').length};
  },id);
  if(r.err){console.log("FALLO",label,r.err);fails++;continue;}
  const got={wf:r.wf>0,bf:r.bf>0,food:r.food>0};
  const ok=got.wf===exp.wf&&got.bf===exp.bf&&got.food===exp.food;
  if(!ok)fails++;
  console.log((ok?"ok    ":"FALLO ")+label.padEnd(9)+
    " vino:"+(got.wf?"si":"no")+" bev:"+(got.bf?"si":"no")+" comida:"+(got.food?"si":"no")+
    (ok?"":"   <-- esperaba vino:"+(exp.wf?"si":"no")+" bev:"+(exp.bf?"si":"no")+" comida:"+(exp.food?"si":"no")));
}
console.log("\nerrores JS:",errs.length);
console.log(fails?fails+" FALLO(S)":"los 6 formularios correctos");
await b.close();process.exit(fails?1:0);
