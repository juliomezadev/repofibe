# Plan de superioridad de repofibe

## Tesis

Repofibe debe dirigir, verificar y limitar el trabajo del agente. Las skills
son la interfaz humana; el núcleo ejecutable debe controlar riesgo, estado,
evidencia, memoria y reversibilidad.

## Gates de producto

Una capacidad solo puede marcarse como `IMPLEMENTADA` si tiene código,
prueba automatizada y evidencia reproducible. Las categorías válidas son:

- `IMPLEMENTADA`: comportamiento ejecutable y probado.
- `GUIADA`: instrucción Markdown; depende del modelo.
- `EXPERIMENTAL`: existe, pero no tiene cobertura suficiente.
- `PLANEADA`: todavía no existe.

## Orden de ejecución

1. Seguridad del actualizador y del instalador: opt-in, ownership por archivo,
   rollback y pruebas de desinstalación sin pérdida de datos.
2. Núcleo confiable: guardias, estado, grafo con hashes de contenido y manejo
   explícito de confianza.
3. Orquestador: tarea, plan, riesgo, modo, evidencia y transiciones de estado
   como contratos estructurados.
4. Memoria y orientación: recuperación relevante, impacto transitivo y
   selección de pruebas afectadas.
5. Legal colombiano: fuentes oficiales, vigencia, fecha de consulta,
   incertidumbre y escalamiento a abogado.
6. Adaptadores multi-host con pruebas de instalación, ejecución, actualización
   y desinstalación por host.
7. Navegador, deploy, canary y benchmark, después de estabilizar el núcleo.

## Modos de operación

- `seguro`: aprobación antes de cualquier escritura sensible, push, deploy o
  actualización.
- `equilibrado`: automatiza lecturas y pruebas; pregunta antes de cambios de
  alto riesgo. Es el modo por defecto.
- `autónomo`: trabaja dentro de un workspace autorizado, con checkpoints y
  rollback; nunca ejecuta destructivos o deploy sin aprobación.

## Métricas para afirmar superioridad

Antes de usar “mejor que gstack”, comparar 20 tareas equivalentes y registrar:

- tasa de tareas terminadas con evidencia;
- bloqueos correctos y falsos positivos de seguridad;
- éxito de instalación y recuperación de sesión;
- tiempo, tokens y archivos leídos;
- exactitud de impacto y selección de pruebas;
- calidad y trazabilidad de respuestas legales.

Objetivo de release: cero hallazgos P1, desinstalación sin borrar archivos
ajenos, cobertura de los flujos críticos y resultados iguales o mejores en la
matriz comparativa.
