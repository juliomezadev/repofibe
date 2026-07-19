// router.mjs — router pequeño, determinista y auditable por intención.

const quitarAcentos = (valor) => String(valor ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const INTENCIONES = new Set(["producto", "construccion", "debug", "revision", "qa", "seguridad", "legal", "release", "documentacion", "general"]);

const REGLAS = [
  { intencion: "seguridad", especialista: "seguridad", patrones: [/\b(seguridad|vulnerabilidad\w*|secretos?|credenciales?|prompt\s+injection|amenazas?)\b/] },
  { intencion: "legal", especialista: "legal", patrones: [/\b(legal|privacidad|datos?\s+personales?|leyes?|cumplimiento|contratos?)\b/] },
  { intencion: "release", especialista: "shipear", patrones: [/\b(deploy|publicar|release|ship|produccion|versionar)\b/] },
  { intencion: "qa", especialista: "qa", patrones: [/\b(qa|tests?|pruebas?|calidad|accesibilidad|e2e|regresi(?:on|ones))\b/] },
  { intencion: "debug", especialista: "investigar", patrones: [/\b(bugs?|errores?|fallas?|fallos?|no\s+funciona|debug|corregir|arreglar)\b/] },
  { intencion: "revision", especialista: "revisar", patrones: [/\b(revisar|revisi(?:on|ones)|review|auditar|audit|feedback)\b/] },
  { intencion: "documentacion", especialista: "docs", patrones: [/\b(documentar|documentaci(?:on|ones)|readme|manual(?:es)?|guias?)\b/] },
  { intencion: "construccion", especialista: "construir", patrones: [/\b(implementar|construir|crear|modificar|refactorizar|codigo|features?)\b/] },
  { intencion: "producto", especialista: "plan-ceo", patrones: [/\b(planes?|producto|usuarios?|alcance|prioridad(?:es)?|roadmap)\b/] },
];

function contextoDe(tarea) {
  return tarea && typeof tarea === "object" && tarea.contexto && typeof tarea.contexto === "object" ? tarea.contexto : {};
}

export function enrutar(tarea) {
  const objetivo = typeof tarea === "string" ? tarea : tarea?.objetivo;
  const contexto = typeof tarea === "string" ? {} : contextoDe(tarea);
  const explicita = typeof contexto.intencion === "string" ? contexto.intencion.trim().toLowerCase() : "";
  if (INTENCIONES.has(explicita)) {
    const regla = REGLAS.find((item) => item.intencion === explicita);
    return { version: 1, intencion: explicita, confianza: 1, señales: ["contexto.intencion"], especialista: regla?.especialista ?? "general" };
  }

  const texto = quitarAcentos(objetivo);
  const puntuados = REGLAS.map((regla, indice) => ({
    regla,
    indice,
    coincidencias: regla.patrones.filter((patron) => patron.test(texto)).length,
  })).filter((item) => item.coincidencias > 0)
    .sort((a, b) => b.coincidencias - a.coincidencias || a.indice - b.indice);
  if (!puntuados.length) return { version: 1, intencion: "general", confianza: 0.2, señales: [], especialista: "general" };
  const elegido = puntuados[0];
  const confianza = Math.min(0.95, 0.55 + elegido.coincidencias * 0.2);
  return {
    version: 1,
    intencion: elegido.regla.intencion,
    confianza,
    señales: elegido.regla.patrones.filter((patron) => patron.test(texto)).map((patron) => patron.source),
    especialista: elegido.regla.especialista,
  };
}

