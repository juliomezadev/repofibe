#!/usr/bin/env node
// evals/nucleo/sync.mjs — eval funcional de sync.mjs.
//
// Prueba el CÓDIGO REAL de sync.mjs (mergeJsonl, escanearSecretos), no una
// reimplementación. La versión anterior de esta eval copiaba la lógica de
// merge dentro del test y por eso NO detectó tres bugs reales (auditados y
// corregidos 2026-07-19):
//   1. appendFileSync usado sin importar → pull crasheaba en el primer merge.
//   2. escanearSecretos leía resultado.encontrados (no existe; es .hallazgos)
//      → el escáner de secretos NUNCA redactaba antes de push (no-op de
//      seguridad: credenciales al repo privado en texto plano).
//   3. dedup por `id` duplicaba cada entrada de memoria.jsonl (no tiene id).
// La integración real (push/pull con git) sigue siendo job manual del usuario.

import { strictEqual, ok } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mergeJsonl, escanearSecretos, gitMerge3Way } from "../../nucleo/sync.mjs";

const TEMP = mkdtempSync(join(tmpdir(), "repofibe-sync-eval-"));

function lineas(p) { return readFileSync(p, "utf8").split("\n").filter(Boolean); }

async function probarMergeConId() {
  // dominio-notas.jsonl: entradas CON id. Remoto trae 2 duplicadas + 2 nuevas.
  const dest = join(TEMP, "dominio-notas.jsonl");
  const src = join(TEMP, "dominio-remoto.jsonl");
  const mk = (arr) => arr.map((o) => JSON.stringify(o)).join("\n") + "\n";
  writeFileSync(dest, mk([{ id: "a1", texto: "l1" }, { id: "a2", texto: "l2" }, { id: "a3", texto: "l3" }]));
  writeFileSync(src, mk([{ id: "a1", texto: "l1" }, { id: "a2", texto: "l2" }, { id: "b1", texto: "r1" }, { id: "b2", texto: "r2" }]));
  const n = mergeJsonl(dest, src); // ejercita appendFileSync de verdad (BUG 1)
  strictEqual(n, 2, "solo 2 líneas remotas nuevas (b1,b2)");
  strictEqual(lineas(dest).length, 5, "3 locales + 2 nuevas = 5, sin duplicados");
  console.log("ok: mergeJsonl con id — appendFileSync real, dedup por línea, 2 nuevas de 4");
}

async function probarMergeSinId() {
  // memoria.jsonl: entradas SIN id (fecha/tipo/texto). El dedup DEBE ser por
  // línea completa, no por id — si fuera por id, todas serían "nuevas" y se
  // duplicarían (BUG 3). Reaplicar el mismo remoto dos veces no debe crecer.
  const dest = join(TEMP, "memoria.jsonl");
  const src = join(TEMP, "memoria-remoto.jsonl");
  const mk = (arr) => arr.map((o) => JSON.stringify(o)).join("\n") + "\n";
  writeFileSync(dest, mk([{ fecha: "2026-07-19", tipo: "nota", texto: "local" }]));
  writeFileSync(src, mk([
    { fecha: "2026-07-19", tipo: "nota", texto: "local" },      // duplicada exacta
    { fecha: "2026-07-18", tipo: "eureka", texto: "remota" },   // nueva
  ]));
  strictEqual(mergeJsonl(dest, src), 1, "solo la línea nueva (la duplicada exacta no cuenta)");
  strictEqual(mergeJsonl(dest, src), 0, "re-merge del mismo remoto no agrega nada (idempotente)");
  strictEqual(lineas(dest).length, 2, "1 local + 1 remota = 2, sin duplicar pese a no tener id");
  console.log("ok: mergeJsonl sin id (memoria) — dedup por línea, idempotente, no duplica");
}

async function probarEscaneoSecretos() {
  // BUG 2: el escáner debe redactar de verdad antes de push.
  const fab = join(TEMP, ".fabrica");
  mkdirSync(fab, { recursive: true });
  const token = "ghp_" + "1234567890abcdefghijklmnopqrstuvwxyzAB"; // forma real, valor ficticio
  writeFileSync(join(fab, "memoria.jsonl"), JSON.stringify({ tipo: "nota", texto: "token: " + token }) + "\n");
  const n = await escanearSecretos(fab);
  const despues = readFileSync(join(fab, "memoria.jsonl"), "utf8");
  ok(n > 0, "el escáner debía contar al menos 1 secreto redactado (no NaN, no 0)");
  ok(!despues.includes(token), "el token NO debe seguir en el archivo tras escanear");
  ok(despues.includes("REDACTADO"), "debe quedar la marca REDACTADO");
  console.log("ok: escanearSecretos redacta de verdad antes de push (BUG 2 de seguridad, cubierto)");
}

function probarMerge3WayNoCorrompe() {
  // BUG 4 (crítico, auditoría 2026-07-19): gitMerge3Way normalizaba \→/ en el
  // CONTENIDO escrito, corrompiendo rutas Windows, regex y escapes en cada
  // merge entre máquinas. Debe preservar el contenido original intacto.
  const A = join(TEMP, "m3-anc"), L = join(TEMP, "m3-loc"), R = join(TEMP, "m3-rem");
  const entrada = JSON.stringify({ id: "1", tipo: "error", texto: "build en C:\\Users\\app; regex \\d+" });
  writeFileSync(A, ""); writeFileSync(L, entrada + "\n"); writeFileSync(R, "");
  gitMerge3Way(A, L, R);
  const salida = readFileSync(L, "utf8").trim();
  strictEqual(salida, entrada, "gitMerge3Way NO debe alterar el contenido (backslashes intactos)");
  strictEqual(JSON.parse(salida).texto, "build en C:\\Users\\app; regex \\d+", "el texto con backslashes sobrevive el merge");

  // Merge real de dos lados con entradas distintas: une ambas, dedup de la común.
  const comun = entrada;
  const soloLocal = JSON.stringify({ id: "2", tipo: "nota", texto: "ruta local D:\\proyecto" });
  const soloRemoto = JSON.stringify({ id: "3", tipo: "nota", texto: "ruta remota E:\\otro" });
  writeFileSync(A, comun + "\n");
  writeFileSync(L, comun + "\n" + soloLocal + "\n");
  writeFileSync(R, comun + "\n" + soloRemoto + "\n");
  gitMerge3Way(A, L, R);
  const merged = lineas(L);
  strictEqual(merged.length, 3, "unión: común + soloLocal + soloRemoto = 3 líneas");
  ok(merged.every((l) => { try { JSON.parse(l); return true; } catch { return false; } }), "todas las líneas siguen siendo JSON válido tras el merge de 3 lados");
  ok(merged.some((l) => l.includes("D:\\\\proyecto")) && merged.some((l) => l.includes("E:\\\\otro")), "los backslashes de ambos lados sobreviven");
  console.log("ok: gitMerge3Way NO corrompe backslashes (BUG 4 crítico cubierto) + unión 3-way correcta");
}

try {
  await probarMergeConId();
  await probarMergeSinId();
  await probarEscaneoSecretos();
  probarMerge3WayNoCorrompe();
  console.log("Sync: mergeJsonl, escanearSecretos y gitMerge3Way (sin corrupción) verificados sobre el código real; push/pull con git sigue siendo job manual.");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
