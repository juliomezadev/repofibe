# Plan de hardening — hallazgos de la auditoría v0.5.0

Fecha: 2026-07-19. Origen: auditoría del trabajo v0.3.1→v0.5.0.
Orden: por severidad (el crítico primero). Cada punto cierra con eval que
bloquea la regresión + verificación real, siguiendo la disciplina del repo.

## 1. 🔴 CRÍTICO — corrupción de memoria en gitMerge3Way (sync.mjs)
**Bug (probado):** `parsear()` hace `l.replaceAll("\\","/")` en cada línea y
escribe el resultado. Toda entrada con backslash (rutas Windows, regex,
escapes, snippets) se corrompe en cada merge entre máquinas.
**Fix:** normalizar backslashes SOLO para la clave de comparación (el Set),
escribir SIEMPRE la línea original sin tocar. Dedup por línea original.
**Eval:** caso con `C:\Users\app` + `\d+` → tras merge, texto idéntico y
JSON válido. Se integra a evals/nucleo/sync.mjs (ya en el runner tier-1).

## 2. 🟡 MEDIO — merge driver frágil
**a) Ruta relativa:** el driver se registra como `node nucleo/sync.mjs`
(relativo). Si git lo corre desde otro cwd, el archivo no existe.
→ Fix: registrar con la ruta ABSOLUTA de sync.mjs (resuelta en `configurar`).
**b) Errores tragados:** `catch(e){}` silencioso al registrar.
→ Fix: si falla el registro del driver, avisar (no romper el sync, pero
decirlo — el merge caería al default sin que el usuario sepa).

## 3. 🟢 HOUSEKEEPING
**a) 4 commits sin publicar** (v0.4.0–v0.5.0) → `git push` tras los fixes.
**b) Honestidad "cero-deps":** memoria semántica importa
`@xenova/transformers` (~90MB, opcional). README/COMPARACION deben decir
"cero-deps para el núcleo; embeddings opcionales, degrada a búsqueda
textual si el paquete no está" — no esconder el matiz.

## Verificación final
- `node evals/validar.mjs` verde (incluye el nuevo caso de merge).
- `node evals/tier2.mjs` verde.
- Bump a 0.5.1, CHANGELOG, push + tag.
