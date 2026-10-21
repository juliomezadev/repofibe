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
  ["aws_secret_key", /\b(aws_secret_access_key|aws_secret_key)["']?\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi, 2],
  ["github_token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, null],
  ["gitlab_token", /\bglpat-[A-Za-z0-9_-]{20,}\b/g, null],
  ["openai_key", /\bsk-(proj-)?[A-Za-z0-9_-]{20,}\b/g, null],
  ["slack_token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, null],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, null],
  ["conexion_db", /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s'"]+:[^@\s'"]+@[^\s'"]+/gi, null],
  // Asignación genérica de secreto: clave conocida = valor literal (no una
  // referencia a variable/env, no un placeholder obvio). El grupo 4 contiene
  // el valor candidato; las comillas opcionales de la clave permiten JSON.
  ["asignacion_generica", /(['"]?)(\b(?:secret|password|passwd|pwd|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b)\1\s*[:=]\s*(['"])([^'"\s]{8,})\3/gi, 4],
];

const PLACEHOLDERS = /^(your|yourkey|your_key|changeme|change_me|xxx+|<[^>]+>|\$\{[^}]+\}|process\.env|env\.|null|undefined|true|false|example|placeholder|todo|fixme)/i;
const CLAVE_SECRETA_JSON = /^(?:secret|password|passwd|pwd|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)$/i;

// Para JSON válido usamos sus límites léxicos, no una regex sobre el valor:
// una contraseña puede contener espacios, comillas escapadas o barras. Solo
// se sustituye el token JSON del valor; el resto del documento queda intacto.
function redactarDocumentoJson(texto) {
  try { JSON.parse(texto); } catch { return null; }

  let indice = 0;
  const rangos = [];
  const omitirEspacios = () => { while (/\s/.test(texto[indice] ?? "")) indice += 1; };
  const leerCadena = () => {
    const inicio = indice;
    if (texto[indice] !== '"') throw new Error("cadena JSON esperada");
    indice += 1;
    while (indice < texto.length) {
      if (texto[indice] === "\\") { indice += 2; continue; }
      if (texto[indice] === '"') {
        indice += 1;
        return { inicio, fin: indice, valor: JSON.parse(texto.slice(inicio, indice)) };
      }
      indice += 1;
    }
    throw new Error("cadena JSON sin cierre");
  };
  const recorrerValor = (clave = null) => {
    omitirEspacios();
    const caracter = texto[indice];
    if (caracter === '"') {
      const cadena = leerCadena();
      if (CLAVE_SECRETA_JSON.test(clave ?? "") && cadena.valor.length >= 8 && !PLACEHOLDERS.test(cadena.valor)) {
        rangos.push({ ...cadena, reemplazo: JSON.stringify("<REDACTADO:asignacion_generica>") });
      }
      return;
    }
    if (caracter === "{") {
      indice += 1;
      omitirEspacios();
      if (texto[indice] === "}") { indice += 1; return; }
      while (indice < texto.length) {
        omitirEspacios();
        const llave = leerCadena().valor;
        omitirEspacios();
        if (texto[indice] !== ":") throw new Error("separador JSON esperado");
        indice += 1;
        recorrerValor(llave);
        omitirEspacios();
        if (texto[indice] === "}") { indice += 1; return; }
        if (texto[indice] !== ",") throw new Error("coma JSON esperada");
        indice += 1;
      }
      throw new Error("objeto JSON sin cierre");
    }
    if (caracter === "[") {
      indice += 1;
      omitirEspacios();
      if (texto[indice] === "]") { indice += 1; return; }
      while (indice < texto.length) {
        recorrerValor();
        omitirEspacios();
        if (texto[indice] === "]") { indice += 1; return; }
        if (texto[indice] !== ",") throw new Error("coma JSON esperada");
        indice += 1;
      }
      throw new Error("lista JSON sin cierre");
    }
    while (indice < texto.length && !/[\s,\]}]/.test(texto[indice])) indice += 1;
    if (indice === 0) throw new Error("valor JSON esperado");
  };

  try {
    recorrerValor();
    omitirEspacios();
    if (indice !== texto.length) return null;
  } catch {
    return null;
  }

  let resultado = texto;
  for (const rango of rangos.reverse()) {
    resultado = resultado.slice(0, rango.inicio) + rango.reemplazo + resultado.slice(rango.fin);
  }
  return { texto: resultado, cantidad: rangos.length };
}

function redactarJsonOJsonl(texto) {
  const documento = redactarDocumentoJson(texto);
  if (documento) return documento;

  const partes = [];
  let inicio = 0;
  let cantidad = 0;
  let registros = 0;
  for (let i = 0; i < texto.length; i += 1) {
    if (texto[i] !== "\r" && texto[i] !== "\n") continue;
    const linea = texto.slice(inicio, i);
    const salto = texto[i] === "\r" && texto[i + 1] === "\n" ? "\r\n" : texto[i];
    const procesada = linea.trim() ? redactarDocumentoJson(linea) : null;
    if (linea.trim() && !procesada) return null;
    if (procesada) { partes.push(procesada.texto); cantidad += procesada.cantidad; registros += 1; }
    else partes.push(linea);
    partes.push(salto);
    if (salto.length === 2) i += 1;
    inicio = i + 1;
  }
  if (inicio < texto.length) {
    const linea = texto.slice(inicio);
    const procesada = linea.trim() ? redactarDocumentoJson(linea) : null;
    if (linea.trim() && !procesada) return null;
    if (procesada) { partes.push(procesada.texto); cantidad += procesada.cantidad; registros += 1; }
    else partes.push(linea);
  }
  return registros ? { texto: partes.join(""), cantidad } : null;
}

export function redactar(texto) {
  let resultado = texto;
  const conteo = {};
  for (const [tipo, regex, idxValor] of PATRONES) {
    resultado = resultado.replace(regex, (...args) => {
      const match = args[0];
      const valor = idxValor === null ? match : args[idxValor]; // args[i] = grupo i (1-indexado)
      if (PLACEHOLDERS.test(valor ?? "")) return match;
      conteo[tipo] = (conteo[tipo] ?? 0) + 1;
      const marcador = `<REDACTADO:${tipo}>`;
      if (idxValor === null) return marcador;
      // En asignaciones (incluido JSON/JSONL), conserva clave y delimitadores
      // y sustituye únicamente el valor para que el documento siga siendo válido.
      const inicioValor = match.lastIndexOf(valor);
      if (inicioValor < 0) return marcador;
      return `${match.slice(0, inicioValor)}${marcador}${match.slice(inicioValor + valor.length)}`;
    });
  }
  const json = redactarJsonOJsonl(resultado);
  if (json?.cantidad) {
    resultado = json.texto;
    conteo.asignacion_generica = (conteo.asignacion_generica ?? 0) + json.cantidad;
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
