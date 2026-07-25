# Plan: auditoría total en rondas hasta que no quede agujero conocido

Fecha: 2026-07-25. Estado: v0.6.0, rama `mejoras-v1.0`, 9 commits sin publicar.

## Por qué existe este plan

En una sola sesión se abrieron a fondo **cuatro** cosas y **las cuatro**
tenían problemas graves:

| Se abrió | Qué se encontró |
|---|---|
| `benchmark-gstack.mjs` | Cifras fabricadas con `Math.random()`, publicadas como medición empírica |
| La instalación real | Los hooks —la ventaja central del proyecto— llevaban versiones apagados |
| Los despachadores de evals | Una eval borrada desaparecía en silencio; los timeouts daban mensaje vacío; tier 2 contaba omitidas como aprobadas |
| `/legal` | 100% prompt: ninguna garantía en código, y la eval solo validaba el texto de la skill |

Cuatro de cuatro. Eso no permite decir "el resto está bien": permite decir
**"el resto no se ha mirado"**. Este plan mira el resto.

## El método (lo que hay que transmitir a cada auditor)

Lo que encontró los cuatro no fue perspicacia, fue negarse a creerle a la
etiqueta:

1. **Ejecuta, no leas.** El benchmark decía "arnés determinista con evaluación
   doble ciega" en su encabezado. Bastó abrir el cuerpo.
2. **Los comentarios no son evidencia.** Describen la intención del autor, no
   lo que hace el código. Cuando difieren, gana el código.
3. **Pregunta si la prueba puede fallar.** Una eval que no puede ponerse en
   rojo no verifica nada. Rómpela a propósito y comprueba que falla.
4. **Pregunta si está conectado.** `traza.mjs` era código correcto que no
   llamaba nadie. Existir ≠ estar activo.
5. **Verifica en el entorno real, no solo en el repo.** Los hooks estaban en
   el repo y no en la máquina.
6. **Sospecha de lo que solo se afirma en prosa.** Una skill que promete
   "corre sobre X" sin ejecutar X es clase 3 disfrazada de clase 1.

## Patrones de fallo a buscar

- **Dato fabricado**: valores generados, hardcodeados o "de ejemplo" que se
  presentan como medición.
- **Código desconectado**: módulo escrito, probado y sin llamador.
- **Eval sin dientes**: no puede fallar, o falla sin decir por qué.
- **Omisión contada como éxito**: se salta por falta de credencial/dependencia
  y reporta verde.
- **Promesa sin respaldo**: la skill o el README afirma una capacidad que
  ningún código implementa.
- **Degradación silenciosa**: la dependencia opcional falta y en vez de avisar
  se cae a un modo peor sin decirlo.

## Rondas

**Ronda 1 — auditoría paralela (solo lectura y ejecución, sin editar).**
Cinco auditores, un área cada uno. No editan: se evita el conflicto de
escrituras y el control de calidad queda en un solo sitio.

| Auditor | Área |
|---|---|
| A1 | QA y navegación: `qaonline`, `navegador`, `cookies`, `dominio` + `/qa` `/qaonline` `/scrape` `/autenticar` |
| A2 | Memoria y código: `memoria`, `grafo`, `mapa`, `pruebas`, `checkpoint` + `/memoria` `/grafo` `/ubicar` `/contexto` `/pruebas-afectadas` |
| A3 | Inteligencia: `orquestador`, `nucleo/inteligencia/*`, `juez`, `benchmark` + `/fabrica` `/razonar` `/complejo` `/autoplan` `/benchmark` |
| A4 | Entrega y seguridad: `sync`, `salud`, `secretos`, `instalar` + `/shipear` `/desplegar` `/canario` `/seguridad` `/guardian` |
| A5 | Skills sin código detrás: las ~25 restantes, buscando el caso `/legal` repetido |

**Pista viva para A1:** la traza registra `qaonline: Test Dashboard Mock` con
`st:1` (fallo) **cinco veces**. Puede ser un mock que se espera que falle —
o no. Es justo el tipo de señal que antes no existía.

**Ronda 2 — corrección serial.** Se arreglan los hallazgos por gravedad, cada
uno con eval que lo fija en rojo. Sin excepción: un arreglo sin eval es una
promesa, y este repo ya demostró qué valen las promesas.

**Ronda 3 — re-auditoría.** Los mismos auditores verifican sus propios
hallazgos sobre el código corregido. Un arreglo que el auditor no confirma no
cuenta como cerrado.

Se repite hasta que una ronda completa no produzca hallazgos nuevos.

## Criterio de terminación (honesto)

"Perfecto y sin un agujero" no es verificable: nadie puede demostrar la
ausencia de bugs. Lo que sí es verificable y es la meta real:

> **Ninguna afirmación del repo queda sin ejecutar, y todo lo que se
> encuentre queda corregido con una eval que puede ponerse en rojo.**

Cuando una ronda pase sin hallazgos, el estado se declara así:
*"no quedan agujeros conocidos tras aplicar el método a todas las áreas"* —
no *"no quedan agujeros"*. La diferencia es la misma que separa este plan del
benchmark que retractamos.

## Bitácora

- 2026-07-25: plan creado tras 4 de 4 áreas auditadas con hallazgos graves.
