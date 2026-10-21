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

import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { conBloqueoExclusivoSync, escribirAtomicoSync } from "./persistencia.mjs";

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
  escribirAtomicoSync(ARCHIVO, JSON.stringify(estado, null, 2) + "\n");
}

function errorDeEstado(cargado) {
  const etiqueta = cargado.tipo === "json-invalido" ? "JSON inválido" : "esquema inválido";
  return new Error(`Estado ${etiqueta} (${cargado.tipo}): ${cargado.error}`);
}

function cargarParaMutar() {
  const cargado = cargarEstado();
  if (cargado.tipo === "json-invalido" || cargado.tipo === "schema-invalido") throw errorDeEstado(cargado);
  return cargado;
}

function transaccion(mutador) {
  return conBloqueoExclusivoSync(`${ARCHIVO}.lock`, () => mutador(cargarParaMutar()));
}

function archivarSprintAnterior() {
  const bytes = readFileSync(ARCHIVO);
  const identidad = createHash("sha256").update(bytes).digest("hex");
  const directorio = join(DIR, "sprints");
  const archivo = join(directorio, `${identidad}.json`);
  mkdirSync(directorio, { recursive: true });
  if (existsSync(archivo)) {
    if (!readFileSync(archivo).equals(bytes)) throw new Error(`Colisión de identidad al archivar sprint: ${archivo}`);
  } else {
    // Conserva el documento original, incluidos campos desconocidos y bytes.
    escribirAtomicoSync(archivo, bytes);
  }
  return identidad;
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

try {
  switch (cmd) {
    case "ver":
    case undefined: {
      const cargado = cargarEstado();
      if (cargado.tipo === "json-invalido" || cargado.tipo === "schema-invalido") throw errorDeEstado(cargado);
      ver(cargado.estado);
      break;
    }

    case "iniciar": {
      const objetivo = args.join(" ").trim();
      if (!objetivo) throw new Error("Falta el objetivo.");
      const salida = transaccion(({ estado }) => {
        const aviso = estado && estado.etapa !== "retro" && estado.etapa !== "libre"
          ? `AVISO: había un sprint activo ("${estado.objetivo}", etapa ${estado.etapa}). Se conserva en .fabrica/sprints/.`
          : null;
        if (estado) archivarSprintAnterior();
        guardar(nuevo(objetivo));
        return { aviso, objetivo };
      });
      if (salida.aviso) console.log(salida.aviso);
      console.log(`Sprint iniciado: "${salida.objetivo}" (etapa: pensar)`);
      break;
    }

    case "etapa": {
      const etapa = (args[0] || "").toLowerCase();
      if (!ETAPAS.includes(etapa)) throw new Error(`Etapa inválida. Usa una de: ${ETAPAS.join(", ")}`);
      transaccion(({ estado }) => {
        if (!estado) throw new Error("Sin sprint activo. Usa 'iniciar' primero.");
        estado.etapa = etapa;
        guardar(estado);
      });
      console.log(`Etapa → ${etapa}`);
      break;
    }

    case "registrar": {
      const [skill, ...resto] = args;
      const resultado = resto.join(" ").trim();
      if (!skill || !resultado) throw new Error("Uso: registrar <skill> \"<resultado>\"");
      transaccion(({ estado }) => {
        const actual = estado ?? nuevo("(sin objetivo declarado)");
        actual.historial.push({ fecha: new Date().toISOString(), skill, resultado });
        if (actual.historial.length > 200) actual.historial = actual.historial.slice(-200);
        guardar(actual);
      });
      console.log(`Registrado: ${skill} — ${resultado}`);
      break;
    }

    case "pendiente": {
      const texto = args.join(" ").trim();
      if (!texto) throw new Error("Falta el texto.");
      const cantidad = transaccion(({ estado }) => {
        const actual = estado ?? nuevo("(sin objetivo declarado)");
        actual.pendientes.push(texto);
        guardar(actual);
        return actual.pendientes.length;
      });
      console.log(`Pendiente #${cantidad} agregado.`);
      break;
    }

    case "resolver": {
      const n = parseInt(args[0], 10);
      const hecho = transaccion(({ estado }) => {
        if (!estado || !n || n < 1 || n > estado.pendientes.length) throw new Error("Número de pendiente inválido.");
        const [resuelto] = estado.pendientes.splice(n - 1, 1);
        guardar(estado);
        return resuelto;
      });
      console.log(`Resuelto: ${hecho}`);
      break;
    }

    case "plan": {
      const plan = args.join(" ").trim() || null;
      transaccion(({ estado }) => {
        if (!estado) throw new Error("Sin sprint activo.");
        estado.plan = plan;
        guardar(estado);
      });
      console.log(`Plan → ${plan ?? "(ninguno)"}`);
      break;
    }

    default:
      throw new Error(`Comando desconocido: ${cmd}. Usa: ver | iniciar | etapa | registrar | pendiente | resolver | plan`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
