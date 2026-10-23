#!/usr/bin/env node
// Handler PreToolUse para Codex. Las decisiones y el alcance están en el
// motor común; cualquier fallo de carga devuelve un deny explícito.

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const DENY = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "REPOFIBE-GUARD[HOOK_FAILURE]: No se pudo cargar o evaluar la guardia; la operación queda denegada.",
  },
};

async function main() {
  try {
    const { evaluarEntrada, respuestaCodex } = await import("../../nucleo/ejecutar-seguro.mjs");
    const bloques = [];
    let total = 0;
    for await (const bloque of process.stdin) {
      total += bloque.length;
      if (total > 256 * 1024) throw new Error("stdin excede el límite admitido");
      bloques.push(bloque);
    }
    const resultado = evaluarEntrada(Buffer.concat(bloques).toString("utf8"));
    process.stdout.write(`${JSON.stringify(respuestaCodex(resultado))}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify(DENY)}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
