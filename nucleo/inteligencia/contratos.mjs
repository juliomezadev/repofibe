// contratos.mjs — contratos JSON estables para tarea, plan y evidencia.

import { randomUUID } from "node:crypto";
import { MODOS, normalizarModo } from "./modos.mjs";

export const VERSION_CONTRATO = 1;
export const ESTADOS_PLAN = Object.freeze(["propuesto", "en_curso", "bloqueado", "completado", "cancelado"]);
export const TIPOS_EVIDENCIA = Object.freeze(["comando", "prueba", "inspeccion", "aprobacion", "revision", "resultado"]);
export const NIVELES_CONFIANZA = Object.freeze(["baja", "media", "alta"]);

const ahora = () => new Date().toISOString();
const idNuevo = (prefijo) => `${prefijo}-${randomUUID()}`;
const esObjeto = (valor) => valor !== null && typeof valor === "object" && !Array.isArray(valor);

function textoObligatorio(valor, campo) {
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`${campo} es obligatorio`);
  return valor.trim();
}

function listaStrings(valor, campo) {
  if (valor === undefined) return [];
  if (!Array.isArray(valor) || valor.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${campo} debe ser una lista de textos`);
  }
  return valor.map((item) => item.trim());
}

function crearPaso(paso, indice) {
  if (typeof paso === "string") {
    return { id: `p-${indice + 1}`, descripcion: textoObligatorio(paso, "paso"), estado: "pendiente", requiereAprobacion: false };
  }
  if (!esObjeto(paso)) throw new Error(`paso ${indice + 1} inválido`);
  return {
    id: typeof paso.id === "string" && paso.id.trim() ? paso.id.trim() : `p-${indice + 1}`,
    descripcion: textoObligatorio(paso.descripcion, `paso ${indice + 1}.descripcion`),
    estado: paso.estado ?? "pendiente",
    requiereAprobacion: paso.requiereAprobacion === true,
  };
}

function crearGate(gate, indice) {
  if (typeof gate === "string") {
    return { id: gate.trim(), tipo: "resultado", descripcion: gate.trim(), requerido: true };
  }
  if (!esObjeto(gate)) throw new Error(`gate ${indice + 1} inválido`);
  return {
    id: textoObligatorio(gate.id, `gate ${indice + 1}.id`),
    tipo: gate.tipo ?? "resultado",
    descripcion: textoObligatorio(gate.descripcion, `gate ${indice + 1}.descripcion`),
    requerido: gate.requerido !== false,
  };
}

export function crearTarea({
  id = idNuevo("tarea"),
  objetivo,
  alcance = [],
  contexto = {},
  restricciones = [],
  modo = MODOS.EQUILIBRADO,
  creado = ahora(),
} = {}) {
  const tarea = {
    version: VERSION_CONTRATO,
    id: textoObligatorio(id, "id"),
    objetivo: textoObligatorio(objetivo, "objetivo"),
    alcance: listaStrings(alcance, "alcance"),
    contexto: esObjeto(contexto) ? contexto : (() => { throw new Error("contexto debe ser un objeto"); })(),
    restricciones: listaStrings(restricciones, "restricciones"),
    modo: normalizarModo(modo),
    creado,
  };
  return tarea;
}

export function crearPlan({
  id = idNuevo("plan"),
  tarea,
  tareaId = tarea?.id,
  intencion = "general",
  riesgo = null,
  modo = tarea?.modo ?? MODOS.EQUILIBRADO,
  accion = "lectura",
  pasos = [],
  gates = [],
  criteriosFinalizacion = [],
  creado = ahora(),
} = {}) {
  const plan = {
    version: VERSION_CONTRATO,
    id: textoObligatorio(id, "id"),
    tareaId: textoObligatorio(tareaId, "tareaId"),
    intencion: textoObligatorio(intencion, "intencion"),
    riesgo,
    modo: normalizarModo(modo),
    accion,
    estado: "propuesto",
    pasos: pasos.map(crearPaso),
    gates: gates.map(crearGate),
    criteriosFinalizacion: listaStrings(criteriosFinalizacion, "criteriosFinalizacion"),
    creado,
  };
  return plan;
}

export function crearEvidencia({
  id = idNuevo("evidencia"),
  gateId = null,
  tipo = "resultado",
  fuente,
  resultado = null,
  exito,
  exitCode = null,
  archivos = [],
  confianza = "media",
  timestamp = ahora(),
} = {}) {
  const evidencia = {
    version: VERSION_CONTRATO,
    id: textoObligatorio(id, "id"),
    gateId: gateId === null ? null : textoObligatorio(gateId, "gateId"),
    tipo,
    fuente: textoObligatorio(fuente, "fuente"),
    resultado,
    exito,
    exitCode,
    archivos: listaStrings(archivos, "archivos"),
    confianza,
    timestamp,
  };
  const validacion = validarEvidencia(evidencia);
  if (!validacion.valido) throw new Error(validacion.errores.join("; "));
  return evidencia;
}

export function validarTarea(tarea) {
  const errores = [];
  if (!esObjeto(tarea)) return { valido: false, errores: ["tarea debe ser un objeto"] };
  if (tarea.version !== VERSION_CONTRATO) errores.push("versión de tarea inválida");
  if (typeof tarea.id !== "string" || !tarea.id.trim()) errores.push("tarea.id es obligatorio");
  if (typeof tarea.objetivo !== "string" || !tarea.objetivo.trim()) errores.push("tarea.objetivo es obligatorio");
  try { normalizarModo(tarea.modo); } catch { errores.push("tarea.modo inválido"); }
  if (!Array.isArray(tarea.alcance)) errores.push("tarea.alcance debe ser una lista");
  if (!esObjeto(tarea.contexto)) errores.push("tarea.contexto debe ser un objeto");
  if (!Array.isArray(tarea.restricciones)) errores.push("tarea.restricciones debe ser una lista");
  return { valido: errores.length === 0, errores };
}

export function validarPlan(plan) {
  const errores = [];
  if (!esObjeto(plan)) return { valido: false, errores: ["plan debe ser un objeto"] };
  if (plan.version !== VERSION_CONTRATO) errores.push("versión de plan inválida");
  if (typeof plan.id !== "string" || !plan.id.trim()) errores.push("plan.id es obligatorio");
  if (typeof plan.tareaId !== "string" || !plan.tareaId.trim()) errores.push("plan.tareaId es obligatorio");
  if (!ESTADOS_PLAN.includes(plan.estado)) errores.push("plan.estado inválido");
  try { normalizarModo(plan.modo); } catch { errores.push("plan.modo inválido"); }
  if (!Array.isArray(plan.pasos)) errores.push("plan.pasos debe ser una lista");
  if (!Array.isArray(plan.gates)) errores.push("plan.gates debe ser una lista");
  if (Array.isArray(plan.pasos)) {
    const ids = new Set();
    plan.pasos.forEach((paso, indice) => {
      if (!esObjeto(paso) || typeof paso.id !== "string" || !paso.id.trim()) errores.push(`paso ${indice + 1} sin id`);
      if (!esObjeto(paso) || typeof paso.descripcion !== "string" || !paso.descripcion.trim()) errores.push(`paso ${indice + 1} sin descripción`);
      if (esObjeto(paso) && ids.has(paso.id)) errores.push(`paso duplicado: ${paso.id}`);
      if (esObjeto(paso)) ids.add(paso.id);
      if (esObjeto(paso) && !["pendiente", "en_curso", "completado", "bloqueado"].includes(paso.estado)) errores.push(`estado de paso inválido: ${paso.id}`);
    });
  }
  if (Array.isArray(plan.gates)) plan.gates.forEach((gate, indice) => {
    if (!esObjeto(gate) || typeof gate.id !== "string" || !gate.id.trim()) errores.push(`gate ${indice + 1} sin id`);
    if (!esObjeto(gate) || typeof gate.descripcion !== "string" || !gate.descripcion.trim()) errores.push(`gate ${indice + 1} sin descripción`);
  });
  return { valido: errores.length === 0, errores };
}

export function validarEvidencia(evidencia) {
  const errores = [];
  if (!esObjeto(evidencia)) return { valido: false, errores: ["evidencia debe ser un objeto"] };
  if (evidencia.version !== VERSION_CONTRATO) errores.push("versión de evidencia inválida");
  if (typeof evidencia.id !== "string" || !evidencia.id.trim()) errores.push("evidencia.id es obligatorio");
  if (!TIPOS_EVIDENCIA.includes(evidencia.tipo)) errores.push("evidencia.tipo inválido");
  if (typeof evidencia.fuente !== "string" || !evidencia.fuente.trim()) errores.push("evidencia.fuente es obligatoria");
  if (typeof evidencia.exito !== "boolean") errores.push("evidencia.exito debe ser booleano");
  if (evidencia.exitCode !== null && (!Number.isInteger(evidencia.exitCode) || evidencia.exitCode < 0)) errores.push("evidencia.exitCode inválido");
  if (evidencia.exito === true && evidencia.exitCode !== null && evidencia.exitCode !== 0) errores.push("evidencia exitosa no puede tener exitCode distinto de cero");
  if (!Array.isArray(evidencia.archivos)) errores.push("evidencia.archivos debe ser una lista");
  if (!NIVELES_CONFIANZA.includes(evidencia.confianza)) errores.push("evidencia.confianza inválida");
  if (typeof evidencia.timestamp !== "string" || !evidencia.timestamp.trim()) errores.push("evidencia.timestamp es obligatorio");
  return { valido: errores.length === 0, errores };
}

