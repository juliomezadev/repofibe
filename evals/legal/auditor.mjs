#!/usr/bin/env node
// evals/legal/auditor.mjs — prueba el cinturón de seguridad de /legal.
//
// La eval legal existente valida el TEXTO de SKILL.md (que la skill diga las
// cosas correctas). Esta valida el COMPORTAMIENTO: que una respuesta legal
// alucinada sea detenida por código, no por la buena voluntad del modelo.
//
// Es la diferencia que importa cuando la skill la ejecuta un modelo débil.

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { auditarRespuesta, registrarCifra, cifrasVerificadas } from "../../nucleo/legal.mjs";

const fallos = [];
const fallo = (m) => fallos.push(m);
const ok = (m) => console.log(`  ok: ${m}`);
const tmp = mkdtempSync(join(tmpdir(), "repofibe-legal-"));

// ── 1. La alucinación típica de un modelo débil debe ser detenida ──────────
{
  // Escrita como la escribiría un modelo que "quiere ayudar": segura,
  // específica, plausible, y con cada dato inventado.
  const alucinada = [
    "Según el artículo 64 del Código Sustantivo del Trabajo, te corresponde",
    "una indemnización de $4.500.000 por despido sin justa causa.",
    "El salario mínimo vigente es de 1.300.000 pesos mensuales.",
    "El recargo nocturno es del 35% y sigue vigente para este año.",
  ].join("\n");

  const r = auditarRespuesta(alucinada, { cifras: [] });
  if (r.ok) fallo("el auditor aprobó una respuesta con artículo, montos, porcentaje y vigencia inventados");
  else {
    const tipos = new Set(r.riesgos.map((x) => x.tipo));
    const faltan = ["articulo", "monto", "porcentaje", "vigencia"].filter((t) => !tipos.has(t));
    if (faltan.length) fallo(`el auditor no detectó: ${faltan.join(", ")}`);
    else ok(`detiene la alucinación típica: ${r.resumen}`);
  }
}

// ── 2. Sin falsos positivos sobre una respuesta bien marcada ──────────────
// Un auditor que acusa a las respuestas correctas se desactiva a la semana.
{
  const correcta = [
    "Sobre tu caso, primero lo que pude verificar:",
    "El salario mínimo para 2026 es 1.300.000 [verificado: mintrabajo.gov.co 2026-07-25]",
    "Tu contrato pactó un salario de 2.000.000 [del documento]",
    "La indemnización dependería del artículo 64 del CST [no verificado] — necesito confirmar",
    "el texto vigente antes de afirmarlo, porque las reformas cambian la fórmula.",
    "",
    "Para calcularla necesito saber la fecha exacta de terminación.",
  ].join("\n");

  const r = auditarRespuesta(correcta, { cifras: [] });
  if (!r.ok) {
    fallo(`falso positivo sobre respuesta bien marcada: ${r.riesgos.map((x) => `${x.tipo}("${x.fragmento}")`).join(", ")}`);
  } else ok("no acusa a una respuesta que declara su procedencia línea por línea");
}

// ── 3. Contradecir una cifra ya verificada es CRÍTICO ─────────────────────
{
  registrarCifra({
    concepto: "salario mínimo",
    anio: 2026,
    valor: 1500000,
    fuente: "https://www.mintrabajo.gov.co/decreto-smlmv",
    fechaConsulta: "2026-07-25",
  }, { raiz: tmp });

  const texto = "El salario mínimo de 2026 es de 1.300.000 pesos.";
  const r = auditarRespuesta(texto, { anio: 2026, raiz: tmp });
  const critico = r.riesgos.find((x) => x.tipo === "contradice-verificado");
  if (!critico) fallo("no detectó que la respuesta contradice una cifra ya verificada por el usuario");
  else if (critico.gravedad !== "critico") fallo(`la contradicción debería ser crítica, fue "${critico.gravedad}"`);
  else ok("detecta cuando el borrador contradice una cifra verificada (crítico)");
}

// ── 4. El registro solo acepta procedencia completa y oficial ─────────────
{
  let rechazoBlog = false, rechazoIncompleto = false;
  try {
    registrarCifra({ concepto: "smlmv", anio: 2026, valor: 1, fuente: "https://blog-laboral.com/x", fechaConsulta: "2026-07-25" }, { raiz: tmp });
  } catch { rechazoBlog = true; }
  try {
    registrarCifra({ concepto: "smlmv", anio: 2026, valor: 1, fuente: "https://www.mintrabajo.gov.co/x" }, { raiz: tmp });
  } catch { rechazoIncompleto = true; }

  if (!rechazoBlog) fallo("aceptó registrar una cifra citando un blog como fuente");
  else if (!rechazoIncompleto) fallo("aceptó registrar una cifra sin fecha de consulta");
  else ok("el registro rechaza fuentes no oficiales y procedencia incompleta");
}

// ── 5. El registro empieza VACÍO, a propósito ────────────────────────────
// Precargarlo con el SMLMV "de memoria" sería cometer exactamente el error
// que este módulo existe para impedir. Además las cifras caducan cada año.
{
  const limpio = mkdtempSync(join(tmpdir(), "repofibe-legal-vacio-"));
  const c = cifrasVerificadas(undefined, { raiz: limpio });
  if (c.length !== 0) fallo(`el registro viene precargado con ${c.length} cifra(s) sin que nadie las verificara`);
  else ok("el registro empieza vacío: ninguna cifra entra sin que alguien la verifique");
  rmSync(limpio, { recursive: true, force: true });
}

// ── 6. Casos límite que NO deben acusarse ────────────────────────────────
// El bloque de código y la cita son formatos donde el texto es ilustrativo.
{
  const conFormato = [
    "```",
    "artículo 64 y $1.000.000 dentro de un bloque de código",
    "```",
    "> cita del usuario con $2.000.000 y artículo 22",
  ].join("\n");

  const r = auditarRespuesta(conFormato, { cifras: [] });
  if (!r.ok) fallo(`acusa texto dentro de bloque de código o cita: ${r.riesgos.map((x) => x.tipo).join(", ")}`);
  else ok("ignora bloques de código y citas (texto ilustrativo, no afirmación)");
}

rmSync(tmp, { recursive: true, force: true });

if (fallos.length) {
  console.error(`\nFALLOS (${fallos.length}):`);
  for (const f of fallos) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("ok: auditor legal verificado (detiene alucinaciones, sin falsos positivos, registro con procedencia obligatoria)");
