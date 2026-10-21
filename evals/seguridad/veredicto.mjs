#!/usr/bin/env node
// Regresión: una contaminación detectada nunca puede terminar en verde.

import { strict as assert } from "node:assert";
import { prepararVeredicto } from "../veredicto.mjs";

const contaminado = prepararVeredicto({ fallos: [], trazaAntes: 100, trazaDespues: 101 });
assert.equal(contaminado.exitCode, 1);
assert.equal(contaminado.todoVerde, false);
assert.equal(contaminado.fallos.length, 1);

const conFalloPrevio = prepararVeredicto({ fallos: ["fallo previo"], trazaAntes: 100, trazaDespues: 101 });
assert.equal(conFalloPrevio.exitCode, 1);
assert.deepEqual(conFalloPrevio.fallos, ["fallo previo", "contaminación de telemetría"]);

const limpio = prepararVeredicto({ fallos: [], trazaAntes: 100, trazaDespues: 100 });
assert.equal(limpio.exitCode, 0);
assert.equal(limpio.todoVerde, true);

console.log("ok: contaminación detectada produce exitCode 1 y conserva fallos previos");
