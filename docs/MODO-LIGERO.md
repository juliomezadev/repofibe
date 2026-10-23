# Modo ligero de `/construir`

El modo ligero reduce los pasos prescritos solo si una entrada estructurada
demuestra que el cambio es pequeño, interno, reversible y de bajo riesgo. La
decisión es determinista y falla hacia el modo estricto. No concede permisos ni
sustituye la guardia ejecutable, el sandbox del host o la revisión del usuario.

## Uso

Desde el directorio actual del repositorio consumidor, invoca el selector con la
ruta absoluta de la instalación REPOFIBE. Su ruta se resuelve desde la skill;
no cambies de directorio a REPOFIBE. Entrega al selector el objetivo, las rutas
previstas, el riesgo y la evidencia. En PowerShell, usa stdin UTF-8 para evitar
problemas de comillas y conservar tildes:

```powershell
$encodingAnterior = $OutputEncoding
$consolaAnterior = [Console]::OutputEncoding
try {
  $OutputEncoding = New-Object System.Text.UTF8Encoding
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
  @'
{"objetivo":"Añadir una etiqueta accesible a un control existente.","archivos":["src/ui/etiqueta.mjs"],"riesgo":"bajo","evidencia":{"alcanceConocido":true,"impactoConocido":true,"pruebasConocidas":true,"reversible":true,"confianza":"alta"}}
  '@ | node "<ruta absoluta de REPOFIBE>\nucleo\modo-ligero.mjs" analizar --stdin --json
} finally {
  $OutputEncoding = $encodingAnterior
  [Console]::OutputEncoding = $consolaAnterior
}
```

La salida JSON incluye `modo`, razones, skills necesarias, tareas, comandos,
controles esenciales y un recuento fijo de pasos/comandos. Una entrada ausente,
malformada o incompleta muestra modo estricto. El llamador no debe corregir
automáticamente la entrada ni inferir evidencia faltante.

## Condiciones para ligero

Todas deben ser ciertas:

- El objetivo es explícito y breve, y el riesgo se declara exactamente como
  `bajo`.
- Se prevén una o dos rutas relativas dentro del repositorio, con no más de un
  área de implementación. Un archivo de prueba puede acompañar un único cambio
  de implementación; cambiar pruebas/evaluaciones por sí solas queda en modo
  estricto.
- Ninguna ruta corresponde a seguridad, autenticación, secretos, credenciales,
  datos, migraciones, despliegue, pagos, configuración, manifiestos, hooks,
  skills, plantillas o archivos operativos protegidos.
- La evidencia declara `alcanceConocido`, `impactoConocido`,
  `pruebasConocidas` y `reversible` como `true`, con `confianza: "alta"`.
- El objetivo no contiene un indicador de riesgo, cambio sensible, operación
  destructiva, depuración, publicación o incertidumbre.

Si el diff real se sale de las rutas previstas, surge una nueva dependencia,
falla una prueba inesperada o aparece incertidumbre, cambia al flujo estricto.
La selección de pruebas es una heurística; el resultado vacío no demuestra que
no haya pruebas necesarias. Investiga y amplía la suite si el radio no está
claro.

## Flujo y controles

El modo ligero usa solo `/construir`, y sigue estos pasos:

1. Confirmar el objetivo, las rutas previstas y el alcance autorizado.
2. Aplicar el cambio pequeño y reversible dentro de ese alcance.
3. Ejecutar el comando con ruta absoluta de pruebas emitido por el selector y
   las pruebas afectadas.
4. Ejecutar `git diff --check` y leer el diff completo.
5. Confirmar que el diff no sale del alcance y que las guardias siguen activas.

El selector emite `node "<ruta absoluta de REPOFIBE>\nucleo\pruebas.mjs"
afectadas --json`, además de `git diff --check` y `git diff`. La ruta al script
es absoluta para que funcione desde un proyecto consumidor; la herramienta
conserva el `cwd` actual, porque `pruebas.mjs` obtiene el repo objetivo de
`process.cwd()`. No cambies de directorio a la instalación REPOFIBE. El diff
debe revisarse aunque la selección de pruebas no encuentre una prueba. Siguen
aplicando la autorización del usuario, la comprobación de permisos y las reglas
de `/guardian`. La ruta ligera nunca autoriza borrados, resets, sobrescrituras,
cambios fuera del repositorio, pushes, merges ni despliegues.

El modo estricto conserva ocho pasos, incluida planificación o investigación
cuando corresponda, selección de pruebas afectadas más suite amplia,
verificación y cierre; su lista fija de comparación propone cuatro comandos:
pruebas afectadas con la ruta absoluta anterior, `node "<ruta absoluta de
REPOFIBE>\evals\validar.mjs"`, `git diff --check` y `git diff`.
El selector elige `/guardian` en estricto y añade `/investigar` para tareas de
bug o fallo, y `/plan-ing` cuando detecta varias áreas. La lista orienta la
carga de skills; no ejecuta dichas skills por sí misma.

## Evidencia de eficiencia

`nucleo/modo-ligero.mjs` publica el mismo recuento en cada ejecución:

| Flujo | Pasos prescritos | Comandos prescritos |
|---|---:|---:|
| Ligero | 5 | 3 |
| Estricto | 8 | 4 |

Para una entrada que califica, se reducen tres pasos prescritos y un comando de
la lista fija. Esto mide solo el tamaño de los procedimientos documentados; no
es una medida de duración, tokens, latencia o rendimiento observado del agente.
`evals/nucleo/modo-ligero.mjs` verifica el selector, el fallback estricto y que
la selección Git encuentre y ejecute una prueba afectada en un repositorio
sintético.

## Límites

El selector no inspecciona el contenido del diff, no valida que el usuario
declare honestamente la evidencia y no intercepta herramientas. La skill exige
comparar las rutas previstas con el diff real, pero la imposición de operaciones
depende del guard ejecutable y de las superficies interceptadas por el host.
No se debe presentar este modo como sandbox ni como protección universal.
