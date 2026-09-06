#!/usr/bin/env node
// estado.mjs — estado de sprint explícito de repofibe.
// El pipeline pensar→planear→construir→revisar→probar→shipear→retro queda
// registrado en .fabrica/sprint.json para que cualquier sesión (o cualquier
// IDE) retome donde quedó.
//
// Uso:
//   node estado.mjs ver
//   node estado.mjs iniciar "<objetivo del sprint>"
//   node estado.mjs etapa <pensar|planear|construir|revisar|probar|shipear|retro|libre>
//   node estado.mjs registrar <skill> "<resultado en una línea>"
//   node estado.mjs pendiente "<texto>"
//   node estado.mjs resolver <número>

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";

const ETAPAS = ["pensar", "planear", "construir", "revisar", "probar", "shipear", "retro", "libre"];
const DIR = join(process.cwd(), ".fabrica");
const ARCHIVO = join(DIR, "sprint.json");

function esObjeto(valor) {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

export function validarEstado(valor) {
  const errores = [];
  if (!esObjeto(valor)) errores.push("la raíz debe ser un objeto");
  if (!esObjeto(valor)) return { valido: false, errores };

  if (typeof valor.objetivo !== "string" || !valor.objetivo.trim()) errores.push("objetivo debe ser texto no vacío");
  if (!ETAPAS.includes(valor.etapa)) errores.push(`etapa inválida: ${valor.etapa ?? "ausente"}`);
  if (!Array.isArray(valor.historial)) errores.push("historial debe ser una lista");
  else valor.historial.forEach((h, i) => {
    if (!esObjeto(h) || typeof h.fecha !== "string" || typeof h.skill !== "string" || typeof h.resultado !== "string") {
      errores.push(`historial[${i}] debe tener fecha, skill y resultado de texto`);
    }
  });
  if (!Array.isArray(valor.pendientes)) errores.push("pendientes debe ser una lista");
  else if (valor.pendientes.some((p) => typeof p !== "string")) errores.push("pendientes sólo puede contener texto");
  if (valor.version !== undefined && (!Number.isInteger(valor.version) || valor.version < 1)) errores.push("version inválida");
  if (valor.plan !== undefined && valor.plan !== null && typeof valor.plan !== "string") errores.push("plan debe ser texto o null");
  if (valor.creado !== undefined && valor.creado !== null && typeof valor.creado !== "string") errores.push("creado debe ser texto o null");
  if (valor.actualizado !== undefined && valor.actualizado !== null && typeof valor.actualizado !== "string") errores.push("actualizado debe ser texto o null");
  if (errores.length) return { valido: false, errores };

  // Migración sólo aditiva: los campos desconocidos viajan intactos.
  const estado = {
    ...valor,
    version: valor.version ?? 1,
    plan: valor.plan ?? null,
    creado: valor.creado ?? null,
    actualizado: valor.actualizado ?? null,
  };
  return { valido: true, estado, migrado: valor.version === undefined || valor.plan === undefined || valor.creado === undefined || valor.actualizado === undefined };
}

export function cargarEstado() {
  if (!existsSync(ARCHIVO)) return { tipo: "inexistente", estado: null };
  let valor;
  try { valor = JSON.parse(readFileSync(ARCHIVO, "utf8")); }
  catch (e) { return { tipo: "json-invalido", estado: null, error: e.message }; }
  const validacion = validarEstado(valor);
  if (!validacion.valido) return { tipo: "schema-invalido", estado: null, error: validacion.errores.join("; ") };
  return { tipo: "valido", estado: validacion.estado, migrado: validacion.migrado };
}

function guardar(estado) {
  mkdirSync(DIR, { recursive: true });
  estado.actualizado = new Date().toISOString();
  const tmp = ARCHIVO + ".tmp";
  writeFileSync(tmp, JSON.stringify(estado, null, 2) + "\n", "utf8");
  renameSync(tmp, ARCHIVO); // escritura atómica: nunca un JSON a medias
}

function nuevo(objetivo) {
  return {
    version: 1,
    objetivo,
    etapa: "pensar",
    plan: null,
    historial: [],
    pendientes: [],
    creado: new Date().toISOString(),
    actualizado: null,
  };
}

function ver(estado) {
  if (!estado) {
    console.log("Estado inexistente: no hay sprint activo. Inicia uno con: node estado.mjs iniciar \"<objetivo>\"");
    return;
  }
  console.log(`SPRINT: ${estado.objetivo}`);
  console.log(`ETAPA: ${estado.etapa}   (actualizado: ${estado.actualizado ?? "nunca"})`);
  if (estado.plan) console.log(`PLAN: ${estado.plan}`);
  const ult = estado.historial.slice(-5);
  if (ult.length) {
    console.log("ÚLTIMOS PASOS:");
    for (const h of ult) console.log(`  - [${h.fecha.slice(0, 16)}] ${h.skill}: ${h.resultado}`);
  }
  if (estado.pendientes.length) {
    console.log("PENDIENTES:");
    estado.pendientes.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  }
}

const [cmd, ...args] = process.argv.slice(2);
const cargado = cargarEstado();
const estado = cargado.estado;
if (cargado.tipo === "json-invalido" || cargado.tipo === "schema-invalido") {
  const etiqueta = cargado.tipo === "json-invalido" ? "JSON inválido" : "esquema inválido";
  console.error(`Estado ${etiqueta} (${cargado.tipo}): ${cargado.error}`);
  process.exit(1);
}

switch (cmd) {
  case "ver":
  case undefined:
    ver(estado);
    break;

  case "iniciar": {
    const objetivo = args.join(" ").trim();
    if (!objetivo) { console.error("Falta el objetivo."); process.exit(1); }
    if (estado && estado.etapa !== "retro" && estado.etapa !== "libre") {
      console.log(`AVISO: había un sprint activo ("${estado.objetivo}", etapa ${estado.etapa}). Se archiva en historial y se inicia el nuevo.`);
    }
    guardar(nuevo(objetivo));
    console.log(`Sprint iniciado: "${objetivo}" (etapa: pensar)`);
    break;
  }

  case "etapa": {
    const e = (args[0] || "").toLowerCase();
    if (!ETAPAS.includes(e)) { console.error(`Etapa inválida. Usa una de: ${ETAPAS.join(", ")}`); process.exit(1); }
    if (!estado) { console.error("Sin sprint activo. Usa 'iniciar' primero."); process.exit(1); }
    estado.etapa = e;
    guardar(estado);
    console.log(`Etapa → ${e}`);
    break;
  }

  case "registrar": {
    const [skill, ...resto] = args;
    const resultado = resto.join(" ").trim();
    if (!skill || !resultado) { console.error("Uso: registrar <skill> \"<resultado>\""); process.exit(1); }
    const st = estado ?? nuevo("(sin objetivo declarado)");
    st.historial.push({ fecha: new Date().toISOString(), skill, resultado });
    if (st.historial.length > 200) st.historial = st.historial.slice(-200);
    guardar(st);
    console.log(`Registrado: ${skill} — ${resultado}`);
    break;
  }

  case "pendiente": {
    const texto = args.join(" ").trim();
    if (!texto) { console.error("Falta el texto."); process.exit(1); }
    const st = estado ?? nuevo("(sin objetivo declarado)");
    st.pendientes.push(texto);
    guardar(st);
    console.log(`Pendiente #${st.pendientes.length} agregado.`);
    break;
  }

  case "resolver": {
    const n = parseInt(args[0], 10);
    if (!estado || !n || n < 1 || n > estado.pendientes.length) { console.error("Número de pendiente inválido."); process.exit(1); }
    const [hecho] = estado.pendientes.splice(n - 1, 1);
    guardar(estado);
    console.log(`Resuelto: ${hecho}`);
    break;
  }

  case "plan": {
    if (!estado) { console.error("Sin sprint activo."); process.exit(1); }
    estado.plan = args.join(" ").trim() || null;
    guardar(estado);
    console.log(`Plan → ${estado.plan ?? "(ninguno)"}`);
    break;
  }

  default:
    console.error(`Comando desconocido: ${cmd}. Usa: ver | iniciar | etapa | registrar | pendiente | resolver | plan`);
    process.exit(1);
}
