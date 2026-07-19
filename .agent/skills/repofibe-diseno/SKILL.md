---
name: diseno
description: |
  Consultoría de diseño y frontend que RAZONA: entrevista al usuario, elige
  3-5 referentes del catálogo awesome-design-md (sin leerlo entero), y deriva
  un sistema de diseño propio desde el producto — tokens concretos, cero
  plantillas genéricas, cero AI slop. Úsala cuando el usuario diga "diseña la
  interfaz", "crea el sistema de diseño", "haz el frontend", "que se vea
  bien", "no quiero que se vea genérico". (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` = esa raíz.

# /diseno — Diseño y frontend con razonamiento

Regla cero: **el diseño se deriva del producto, no de una plantilla.** Las
fichas del catálogo calibran el nivel de calidad; copiarlas sería hacer un
clon. Cada decisión (fuente, paleta, densidad, movimiento) lleva un porqué
anclado a ESTE producto o no entra al sistema.

## Fase 1 — Entrevista (pregunta, no asumas)

Una pregunta por mensaje, formato RECOMENDACIÓN:

1. **¿Qué es el producto y quién lo usa?** (el sector decide los referentes)
2. **Personalidad en 3 adjetivos** — y el anti-adjetivo: ¿cómo NO debe
   sentirse? ("serio pero no frío", "juguetón pero no infantil")
3. **Referentes que admira** el usuario (si nombra marcas, van directo a la
   lista de lectura) y **qué odia** (va a las prohibiciones).
4. **Restricciones duras**: marca existente, accesibilidad, dark/light,
   framework CSS ya elegido.

## Fase 2 — Recuperación quirúrgica del catálogo

Localiza el catálogo (en orden): `.fabrica/diseno.json` → campo `catalogo`;
carpeta `awesome-design-md/` en el proyecto, su padre, o `~/Desktop`. Si lo
encuentras, guarda la ruta en `.fabrica/diseno.json` para la próxima vez.

**PROHIBIDO leer el catálogo entero** (~75 fichas). Método: elige 3-5 marcas
por sector y mood con este índice, y lee SOLO `design-md/<marca>/*.md` de
esas:

| Sector / mood | Referentes en el catálogo |
|---|---|
| Dev tools / técnico | linear.app, vercel, raycast, warp, cursor, supabase, stripe (docs) |
| IA | claude, cohere, mistral.ai, x.ai, elevenlabs, runwayml |
| Fintech / confianza | stripe, coinbase, revolut, wise, mastercard, kraken |
| Consumer / calidez | airbnb, spotify, notion, slack, starbucks, pinterest |
| Lujo / drama | ferrari, bugatti, lamborghini, bmw-m, nike, tesla, spacex |
| Editorial / contenido | theverge, wired, mintlify, sanity |
| Retro / nostalgia | dell-1996, nintendo-2001 |
| Productividad / densidad | superhuman, figma, miro, airtable, clickhouse, posthog |

De cada ficha leída extrae: qué hace distintiva a la marca, qué patrón
comparten los 3-5 referentes (eso es el estándar del sector), y en qué se
diferencian (ahí vive la personalidad). Si el catálogo no está, dilo y
trabaja con tu conocimiento — el método no cambia.

## Fase 3 — Derivar el sistema (razonar, no copiar)

Con entrevista + calibración, deriva y justifica cada token:

- **Tipografía**: display + body + mono concretas (con fuente de carga y
  pesos). El porqué conecta con los adjetivos — nunca "Inter porque sí".
- **Color**: base, superficie, primario, semánticos — hex exactos, contraste
  AA verificado, dark y light si aplica. El acento significa algo (¿qué
  señala cuando aparece?).
- **Espaciado y densidad**: unidad base, escala, y la decisión de densidad
  justificada por el caso de uso (dashboard ≠ landing).
- **Radios, sombras, bordes**: un sistema, no valores sueltos.
- **Movimiento**: qué se anima y por qué (comprensión, no decoración),
  easings y duraciones.
- **Voz de la interfaz**: microcopy en español, tono derivado del
  anti-adjetivo.

### Prohibiciones anti-slop (bloqueantes)

Gradiente morado/azul por defecto · Inter/Roboto sin justificación · emojis
como iconos · glassmorphism sin razón · sombras idénticas en todo ·
border-radius gigante uniforme · hero centrado con dos botones como único
recurso · texto que no dice nada ("Potencia tu productividad") · dark mode
como inversión automática. Si un borrador cae en una, se rehace esa pieza.

## Fase 4 — Entregar y cablear

1. Escribe `DISENO.md` en la raíz del proyecto: contexto del producto,
   dirección estética (con el porqué), todos los tokens, prohibiciones
   propias del proyecto, y tabla de decisiones con fecha y razón.
2. Si hay que construir UI ahora, sigue con `/construir` usando DISENO.md
   como contrato — y al maquetar aplica lectura quirúrgica del código
   existente (componentes ya hechos primero: Grep antes de crear).
3. `/plan-diseno` y `/qa` consumen DISENO.md automáticamente en sus
   auditorías.

```
node <RAIZ>/nucleo/estado.mjs registrar diseno "sistema derivado: <3 adjetivos> / referentes: <marcas>"
node <RAIZ>/nucleo/memoria.mjs agregar gusto "<preferencia estética que el usuario reveló en la entrevista>"
```
