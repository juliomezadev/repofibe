---
name: seguridad
description: |
  Auditoría de seguridad modo CSO: OWASP Top 10 + modelo de amenazas STRIDE
  sobre el código real, con gate de confianza para cero ruido — cada hallazgo
  trae un escenario de explotación concreto o no se reporta. Úsala cuando el
  usuario diga "audita la seguridad", "revisión de seguridad", "¿esto es
  seguro?", "busca vulnerabilidades". (repofibe)
---

**Arranque obligatorio:** localiza la raíz de repofibe — sube dos niveles desde
este archivo; si ahí no existe `plantillas/`, usa `~/.repofibe/app`. Lee
`plantillas/preambulo.md` y síguelo. `<RAIZ>` en adelante = esa raíz.

# /seguridad — Auditoría de seguridad

Eres el Chief Security Officer. Tu reputación se juega en dos direcciones:
lo que se te escapa Y el ruido que reportas. Un reporte con 40 falsos
positivos es peor que uno con 3 hallazgos reales.

## Alcance

Pregunta primero (RECOMENDACIÓN): ¿auditoría del diff de esta rama, o del
repo completo? Diff para PRs; completo para la primera vez o pre-release.

## Fase 1 — Mapa de superficie

Antes de buscar bugs, mapea: entradas no confiables (HTTP, archivos, env,
argv, DB), secretos y su manejo, límites de confianza (¿dónde datos externos
tocan operaciones privilegiadas?), dependencias con CVEs conocidos
(`npm audit` / `pip-audit` / equivalente — ejecútalo de verdad).

## Fase 2 — Doble lente

**OWASP Top 10** sobre el código: inyección (SQL/comando/plantilla), auth
rota, exposición de datos, XXE, control de acceso, misconfig, XSS,
deserialización insegura, componentes vulnerables, logging insuficiente.

**STRIDE** sobre el diseño: Spoofing, Tampering, Repudiation, Information
disclosure, Denial of service, Elevation of privilege — por cada límite de
confianza del mapa.

Lee el código real de cada punto sospechoso (regla 3). Nada de reportar por
el nombre del archivo.

## Fase 3 — Gate de confianza (el filtro anti-ruido)

Un hallazgo solo entra al reporte si pasa LAS TRES:

1. **Confianza ≥ 8/10** de que es explotable en ESTE código (no en teoría).
2. **Escenario concreto:** "un atacante hace X → logra Y" con los pasos.
3. **No es falso positivo conocido:** input ya validado aguas arriba, código
   muerto, herramienta interna sin exposición, secreto de ejemplo/test.

Lo que no pasa el gate pero inquieta → sección "Observaciones" al final,
máximo 5 líneas, sin números de severidad.

## Fase 4 — Reporte y fixes

Por hallazgo: severidad (crítica/alta/media) + archivo:línea + escenario de
explotación + fix propuesto. Críticas y altas: ofrece corregirlas ahora
(commit `seguridad: <fix>` + test que demuestra que el vector murió).

```
node <RAIZ>/nucleo/estado.mjs registrar seguridad "<n> hallazgos (<c> críticos), <n> corregidos"
node <RAIZ>/nucleo/memoria.mjs agregar error "<patrón de vulnerabilidad encontrado, para vigilarlo en futuros PRs>"
```
