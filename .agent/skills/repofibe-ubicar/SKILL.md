---
name: ubicar
description: |
  El sentido de orientación de la fábrica: localiza CUALQUIER cosa en un
  repo (función, componente, config, texto de UI, ruta, estilo) con el
  método de lectura quirúrgica — mapa estructural, hipótesis por convención,
  Grep dirigido, confirmación — sin leer archivos de más. Úsala cuando el
  usuario diga "¿dónde está X?", "ubica", "encuentra dónde se define",
  "¿qué archivo controla...?", o cuando otra skill necesite orientarse en
  un repo desconocido. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` = esa raíz.

# /ubicar — Saber dónde vive cada cosa

Encontrar algo en un repo NO es leer el repo: es una cadena de hipótesis
cada vez más baratas de verificar. Costo de cada paso: listar nombres ≈ 0,
Grep ≈ casi 0, leer un archivo = caro. Se avanza al paso caro solo con el
objetivo confirmado.

## El método, en orden

1. **Mapa primero.** Si no existe `.fabrica/mapa.json` o el commit cambió:
   `node <RAIZ>/nucleo/mapa.mjs generar`. Luego `mapa.mjs ver` te da la
   forma del proyecto en 30 líneas: qué directorios existen, cuántos
   archivos y de qué tipo, y dónde están los archivos clave (★ entradas,
   configs, README, DISENO.md).

2. **Hipótesis por nombre.** Lo buscado casi siempre está en un archivo cuyo
   nombre lo delata: `node <RAIZ>/nucleo/mapa.mjs buscar <término>`.
   Prueba variantes: en inglés y español, singular/plural, kebab/camel
   (`login`, `auth`, `sesion`, `sign-in`).

3. **Hipótesis por convención.** Si el nombre no lo encontró, razona dónde
   lo pondría el framework: rutas en `routes/`/`pages/`/`app/`; estilos
   junto al componente o en `styles/`; textos de UI en el componente o en
   `locales/`; config en la raíz; lógica de dominio en `lib/`/`services/`/
   `core/`. El mapa del paso 1 te dice cuáles de esas carpetas existen aquí.

4. **Grep dirigido, del más específico al más laxo.** Definición primero
   (`function X`, `class X`, `const X =`, `def X`), después usos (`X(`),
   después el texto visible si es UI (el string literal exacto que se ve en
   pantalla es el mejor ancla que existe). Restringe por tipo de archivo y
   por el directorio de la hipótesis 3.

5. **Confirmar leyendo SOLO el objetivo.** Abre el archivo (o el rango de
   líneas) que el Grep señaló. Si era el equivocado, vuelve al paso 3 con
   lo aprendido — cada fallo descarta una zona del mapa.

## Reglas del oficio

- **Responde con rutas exactas** `archivo:línea`, y distingue: dónde se
  DEFINE, dónde se USA, dónde se CONFIGURA. Son tres respuestas distintas.
- **Si vas a editar lo hallado**: ubica TODOS los call sites antes de tocar
  (Grep del símbolo en todo el repo) — cambiar la definición sin los usos
  es la fuente clásica de contratos rotos (cazador 3 de `/revisar`).
- **Dos búsquedas fallidas = cambia de estrategia**, no insistas con
  sinónimos: quizá está generado (build), inyectado (dependencia), o vive
  en otro repo. El mapa te dice si hay carpetas de código generado.
- **Registra el hallazgo no obvio**: si algo vive en un lugar sorprendente,
  `node <RAIZ>/nucleo/memoria.mjs agregar aprendizaje "X vive en <ruta> porque ___"`
  — la próxima búsqueda será instantánea.
