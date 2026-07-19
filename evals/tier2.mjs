#!/usr/bin/env node
// tier2.mjs — punto de entrada de las evals tier 2 (E2E, sesión real
// simulada). Separado de validar.mjs (tier 1) a propósito: tier 1 promete
// <5s y corre en cada push; tier 2 encadena ~15 subprocesos reales por
// suite y es más lento — se corre como job aparte en CI, o a mano antes de
// una release grande.
//
// Uso: node evals/tier2.mjs

import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = dirname(fileURLToPath(import.meta.url));
const DIR_E2E = join(RAIZ, "e2e");
const suites = readdirSync(DIR_E2E).filter((f) => f.endsWith(".mjs"));

if (!suites.length) {
  console.log("Sin suites tier 2 en evals/e2e/.");
  process.exit(0);
}

let fallos = 0;
for (const suite of suites) {
  console.log(`\n=== ${suite} ===`);
  const r = spawnSync(process.execPath, [join(DIR_E2E, suite)], { encoding: "utf8", stdio: "inherit", timeout: 60000 });
  if (r.status !== 0) fallos++;
}

console.log(fallos ? `\n${fallos}/${suites.length} suite(s) tier 2 fallaron.` : `\nTodo verde. ${suites.length} suite(s) tier 2 pasaron.`);
process.exit(fallos ? 1 : 0);
