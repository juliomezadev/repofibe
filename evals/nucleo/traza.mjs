#!/usr/bin/env node
import { withTrace, flushSyncEmergencia } from "../../nucleo/traza.mjs";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ARCHIVO_TRAZA = join(process.cwd(), ".fabrica", "traza.jsonl");

async function main() {
  const fnHija = withTrace("Subtarea Lenta", async (falla) => {
    await new Promise(r => setTimeout(r, 50));
    if (falla) throw new Error("Fallo simulado");
    return "ok";
  });

  const fnPadre = withTrace("Flujo Principal", async () => {
    await fnHija(false);
    try {
      await fnHija(true);
    } catch (e) {}
  });

  await fnPadre();
  
  // Forzamos el flush síncrono para leer enseguida y verificar
  flushSyncEmergencia();

  if (!existsSync(ARCHIVO_TRAZA)) {
    console.error("Error: No se creó traza.jsonl");
    process.exit(1);
  }

  const lineas = readFileSync(ARCHIVO_TRAZA, "utf8").split("\n").filter(Boolean);
  const spans = lineas.slice(-3).map(l => JSON.parse(l));

  const padre = spans[2];
  const hijoOk = spans[0];
  const hijoFail = spans[1];

  if (padre.n !== "Flujo Principal" || hijoOk.n !== "Subtarea Lenta") {
    console.error("Error: Nombres de traza incorrectos", padre, hijoOk);
    process.exit(1);
  }

  if (hijoOk.pId !== padre.sId || hijoFail.pId !== padre.sId) {
    console.error("Error: Anidación de IDs falló");
    process.exit(1);
  }

  if (hijoOk.st !== 0 || hijoFail.st !== 1) {
    console.error("Error: Status de error incorrecto");
    process.exit(1);
  }

  console.log("ok: anidación, propagación mágica y manejo de status funcionan (tracing cero-deps)");
}

main().catch(console.error);
