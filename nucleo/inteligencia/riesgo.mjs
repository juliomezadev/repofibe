// riesgo.mjs — clasificación determinista y explicable de riesgo.

const quitarAcentos = (valor) => String(valor ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const REGLAS = [
  { clave: "destructivo", nivel: "alto", peso: 6, patrones: [/\b(eliminar|borrar|destruir|drop\s+table|rm\s+-rf|reset\s+--hard|git\s+clean|force[-\s]?push)\b/] },
  { clave: "produccion", nivel: "alto", peso: 5, patrones: [/\b(produccion|productivo|production|deploy|publicar|release)\b/] },
  { clave: "datos-sensibles", nivel: "alto", peso: 5, patrones: [/\b(datos?\s+personales?|credenciales?|secretos?|tokens?|pii|privacidad|vulnerabilidad|seguridad)\b/] },
  { clave: "legal-financiero", nivel: "alto", peso: 4, patrones: [/\b(legal|ley|contrato|impuestos?|facturacion|pago|financiero)\b/] },
  { clave: "cambio-codigo", nivel: "medio", peso: 2, patrones: [/\b(modificar|cambiar|implementar|construir|arreglar|corregir|refactorizar|editar)\b/] },
  { clave: "ejecucion", nivel: "medio", peso: 2, patrones: [/\b(ejecutar|instalar|migrar|actualizar|correr)\b/] },
  { clave: "integracion-externa", nivel: "medio", peso: 2, patrones: [/\b(api|externo|webhook|servicio|red)\b/] },
];

function textoDeEntrada(entrada) {
  if (typeof entrada === "string") return entrada;
  if (!entrada || typeof entrada !== "object") return "";
  return [
    entrada.objetivo,
    entrada.accion,
    ...(Array.isArray(entrada.alcance) ? entrada.alcance : []),
    ...(Array.isArray(entrada.restricciones) ? entrada.restricciones : []),
  ].filter(Boolean).join(" ");
}

export function clasificarRiesgo(entrada) {
  const texto = quitarAcentos(textoDeEntrada(entrada));
  const señales = [];
  for (const regla of REGLAS) {
    const coincidencia = regla.patrones.find((patron) => patron.test(texto));
    if (coincidencia) señales.push({ clave: regla.clave, nivel: regla.nivel, peso: regla.peso, evidencia: coincidencia.source });
  }
  const puntuacion = señales.reduce((total, señal) => total + señal.peso, 0);
  const nivel = puntuacion >= 5 ? "alto" : puntuacion >= 2 ? "medio" : "bajo";
  return {
    nivel,
    puntuacion,
    señales,
    requiereAprobacion: nivel === "alto",
    explicacion: señales.length ? "Clasificación basada en señales del objetivo y alcance." : "No se detectaron señales de riesgo operativo.",
  };
}

