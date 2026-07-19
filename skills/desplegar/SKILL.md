---
name: desplegar
description: |
  De "PR aprobado" a "verificado en producción": mergea, espera CI y el
  deploy del proveedor detectado, y corre una verificación de salud real
  contra la URL de producción. Úsala cuando el usuario diga "mergea y
  despliega", "despliega a producción", "¿ya se ve el cambio en vivo?", o
  después de que un PR de /shipear queda aprobado. (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` = esa raíz.

# /desplegar — De aprobado a verificado en vivo

Esta skill hace algo IRREVERSIBLE en un sistema compartido (mergea a main,
puede disparar un deploy real). Confirma explícitamente con el usuario antes
del merge — no asumas autorización de un "shipea" anterior.

## Paso 1 — Configuración (una vez por proyecto)

Busca `.fabrica/deploy.json`. Si no existe:

```
node <RAIZ>/nucleo/salud.mjs detectar
```

(código real con eval — no adivines el proveedor a mano). Confirma con el
usuario (RECOMENDACIÓN) y guarda:

```json
{ "proveedor": "vercel|netlify|fly|github-pages|manual",
  "url_produccion": "https://...",
  "ruta_salud": "/api/health" }
```

Si el proveedor detectado es `manual`, esta skill se limita a mergear +
avisar — no hay URL que verificar automáticamente.

## Paso 2 — Confirma y mergea

1. Muestra el PR (`gh pr view`), su estado de checks, y el diff resumido.
2. **Pregunta explícita**: "¿Confirmas el merge de #<n> a <base>? Esto
   dispara el deploy real." Sin confirmación, PARA aquí.
3. `gh pr merge <n> --squash` (o el método que el repo use — revisa
   convención con `git log` de merges previos). Nunca `--admin` sin que el
   usuario lo pida explícitamente.

## Paso 3 — Espera CI y el deploy

- CI: `gh run watch` sobre el run del merge commit, con timeout razonable
  (10 min) — si no termina, reporta el estado real, no lo des por bueno.
- Deploy: si el proveedor tiene CLI/API de estado (Vercel: `vercel ls`
  o el check de GitHub del bot de Vercel; Netlify: check equivalente),
  consúltalo. Si `proveedor: "manual"`, dile al usuario que verifique y
  ofrece re-invocar `/desplegar verificar` cuando esté listo.

## Paso 4 — Verificación de salud real (regla 1: evidencia)

Antes del deploy (justo después de mergear, mientras CI corre) toma la línea
base del estado ANTERIOR si el proveedor lo permite, o mide el estado actual
como referencia:

```
node <RAIZ>/nucleo/salud.mjs base <url_produccion> [ruta_salud]
```

Después de que el deploy termine, compara de verdad — no supongas:

```
node <RAIZ>/nucleo/salud.mjs comparar <url_produccion> [ruta_salud]
```

Sale con código 0 (`ESTABLE`) o 1 (`REGRESION`, con los motivos concretos:
código HTTP degradado o latencia >2x sostenida). "Desplegado" sin esta
comparación es una suposición, no un hecho.

## Al cerrar

```
node <RAIZ>/nucleo/estado.mjs registrar desplegar "PR #<n> mergeado, <proveedor>, salud: <ok|fallo>"
```

Si `salud.mjs comparar` sale con código 1, NO lo llames éxito — recomienda
`/investigar` o rollback según la gravedad, y espera confirmación del
usuario antes de cualquier acción de rollback (también irreversible).
Cierra ofreciendo `/canario` para monitoreo post-deploy (reutiliza la misma
línea base que ya guardaste en `.fabrica/salud-base.json`).
