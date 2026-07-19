// router.mjs — router pequeño, determinista y auditable por intención.

const quitarAcentos = (valor) => String(valor ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const INTENCIONES = new Set(["producto", "construccion", "debug", "revision", "qa", "seguridad", "legal", "release", "documentacion", "general"]);

const REGLAS = [
  { intencion: "seguridad", especialista: "seguridad", patrones: [/\b(seguridad|vulnerabilidad|secreto|credencial|prompt\s+injection|amenaza)\b/] },
  { intencion: "legal", especialista: "legal", patrones: [/\b(legal|privacidad|datos?\s+personales?|ley|cumplimiento|contrato)\b/] },
  { intencion: "release", especialista: "shipear", patrones: [/\b(deploy|publicar|release|ship|produccion|versionar)\b/] },
  { intencion: "qa", especialista: "qa", patrones: [/\b(qa|test|prueba|calidad|accesibilidad|e2e|regresion)\b/] },
  { intencion: "debug", especialista: "investigar", patrones: [/\b(bug|error|falla|fallo|no\s+funciona|debug|corregir|arreglar)\b/] },
  { intencion: "revision", especialista: "revisar", patrones: [/\b(revisar|revision|review|auditar|audit|feedback)\b/] },
  { intencion: "documentacion", especialista: "docs", patrones: [/\b(documentar|documentacion|readme|manual|guia)\b/] },
  { intencion: "construccion", especialista: "construir", patrones: [/\b(implementar|construir|crear|modificar|refactorizar|codigo|feature)\b/] },
  { intencion: "producto", especialista: "plan-ceo", patrones: [/\b(plan|producto|usuario|alcance|prioridad|roadmap)\b/] },
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

