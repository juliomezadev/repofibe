#!/usr/bin/env node
// secretos.mjs — redacción de secretos, fail-closed.
// Núcleo mecánico real de /segunda-opinion (nunca mandar un secreto a otro
// proveedor de IA) y /spec (nunca archivar un secreto en un doc del repo).
// Antes vivía como instrucción en prosa ("escanea por sk-, ghp_...");
// ahora es una función pura con evidencia.
//
// Honestidad: esto es una lista de patrones de alta confianza, no un
// oráculo. Cubre los formatos más comunes (AWS, GitHub, OpenAI, Slack,
// GitLab, JWT, PEM, cadenas de conexión, asignaciones genéricas obvias).
// Un secreto con formato no estándar puede pasar sin ser detectado — por
// eso esto reduce el riesgo, no lo elimina; sigue sin ser aceptable pegar
// código sin revisar en un canal externo.
//
// Uso:
//   node secretos.mjs redactar <archivo>     # imprime el contenido redactado a stdout
//   node secretos.mjs redactar --stdin       # lee de stdin, útil en pipes
//   (resumen de hallazgos siempre va a stderr, nunca se mezcla con el contenido)

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// [tipo, regex, índiceGrupoValor]. El tercer campo dice qué grupo capturado
// (1-indexado) contiene el VALOR candidato a secreto, para el chequeo de
// placeholders — null si el match entero ya es inequívocamente un secreto
// (AWS key ID, tokens con prefijo, JWT, PEM: no tienen componente "nombre
// de variable" que pueda confundirse con el valor).
const PATRONES = [
  ["pem", /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----/g, null],
  ["aws_access_key_id", /\bAKIA[0-9A-Z]{16}\b/g, null],
  ["aws_secret_key", /\b(aws_secret_access_key|aws_secret_key)\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi, 2],
  ["github_token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, null],
  ["gitlab_token", /\bglpat-[A-Za-z0-9_-]{20,}\b/g, null],
  ["openai_key", /\bsk-(proj-)?[A-Za-z0-9_-]{20,}\b/g, null],
  ["slack_token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, null],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, null],
  ["conexion_db", /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s'"]+:[^@\s'"]+@[^\s'"]+/gi, null],
  // Asignación genérica de secreto: clave conocida = valor literal (no una
  // referencia a variable/env, no un placeholder obvio). Grupo 1 = nombre
  // de la clave (p.ej. "access_token"), grupo 2 = el valor — nunca al revés.
  ["asignacion_generica", /\b(secret|password|passwd|pwd|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*[:=]\s*['"]([^'"\s]{8,})['"]/gi, 2],
];

const PLACEHOLDERS = /^(your|yourkey|your_key|changeme|change_me|xxx+|<[^>]+>|\$\{[^}]+\}|process\.env|env\.|null|undefined|true|false|example|placeholder|todo|fixme)/i;

export function redactar(texto) {
  let resultado = texto;
  const conteo = {};
  for (const [tipo, regex, idxValor] of PATRONES) {
    resultado = resultado.replace(regex, (...args) => {
      const match = args[0];
      const valor = idxValor === null ? match : args[idxValor]; // args[i] = grupo i (1-indexado)
      if (PLACEHOLDERS.test(valor ?? "")) return match;
      conteo[tipo] = (conteo[tipo] ?? 0) + 1;
      return `<REDACTADO:${tipo}>`;
    });
  }
  const hallazgos = Object.entries(conteo).map(([tipo, cantidad]) => ({ tipo, cantidad }));
  return { texto: resultado, hallazgos };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd !== "redactar") {
    console.error("Uso: redactar <archivo> | redactar --stdin");
    process.exit(1);
  }
  const origen = args[0] === "--stdin" ? readFileSync(0, "utf8") : readFileSync(args[0], "utf8");
  const { texto, hallazgos } = redactar(origen);
  process.stdout.write(texto);
  if (hallazgos.length) {
    process.stderr.write(`\n[secretos] redactados: ${hallazgos.map((h) => `${h.tipo}×${h.cantidad}`).join(", ")}\n`);
  }
}
