// modos.mjs — políticas explícitas para controlar cuánto puede automatizar el núcleo.

export const MODOS = Object.freeze({
  SEGURO: "seguro",
  EQUILIBRADO: "equilibrado",
  AUTONOMO: "autonomo",
});

export const ACCIONES = Object.freeze({
  LECTURA: "lectura",
  PRUEBA: "prueba",
  ESCRITURA: "escritura",
  EXTERNA: "externa",
  DESTRUCTIVA: "destructiva",
  DEPLOY: "deploy",
  PUSH: "push",
});

const ALIAS_MODO = new Map([
  ["seguro", MODOS.SEGURO],
  ["safe", MODOS.SEGURO],
  ["equilibrado", MODOS.EQUILIBRADO],
  ["balanced", MODOS.EQUILIBRADO],
  ["autonomo", MODOS.AUTONOMO],
  ["autónomo", MODOS.AUTONOMO],
  ["autonomous", MODOS.AUTONOMO],
]);

const ACCIONES_MUTANTES = new Set([
  ACCIONES.ESCRITURA,
  ACCIONES.EXTERNA,
  ACCIONES.DESTRUCTIVA,
  ACCIONES.DEPLOY,
  ACCIONES.PUSH,
]);

function nivelValido(nivel) {
  return ["bajo", "medio", "alto"].includes(nivel) ? nivel : "medio";
}

export function normalizarModo(modo = MODOS.EQUILIBRADO) {
  const clave = String(modo).trim().toLowerCase();
  const normalizado = ALIAS_MODO.get(clave);
  if (!normalizado) {
    throw new Error(`modo inválido: ${modo}. Usa seguro, equilibrado o autonomo.`);
  }
  return normalizado;
}

export function normalizarAccion(accion = ACCIONES.LECTURA) {
  const valor = String(accion).trim().toLowerCase();
  if (!Object.values(ACCIONES).includes(valor)) {
    throw new Error(`acción inválida: ${accion}`);
  }
  return valor;
}

export function resolverPolitica({
  modo = MODOS.EQUILIBRADO,
  accion = ACCIONES.LECTURA,
  nivelRiesgo = "medio",
} = {}) {
  const modoNormalizado = normalizarModo(modo);
  const accionNormalizada = normalizarAccion(accion);
  const nivel = nivelValido(nivelRiesgo);
  const mutante = ACCIONES_MUTANTES.has(accionNormalizada);

  let requiereAprobacion = false;
  if (nivel === "alto") requiereAprobacion = true;
  if (modoNormalizado === MODOS.SEGURO && mutante) requiereAprobacion = true;
  if (modoNormalizado === MODOS.EQUILIBRADO && mutante) requiereAprobacion = true;
  if (modoNormalizado === MODOS.AUTONOMO && [ACCIONES.DESTRUCTIVA, ACCIONES.DEPLOY, ACCIONES.PUSH].includes(accionNormalizada)) {
    requiereAprobacion = true;
  }

  return {
    modo: modoNormalizado,
    accion: accionNormalizada,
    nivelRiesgo: nivel,
    requiereAprobacion,
    autoEjecutable: !requiereAprobacion,
    puedeLeer: true,
    puedeEscribir: modoNormalizado !== MODOS.SEGURO && !requiereAprobacion,
    motivo: requiereAprobacion
      ? "La política exige aprobación antes de ejecutar esta acción."
      : "La acción puede continuar dentro del modo seleccionado.",
  };
}

