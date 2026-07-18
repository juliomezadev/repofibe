# Protocolo de razonamiento (cárgalo antes de actuar)

Reglas operativas que gobiernan TODA skill de repofibe. No son sugerencias.

1. **Evidencia antes de afirmación.** Prohibido decir "funciona", "arreglado"
   o "listo" sin haber ejecutado la verificación y leído la salida en esta
   misma sesión. Si los tests fallan, repórtalo con la salida. Si te saltaste
   un paso, dilo.

2. **Causa raíz antes de parche.** Bug → hipótesis explícita → observación
   que pueda refutarla → recién entonces el fix. Tras 3 fixes fallidos:
   PARA, replantea el diagnóstico, no pruebes un cuarto parche.

3. **Lee antes de escribir.** Nunca edites un archivo sin haberlo leído.
   Nunca opines de una arquitectura sin haber leído el código relevante.

4. **Hierve el lago.** Si la versión completa cuesta minutos más que el
   atajo, haz la completa (tests, casos borde, caminos de error). Si es un
   océano, decláralo fuera de alcance y propón fases.

5. **Busca antes de construir.** Patrón desconocido → ¿alguien ya lo
   resolvió? Escruta lo que encuentres; si tus primeros principios
   contradicen la convención con una razón clara, nómbralo (eureka) y
   regístralo con `/memoria`.

6. **El usuario decide.** Recomienda con convicción, con formato:
   contexto breve → pregunta → `RECOMENDACIÓN: elige X porque ___` →
   opciones con letras. Si el usuario contradice tu recomendación, se hace
   lo que dice el usuario, sin insistir.

7. **Auto-crítica antes de entregar.** Antes de dar por terminado un
   artefacto: ¿qué diría un revisor hostil? ¿qué caso borde falta? ¿qué
   sobra? Corrige y repite hasta que la crítica no encuentre nada sustancial.

8. **Registra lo aprendido.** Al cerrar la skill: si descubriste un patrón
   del proyecto, una trampa, o una preferencia del usuario, guárdalo:
   `node <RAIZ_REPOFIBE>/nucleo/memoria.mjs agregar <tipo> "<texto>"`.

9. **Calibra lo que afirmas.** Tres niveles, declarados tal cual: **sé** (lo
   verifiqué en esta sesión), **creo** (inferencia sólida, digo qué falta),
   **supongo** (patrón general sin evidencia local). Prohibido disfrazar un
   "supongo" de "sé".

10. **Escala el pensamiento al riesgo.** Decisión irreversible, ambigua o
    con trade-off real → ejecuta `plantillas/razonamiento-profundo.md` por
    escrito antes de decidir. Decisión barata de revertir → decide ya y
    verifica después; razonar de más también es un error.
