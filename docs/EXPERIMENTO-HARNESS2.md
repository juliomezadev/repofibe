# Propuesta de experimento: Harness² con Repofibe

**Estado: diseño solamente.** Este documento no añade dependencias, no modifica
el runtime de Repofibe y no instala ni ejecuta Harness². El proyecto upstream
describe una técnica de refinamiento recursivo del harness mediante
Propose–Probe–Compose y aprendizaje persistente entre tareas; su README también
advierte que no es un producto oficialmente soportado por Google. Fuentes:
[repositorio google-research/harness2](https://github.com/google-research/harness2)
y [artículo en arXiv](https://arxiv.org/abs/2610.14224).

Los resultados publicados por el upstream no son evidencia de que Harness²
mejore Repofibe. Antes de considerar una integración habría que comprobar que
la versión del experimento soporta el executor y el flujo de skills que se
quieran evaluar. La propuesta siguiente separa el prototipo de cualquier
instalación real.

## Hipótesis

En tareas pequeñas y repetibles, dejar que Harness² proponga y pruebe cambios
aislados al contexto, las skills o las instrucciones puede aumentar el éxito
en tareas retenidas sin aumentar regresiones de seguridad, costo o tiempo más
allá de límites aceptables.

La hipótesis queda refutada si la mejora sólo aparece en las tareas usadas para
ajustar el harness, si genera una regresión en cualquier control duro, o si el
costo y el tiempo extra superan el beneficio medido.

## Diseño y tareas

Comparar dos grupos sobre un mismo commit fijo de Repofibe:

1. **Control:** harness actual intacto.
2. **Tratamiento:** copia desechable donde la herramienta puede ajustar el
   harness de la tarea y guardar aprendizajes sólo dentro de esa copia.

Usar un repositorio sintético sin datos de usuario ni secretos reales. Preparar
12 tareas deterministas repartidas entre seis familias: redacción de secretos
en JSONL, recibos vinculados a gates, rechazo de symlinks/junctions que escapan
del workspace, argumentos opcionales del guardia, instalación que preserva
plugins de terceros y documentación compatible con la matriz de Node/CI.
Asignar seis tareas a calibración y seis a evaluación retenida; mantener las
aserciones de aceptación fuera del contexto que recibe el agente.

La prueba piloto propuesta ejecuta cada tarea tres veces por grupo con el
mismo modelo, executor, versión, presupuesto máximo, timeout y configuración
de red. Eso produce 36 ejecuciones por grupo. Si el executor compatible o las
condiciones de aislamiento no están disponibles, el piloto no empieza.

## Métricas y criterio de decisión

- **Métrica primaria:** proporción de ejecuciones que satisfacen todas las
  aserciones de aceptación en las seis tareas retenidas.
- **Seguridad como condición obligatoria:** cero escrituras fuera de la copia
  desechable, cero llamadas de publicación o deploy, cero eliminación o
  modificación de plugins ajenos y cero secretos sintéticos expuestos en los
  artefactos retenidos.
- **Métricas secundarias:** número de regresiones en las 12 tareas, cambios de
  harness retenidos, tiempo de pared, tokens/costo estimado y cantidad de
  reintentos por tarea.
- **Revisión:** comparar artefactos con los IDs de grupo ocultos al revisor;
  conservar la salida de cada ejecución y el criterio de aceptación aplicado.

Para pasar de piloto a recomendación, exigir al menos 3 aciertos netos más en
las 18 ejecuciones retenidas del tratamiento frente al control, cero
regresiones de seguridad y un incremento de costo/tiempo dentro de un límite
aprobado antes de iniciar. Con esta muestra, el resultado sólo justifica otro
experimento; no demuestra mejora generalizable.

## Controles y aislamiento

- Ejecutar únicamente en un checkout temporal y descartable, nunca en el
  repositorio de trabajo ni en `~/.repofibe` o la configuración real de un
  host.
- Usar credenciales sintéticas. Para la primera fase no permitir acceso a
  GitHub, marketplaces, deploys, sync ni red general; si el protocolo upstream
  requiere un proveedor de modelo, habilitar sólo ese endpoint bajo un límite
  de presupuesto aprobado por separado.
- No dar acceso a tokens, cookies, `storageState`, memoria del usuario ni
  archivos del home. Bloquear `git push`, publicación de paquetes y creación
  de releases.
- Mantener control, tratamiento, tareas retenidas, semillas, logs y artefactos
  separados; fijar commit, modelo y executor antes de cada corrida.
- Detener el piloto al primer intento de escapar del checkout, revelar una
  credencial, alterar el control o tocar una integración externa.
- Guardar resultados como artefacto de investigación independiente. No
  copiar skills, scripts ni aprendizajes al producto sin una revisión y un
  plan de cambio separado.

## Decisión posterior

Una corrida futura requiere primero revisar la compatibilidad del executor,
preparar el fixture retenido, fijar presupuesto y límites de red, y hacer una
revisión de seguridad del entorno descartable. Hasta que eso ocurra, Harness²
es una referencia de investigación y no forma parte de la instalación,
dependencias o garantías de Repofibe.
