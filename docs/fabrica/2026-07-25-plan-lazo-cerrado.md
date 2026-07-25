# Plan v1.0 — La fábrica que se mide a sí misma

Fecha: 2026-07-25. Estado del repo al escribirlo: v0.5.2, 33 skills,
19 módulos de núcleo, tier 1 en verde, tier 2 recién construido.

Este plan **reemplaza** la idea inicial de "4 frentes paralelos" (tier 2,
marcos, telemetría, onboarding). Esos cuatro no estaban mal, pero estaban
ordenados por entusiasmo, no por dependencia. Tres de ellos exigen saber
algo que hoy no sabemos.

## El diagnóstico honesto

### 1. El benchmark no prueba lo que dice probar

`docs/BENCHMARK-GSTACK.md` publica repofibe 94.8 / gstack 53.4. Pero
repofibe diseñó las 20 tareas, escribió el arnés, eligió las dimensiones y
juzgó con su propio `juez.mjs`. Un evaluador externo escéptico descarta esa
cifra completa en diez segundos, y tendría razón. No es fraude — el arnés
es real y el trabajo de construirlo fue serio — pero **una prueba que
diseña el examinado sobre sí mismo mide el arnés, no la superioridad.**

Mientras esa cifra se presente sin ese matiz, es un pasivo: la primera
persona técnica que la audite pierde confianza en todo lo demás del repo,
incluyendo lo que sí está sólidamente demostrado (que es mucho).

### 2. La fábrica no tiene instrumentos sobre sí misma

`nucleo/traza.mjs` está escrito, diseñado con cuidado (AsyncLocalStorage,
flush de emergencia, esquema minificado) y **no está conectado a nada**.
Consecuencia directa: no existe un solo dato real sobre

- qué skills se invocan y cuáles nunca,
- cuáles fallan o se abandonan a medias,
- cuánto contexto consume cada una,
- dónde está la latencia.

Todo lo que decidamos priorizar sin eso es opinión. Mi propio "auditemos
las 10 skills más usadas" tuvo que empezar con *"o asume: legal, qa,
revisar..."* — es decir, inventar la lista que justifica el trabajo. Ese
es exactamente el modo de fallo que este repo dice combatir.

### 3. El techo de 12000 caracteres es un síntoma, no un límite

Varias skills se acercan al tope (`legal` a 11946/12000). La lectura fácil
es "hay que comprimir". La lectura correcta la da la propia ARQUITECTURA.md:
toda regla debe vivir en la clase de garantía más fuerte que pueda pagarse
(1 determinista, 2 estructural, 3 prompt). **Una skill que crece sin parar
es una skill acumulando reglas en clase 3 que pertenecen a clase 1 o 2.**
Comprimir texto alivia el síntoma y deja la regla frágil donde estaba.

### 4. Lo que sí es un activo real y diferenciado

- La jerarquía de clases de garantía. Es la mejor idea del repo.
- El núcleo ejecutable con evals que **ejecutan** (no lint): varios bugs
  reales fueron encontrados por sus propias evals antes de shipear, y está
  documentado caso por caso. Eso es cultura de ingeniería, no marketing.
- Cero-deps / Node puro: portabilidad real, sin build step ni binario.
- El marco de honestidad de `/legal`: prohibición de inventar artículos,
  cifras y vigencias, con verificación obligatoria en fuente oficial.

## La tesis

> repofibe no necesita más skills. Necesita **cerrar el lazo**: que la
> producción de la fábrica se convierta en evidencia que dirige la mejora
> de la fábrica.

Hoy el ciclo está roto en el punto de retorno:

```
skills → trabajo → (nada) → decisiones por intuición → más skills
```

El lazo cerrado:

```
skills → trabajo → traza (clase 2: evidencia en disco)
                      ↓
                   /retro lee traza + evals
                      ↓
              qué falla / qué no se usa / qué cuesta
                      ↓
        promover reglas frágiles de clase 3 → clase 1/2
                      ↓
                 eval que lo fija en rojo
                      ↓
                   skills mejores
```

Lo notable: **todas las piezas ya existen y están desconectadas.**
`traza.mjs` escrito sin usar, `memoria.mjs` viva pero sin alimentarse de
resultados, `juez.mjs` manual, tier 2 recién nacido, `/retro` existiendo
como skill de reflexión sin datos que reflexionar. No hay que construir un
sistema nuevo: hay que conectar el que ya está.

## Fases (en orden de dependencia, no de entusiasmo)

### Fase 0 — Honestidad del benchmark

**Por qué primero:** cuesta una hora y es el único ítem que, sin hacerlo,
degrada la credibilidad de todo lo demás que construyamos encima.

- Encabezar `docs/BENCHMARK-GSTACK.md` declarando que es un arnés
  **auto-administrado**: repofibe diseñó tareas, arnés y juez.
- Separar explícitamente lo medido de forma objetiva (Peak RSS, latencia,
  tokens — instrumentos, no opiniones) de lo puntuado por juez propio.
- Enunciar qué haría falta para una comparación defendible: tareas de un
  tercero, o al menos juez ciego con rúbrica publicada de antemano.
- En `PLAN-SUPERACION.md`, bajar "superioridad demostrada" a lo que la
  evidencia aguanta.

**Hecho cuando:** un lector técnico hostil puede leer el benchmark completo
sin encontrar una afirmación que no sostenga.

### Fase 1 — Conectar la traza (el sensor)

Sin esto no hay Fase 2, y sin Fase 2 las fases 3-5 vuelven a ser adivinanza.

- Cablear `traza.mjs` donde de verdad pasa algo: `hooks/sesion.mjs` (qué
  skill se activa), `hooks/guardia.mjs` (qué se bloqueó), y los módulos de
  núcleo con costo real (`instalar`, `sync`, `memoria`, `navegador`,
  `qaonline`).
- Salida: `.fabrica/traza.jsonl` — clase 2, append-only, versionable, ya
  con driver de merge propio para JSONL.
- Local y del usuario. **Cero telemetría remota, nunca por defecto** — ya
  es decisión explícita de ARQUITECTURA.md y no se toca.
- Fail-open estricto: si la traza falla, la sesión del usuario no se
  entera. Mismo criterio que los hooks.
- Lectura: `node nucleo/traza.mjs ver` — tabla de las últimas N.

**Hecho cuando:** después de un día de uso normal existe un `traza.jsonl`
con datos reales, y romper la traza a propósito no rompe ninguna sesión.

### Fase 2 — El lazo: `/retro` con evidencia

Convertir `/retro` de reflexión narrada en informe con datos.

- Leer `traza.jsonl` + resultados de evals + estado de sprint.
- Responder con números, no con impresiones: skills nunca invocadas,
  skills que fallan o se abandonan, las más lentas, las más caras en
  contexto, guardias que se dispararon.
- Cerrar con una recomendación priorizada: **qué regla de clase 3 conviene
  promover a clase 1/2 esta semana, y por qué lo dice el dato.**

**Hecho cuando:** una corrida de `/retro` produce una lista de trabajo que
nadie habría adivinado sin los datos.

### Fase 3 — Democión sistemática de clase 3 → clase 1/2

Ya con evidencia, y solo entonces.

- Por cada regla frágil que la Fase 2 señale: convertirla en código
  (hook, validación, esquema) + eval que la fije en rojo.
- El límite de 12000 caracteres deja de ser una pelea de compresión: las
  skills adelgazan porque **sus reglas se fueron a donde se cumplen
  siempre**, no porque el texto se apretó.
- Aquí, y solo aquí, entran los "marcos reutilizables" en `plantillas/`:
  sobre bloques que el dato demuestre duplicados **y** usados. Con una
  excepción marcada desde ya: **el marco de honestidad de `/legal` no se
  colapsa en un marco genérico** — es más estricto que el resto por
  decisión del usuario (cero adivinanza de artículos, cifras y vigencias)
  y perder ese matiz para ahorrar caracteres es un mal negocio.

**Hecho cuando:** al menos 3 reglas que antes dependían de que el modelo
las siguiera ahora se cumplen siempre, con eval que lo prueba.

### Fase 4 — Red de regresión de verdad (tier 2 y 3 en serio)

- Correr `evals/e2e/skills-criticas.mjs` (ya construido, Opus 5 como actor
  y juez) contra las skills que la Fase 2 marque como críticas **por uso
  real**, no por corazonada.
- Job manual con key, nunca CI: cuesta dinero por corrida y eso es
  explícito, no un descuido.
- Fijar en rojo cada fallo que aparezca, igual que se hizo con los bugs de
  `sync.mjs`, `pruebas.mjs` y `secretos.mjs`.

**Hecho cuando:** una regresión introducida a propósito en una skill
crítica es detectada por el tier 2 antes de publicar.

### Fase 5 — Capacidades nuevas

Deliberadamente al final. Con el lazo cerrado, una capacidad nueva se puede
**probar** que ayuda en vez de argumentar que ayuda. Candidatas, en orden
de evidencia disponible hoy:

- `/aprender` — onboarding del propio repo. Barata, independiente, y su
  valor sube cuando hay traza que enseñar.
- Daemon de navegador persistente — **solo si** la traza demuestra que el
  arranque de Chromium es el cuello de botella real. Ya está documentado
  como decisión pendiente de evidencia; ahora habrá evidencia.
- Memoria semántica alimentada por resultados, no solo por notas.

## Lo que este plan NO hace

- No añade dependencias. Node puro, cero-deps, sin build step.
- No manda telemetría a ningún lado. Los datos son del usuario y se quedan
  en `.fabrica/`.
- No comprime skills a ciegas.
- No construye el daemon de navegador por especulación.
- No inventa más skills antes de saber si las 33 actuales se usan.

## Cómo sabremos que funcionó

No por una cifra de benchmark propio. Por tres hechos verificables:

1. Existe un `traza.jsonl` con uso real y `/retro` produce hallazgos que
   nadie habría adivinado.
2. Al menos 3 reglas bajaron de clase 3 a clase 1/2, con eval en rojo que
   lo demuestra.
3. El benchmark publicado no contiene ninguna afirmación que no aguante a
   un auditor hostil.

## Bitácora

- 2026-07-25: plan escrito. Reemplaza el esquema de "4 frentes paralelos".
  Motivo del cambio: tres de los cuatro frentes dependían de datos de uso
  que no existen porque `traza.mjs` nunca se conectó — priorizar sin ellos
  era el mismo modo de fallo que este repo dice combatir. Se antepone la
  honestidad del benchmark porque es el único ítem cuyo aplazamiento
  degrada todo lo construido encima.
