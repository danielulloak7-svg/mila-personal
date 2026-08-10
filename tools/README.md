# Comprobación de alérgenos — mila-personal

Guard que corre en tu PC. Sin dependencias, sin red, solo Node.

## Cómo se usa

Doble clic en **`run-checks.bat`**, o desde una terminal en `mila-personal`:

```
node tools/check-allergens.mjs
```

Sale con código 0 si todo está bien y 1 si hay fallos, así que sirve para encadenarlo
en `publish.bat` antes de publicar.

Cuando apruebes un cambio de alérgenos y quieras fijar la nueva línea base:

```
node tools/check-allergens.mjs --snapshot
```

## Qué comprueba

1. **Los cinco datasets cargan y no tienen huecos.** Una coma doble en un array de JS
   crea un elemento `undefined` que rompe el render. Pasó el 2026-08-10 y el conteo
   por expresiones regulares no lo vio: solo aparece parseando de verdad.
2. **Allium es el paraguas.** Ningún plato con ajo o cebolla puede quedarse sin `Allium`.
   Antes de aplicar esta regla, 20 platos lo incumplían y un huésped que filtrara por
   allium no los veía.
3. **Toda ausencia verificada publica su procedencia.** `__absentLine()` solo pinta la
   línea si hay `verifiedBy` + `date` + `source`. Sin los tres, el dato queda mudo:
   parece verificado en el JSON y no le llega a nadie. También comprueba que
   `absentVerified` y `allergenState` digan lo mismo.
4. **Vocabulario completo.** Los 23 términos en cada `allergenState`.
5. **Nada se borró desde el último estado aprobado.** Compara contra
   `data/allergen-snapshot.json`. Cualquier `present` que baje, o cualquier ausencia
   verificada que se pierda, es un fallo — salvo que esté registrada en
   `data/revocations.json`.

## Por qué existe `revocations.json`

Una ausencia verificada por un humano **sí** se puede revocar, pero solo por decisión
humana explícita y dejando escrito qué la sustituye. Nunca por sobrescritura silenciosa
de un ingestor. El 2026-08-10 pasó dos veces: el Salmon Crispy Rice y la pasta de trufa
estaban firmados como «libre de huevo» el 2026-07-21, y la hoja del POS del 2026-08-09
lista huevo en ambos. Dani decidió que gana el POS. Quedan ahí registradas.

Si el guard marca una revocación que tú sí autorizaste, **no lo silencies**: añádela al
archivo. Ese es el punto.

## La sonda se prueba a sí misma

Verificado el 2026-08-10 contra un archivo roto a propósito: inyectando tres defectos
(quitar Allium de un plato con ajo, degradar un `present` a `unknown`, y romper la
procedencia de una ausencia verificada) el checker los encuentra los cuatro. Una sonda
que sale limpia sin haber demostrado que encuentra el defecto no prueba nada.

## `check-forms.mjs` — que cada bebida reciba SU formulario

```
node tools/check-forms.mjs
```

Necesita Playwright (`npm i -D playwright` y `npx playwright install chromium`). Si no
está instalado, **se salta solo** y no rompe nada: la comprobación de alérgenos no
depende de él.

Abre el editor de seis ítems reales y comprueba que cada uno recibe el formulario que
le toca: una botella y un vino por copa el de vino, un sake y una cerveza el suyo, un
cóctel y un plato el de comida.

Existe porque el 2026-08-10 los **sakes heredaban el formulario de vino** —a un Junmai
Ginjo le pedía Cuvée, Appellation y Uvas— y las **cervezas el de comida**, que le pedía
Ingredientes y Guarnición a una Sapporo. Era el mismo defecto de los BTG, un nivel más
abajo. Este check es lo que impide que vuelva.

## Trampa aprendida: `__mergeOv` es una lista blanca

El overlay de ediciones **no** se mezcla campo a campo automáticamente: `__mergeOv`
copia una lista explícita de campos. Un campo nuevo del editor que no esté en esa lista
se guarda y se ignora en silencio al leerlo de vuelta.

Pasó exactamente eso con `grade` y `seimai` la primera vez: el formulario se veía
perfecto, el toast decía «Changes saved», y el dato no volvía. **Si añades un campo al
editor, añádelo también a `__mergeOv`.** La prueba que lo caza es un ida y vuelta:
escribir, guardar, releer.

## Rotación de BTG (p112)

Cuando un vino por copa sale y entra otro, se hace en **una sola acción**, no en dos ediciones sueltas
— así fue como el Lavico siguió apareciendo semanas después de dejar de servirse.

```js
window.__rotateBTG({
  outId: "drink.duca-di-salaparuta-lavico-etna-bianco",
  outReason: "Se acabó",
  incoming: { name:"Livio Felluga Friulano", vintage:"2023", price:"19",
              producer:"Livio Felluga", appellation:"Colli Orientali del Friuli", sense:"WHITES" }
});
window.__quarantined();   // qué está esperando fuente
```

Se niega, con mensaje claro, si: no hay nadie firmado, falta el nombre, falta la añada, falta el
precio, el vino que sale no existe, o ya estaba fuera de carta. Probado contra los seis casos.

**El vino que entra nace en cuarentena.** Recibe solo lo que una persona leyó de la botella o de la
carta. Aroma, paladar, final, historia y maridajes quedan **vacíos a propósito** y el registro va
marcado. No es que falte el dato: es que inventarlo aquí es exactamente lo que esta app existe para
impedir. El enriquecimiento viene después y con fuente citada.

Los dos vinos quedan enlazados por un `rotationId`, pero se registran como **dos eventos separados**
— uno sale, otro entra — cada uno con su propia procedencia.

## Qué hay en `data/`

- `pos-extraction-2026-08-10.jsonl` — las 60 hojas del POS transcritas y verificadas a
  mano con visión. Es el conjunto de validación para el día que esto se automatice.
- `payload-alergenos-2026-08-10.json` — los valores aplicados, con procedencia por ítem.
- `revocations.json` — revocaciones autorizadas por Dani.
- `allergen-snapshot.json` — el último estado aprobado. Lo reescribe `--snapshot`.
