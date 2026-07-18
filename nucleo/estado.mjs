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

function cargar() {
  try {
    return JSON.parse(readFileSync(ARCHIVO, "utf8"));
  } catch {
    return null;
  }
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
    console.log("Sin sprint activo. Inicia uno con: node estado.mjs iniciar \"<objetivo>\"");
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
const estado = cargar();

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
