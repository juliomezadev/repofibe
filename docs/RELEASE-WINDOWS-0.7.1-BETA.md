# REPOFIBE 0.7.1-beta.1 para Windows x64

Esta beta incorpora modo ligero, modo estricto y coordinación Git para cambios
paralelos. Está dirigida a Windows x64. Linux y macOS conservan sus pruebas,
pero esta versión no los certifica.

## Requisitos y comprobaciones

- Windows x64.
- Node.js 22.23.4 o 24.22.1, las dos versiones usadas en la validación local.
- Git para el flujo de coordinación multiagente. Git no se requiere para usar
  las skills instaladas.
- No se necesita npm para ejecutar el núcleo distribuido.

Las pruebas LLM de pago no se ejecutaron. La guardia Codex incluida es
experimental: no fue validada en una sesión Codex real, no se activa ni se
confía automáticamente, y solo cubre llamadas que pasan por el hook compatible
cuando el usuario lo habilita y confía. No es un sandbox universal. Mantén las
aprobaciones normales del host para operaciones sensibles.

## Instalación y actualización

1. Descarga `Repofibe-0.7.1-beta.1-windows-x64.zip` y `SHA256SUMS.txt` desde la
   misma publicación.
2. Comprueba el SHA-256 del ZIP publicado antes de extraerlo.
3. Extrae el ZIP y ejecuta `instalar.ps1` desde la carpeta extraída. Para elegir
   un host, añade `-RepoHost codex`, `-RepoHost claude` u otro host compatible.
4. Reinicia el host y comprueba la instalación con
   `node "$env:USERPROFILE\.repofibe\app\nucleo\diagnostico.mjs" --json`.

Para actualizar una instalación existente, ejecuta `instalar.ps1 -Refrescar`.
El instalador conserva archivos de usuario que no administra; guarda una copia
de seguridad antes de actualizar por primera vez.

## Uso

- **Modo ligero:** usa `/construir` para una tarea pequeña y de bajo riesgo.
  La skill consulta el selector, elige habilidades y pruebas acotadas, revisa
  el diff y eleva al modo estricto si detecta riesgo o incertidumbre.
- **Modo estricto:** solicita `/construir` o el flujo de planificación y
  revisión para cambios críticos, de seguridad o despliegue. Conserva pruebas,
  checkpoints y revisión antes de cerrar.
- **Coordinación Git:** consulta `docs/COORDINACION-GIT.md`. Asigna ownership
  exclusivo y worktrees separados; valida el contrato y el diff antes de
  integrar. El flujo evita reset, clean, merge y push automáticos. No es un
  sandbox para los comandos o pruebas que cada agente ejecute.

No se ha demostrado una reducción de tiempo de ejecución; las mediciones de
pasos/comandos no equivalen a una mejora de rendimiento.

## Recuperación y rollback

El instalador usa una actualización transaccional y revierte la instalación
cuando falla una actualización. Para regresar manualmente, ejecuta el
instalador del ZIP de REPOFIBE 0.7.0 con `-Refrescar`. Conserva la configuración,
skills personalizadas y datos antes de cambiar de versión; no borres a mano
carpetas de instalación para hacer rollback.

La distribución 0.7.0 de referencia se conserva por separado. La publicación
adjunta sus hashes para que puedas verificar que el paquete descargado no
cambió.
