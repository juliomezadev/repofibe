// evidencia.mjs — gates, estado y criterio de finalización verificable.

import { validarEvidencia, validarPlan, validarTarea } from "./contratos.mjs";
import { resolverPolitica } from "./modos.mjs";

const TRANSICIONES = new Map([
  ["propuesto", new Set(["en_curso", "bloqueado", "cancelado"])],
  ["en_curso", new Set(["en_curso", "bloqueado", "completado", "cancelado"])],
  ["bloqueado", new Set(["en_curso", "cancelado"])],
  ["completado", new Set()],
  ["cancelado", new Set()],
]);

export function validarTransicionEstado(desde, hacia) {
  const valido = TRANSICIONES.get(desde)?.has(hacia) ?? false;
  return { valido, errores: valido ? [] : [`transición no permitida: ${desde} → ${hacia}`] };
}

function evidenciaParaGate(gate, evidencias) {
  return evidencias.find((evidencia) => {
    if (evidencia.gateId !== gate.id || evidencia.exito !== true || !validarEvidencia(evidencia).valido) return false;
    if (gate.tipo === "aprobacion" && evidencia.tipo !== "aprobacion") return false;
    return true;
  });
}

export function validarEstado({ tarea, plan, evidencias = [] } = {}) {
  const errores = [];
  const advertencias = [];
  const faltantes = [];
  const tareaValida = validarTarea(tarea);
  const planValido = validarPlan(plan);
  errores.push(...tareaValida.errores, ...planValido.errores);
  if (tareaValida.valido && planValido.valido && plan.tareaId !== tarea.id) errores.push("plan.tareaId no coincide con tarea.id");
  if (!Array.isArray(evidencias)) errores.push("evidencias debe ser una lista");

  const evidenciasValidas = Array.isArray(evidencias) ? evidencias.map((evidencia) => validarEvidencia(evidencia)) : [];
  evidenciasValidas.forEach((resultado, indice) => {
    if (!resultado.valido) errores.push(`evidencia ${indice + 1}: ${resultado.errores.join(", ")}`);
  });

  if (planValido.valido && Array.isArray(plan.gates)) {
    for (const gate of plan.gates.filter((item) => item.requerido !== false)) {
      if (!evidenciaParaGate(gate, evidencias)) faltantes.push(gate.id);
    }
  }

  const nivelRiesgo = plan?.riesgo?.nivel ?? "medio";
  const politica = resolverPolitica({ modo: tarea?.modo, accion: plan?.accion ?? "lectura", nivelRiesgo });
  const requiereGateAprobacion = politica.requiereAprobacion;
  if (planValido.valido && plan?.estado === "completado" && requiereGateAprobacion) {
    const tieneGate = plan.gates.some((gate) => gate.requerido !== false && gate.tipo === "aprobacion");
    if (!tieneGate) faltantes.push("approval");
  }

  const pasosPendientes = planValido.valido && Array.isArray(plan.pasos)
    ? plan.pasos.filter((paso) => paso.estado !== "completado").map((paso) => paso.id)
    : [];
  if (plan?.estado === "completado" && pasosPendientes.length) errores.push(`pasos sin completar: ${pasosPendientes.join(", ")}`);
  if (plan?.estado !== "completado" && faltantes.length) advertencias.push("El plan aún necesita evidencia para poder completarse.");
  if (plan?.estado === "completado" && faltantes.length) errores.push(`falta evidencia para gates: ${faltantes.join(", ")}`);

  const requeridos = planValido.valido && Array.isArray(plan.gates) ? plan.gates.filter((gate) => gate.requerido !== false) : [];
  const cubiertos = requeridos.filter((gate) => evidenciaParaGate(gate, evidencias)).length;
  const coberturaGates = requeridos.length ? cubiertos / requeridos.length : 1;
  const completo = plan?.estado === "completado" && errores.length === 0 && faltantes.length === 0 && pasosPendientes.length === 0;
  if (completo) advertencias.push("Estado completado respaldado por evidencia registrada.");

  return {
    valido: errores.length === 0 && (plan?.estado !== "completado" || completo),
    completo,
    estado: plan?.estado ?? null,
    errores,
    advertencias,
    faltantes,
    pasosPendientes,
    coberturaGates,
    politica,
  };
}

