---
name: segunda-opinion
description: |
  Revisión independiente del diff por OTRO modelo (Codex CLI, Gemini CLI o
  Copilot CLI) con análisis cruzado contra /revisar: qué hallazgos coinciden
  (señal fuerte) y cuáles son únicos de cada modelo. Úsala cuando el usuario
  diga "segunda opinión", "que lo revise otro modelo", "reta este código",
  "¿codex qué dice?", o antes de shipear un cambio de alto riesgo. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` = esa raíz.

# /segunda-opinion — Otro modelo mira tu código

Dos modelos de proveedores distintos encontrando el mismo bug es señal
fuerte. Un solo modelo revisando su propio trabajo tiene puntos ciegos
sistemáticos — los mismos sesgos que produjeron el código pueden ocultar el
error al revisarlo.

## Paso 1 — Detecta el motor (en orden)

```
codex --version   → OpenAI Codex CLI (motor preferido)
gemini --version  → Google Gemini CLI
copilot --version → GitHub Copilot CLI
```

Si ninguno responde, ofrece instalar (RECOMENDACIÓN, el usuario decide):
`npm i -g @openai/codex` · `npm i -g @google/gemini-cli` — y como último
recurso usa el **fallback honesto**: `claude -p` con sesión limpia y prompt
de revisor hostil. Etiqueta SIEMPRE el fallback como "contexto
independiente, mismo proveedor" — nunca lo presentes como cross-modelo,
porque no lo es.

## Paso 2 — Elige el modo (RECOMENDACIÓN según el caso)

| Modo | Qué hace | Cuándo |
|---|---|---|
| **revision** | Gate pasa/no-pasa sobre el diff de la rama | Antes de /shipear |
| **reto** | Adversarial: "intenta romper este código, busca el exploit y el caso borde" | Código crítico (auth, pagos, datos) |
| **consulta** | Pregunta abierta con contexto del diff | Decisiones de diseño trabadas |

## Paso 3 — Ejecuta

1. Prepara el material: `git diff <base>...HEAD` a un archivo temporal +
   lista de archivos tocados. NO mandes secretos: pasa el diff por el
   escaneo de patrones de `/spec` fase 5 antes de enviarlo a otro proveedor.
2. Invoca el CLI en modo no-interactivo con un prompt en español que exige:
   hallazgos con archivo:línea, escenario concreto de fallo, severidad, y
   veredicto final PASA/NO-PASA (modo revision).
3. Timeout razonable (5 min). Si el CLI falla, repórtalo y cae al siguiente
   motor — nunca inventes la opinión del otro modelo (regla 1: si no corrió,
   no hay opinión).

## Paso 4 — Análisis cruzado (el valor real)

Si `/revisar` ya corrió en esta rama (consulta el historial:
`node <RAIZ>/nucleo/estado.mjs ver`), cruza los hallazgos:

- **Coinciden ambos** → señal fuerte: corrígelo ya, sin debate.
- **Solo un modelo** → verifícalo TÚ leyendo el código (regla 3) antes de
  aceptarlo o descartarlo; los modelos alucinan hallazgos distintos.
- **Se contradicen** → la realidad decide: reproduce el escenario en vivo.

Recuerda la soberanía del usuario: dos modelos de acuerdo siguen siendo una
recomendación, no un mandato.

## Al cerrar

```
node <RAIZ>/nucleo/estado.mjs registrar segunda-opinion "<motor>: <veredicto>, <n> hallazgos (<n> coincidentes)"
```

Si el otro modelo encontró algo que `/revisar` no vio, guárdalo:
`memoria.mjs agregar aprendizaje "punto ciego: <patrón que se nos escapó>"`.
