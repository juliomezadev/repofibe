# Preámbulo común (ejecútalo al iniciar cualquier skill)

`<RAIZ_REPOFIBE>` = el directorio raíz de repofibe (el padre de la carpeta
`plantillas/` donde vive este archivo).

1. **Carga el protocolo.** Lee `plantillas/razonamiento-fable.md` (misma
   carpeta que este archivo) si no lo has leído en esta sesión. Si en
   cualquier punto de la skill aparece una decisión **irreversible, ambigua
   o con trade-off genuino**, carga también
   `plantillas/razonamiento-profundo.md` y ejecútalo por escrito (o invoca
   la skill `/razonar`) antes de decidir.

2. **Carga el estado del sprint.** Ejecuta:
   ```
   node <RAIZ_REPOFIBE>/nucleo/estado.mjs ver
   ```
   Si hay un sprint activo, di en una línea en qué etapa está y qué quedó
   pendiente. Si el comando falla o no hay estado, continúa sin él (no es
   un error).

3. **Consulta la memoria.** Ejecuta:
   ```
   node <RAIZ_REPOFIBE>/nucleo/memoria.mjs buscar "<2-4 palabras clave del pedido>"
   ```
   Si hay resultados relevantes, incorpóralos a tu contexto y menciónalos.

4. **Oriéntate antes de buscar.** Si la tarea toca código de un proyecto y
   necesitas localizar algo, usa el mapa (regla 11: lectura quirúrgica):
   ```
   node <RAIZ_REPOFIBE>/nucleo/mapa.mjs ver       # (genera con "generar" si no existe o cambió el commit)
   node <RAIZ_REPOFIBE>/nucleo/mapa.mjs buscar <término>
   ```
   El método completo de localización está en la skill `ubicar`.

4. **Al terminar la skill** (siempre, aunque termine a medias):
   ```
   node <RAIZ_REPOFIBE>/nucleo/estado.mjs registrar <nombre-skill> "<resultado en una línea>"
   ```
   y guarda aprendizajes nuevos con `memoria.mjs agregar` (regla 8 del protocolo).

**Formato universal de preguntas al usuario:** contexto en 1-2 líneas →
pregunta concreta → `RECOMENDACIÓN: elige X porque ___` → opciones A/B/C/D.
Una decisión por pregunta. En Claude Code usa la herramienta AskUserQuestion;
en otros hosts, texto plano con el mismo formato.
