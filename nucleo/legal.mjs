#!/usr/bin/env node
// legal.mjs — auditor determinista de respuestas legales.
//
// ── El problema que resuelve ────────────────────────────────────────────────
// `/legal` era 100% clase 3: todas sus garantías vivían en el prompt de
// SKILL.md ("nunca inventes cifras", "verifica antes de afirmar"). Un modelo
// potente lo cumple casi siempre; uno débil lo cumple a medias. Y en materia
// legal, "a medias" significa una cifra o un artículo inventado que suena
// perfectamente creíble — el daño real al usuario que la skill promete evitar.
//
// Ninguna cantidad de texto en el prompt arregla eso. Lo que lo arregla es
// bajar la garantía a clase 1: la IA redacta, y este módulo AUDITA el
// borrador antes de que llegue al usuario. Funciona igual con cualquier
// modelo, porque no depende de que el modelo se acuerde de nada.
//
// ── El contrato de marcas ───────────────────────────────────────────────────
// Toda afirmación de riesgo (monto, porcentaje, artículo, ley, vigencia) debe
// llevar en su línea una de estas marcas:
//
//   [verificado: <fuente> <fecha>]  consultado en fuente oficial
//   [del documento]                 sale del documento que aportó el usuario
//   [no verificado]                 declarado explícitamente como incierto
//
// Sin marca = riesgo. No se juzga si el dato es correcto —eso no lo puede
// saber un regex— sino si el borrador declara de dónde salió. Una afirmación
// legal sin procedencia es exactamente lo que no debe entregarse.
//
// ── Lo que este módulo NO hace ──────────────────────────────────────────────
// No sabe derecho. No tiene una base de normas. No valida que el artículo 64
// diga lo que dices que dice. Detecta afirmaciones sin procedencia y
// contradicciones contra cifras que el usuario ya verificó. Es un cinturón de
// seguridad, no un abogado.
//
// Uso:
//   node nucleo/legal.mjs auditar <archivo.md>
//   node nucleo/legal.mjs cifras [año]
//   node nucleo/legal.mjs registrar <concepto> <año> <valor> <fuente> <fecha>

import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";

// Mismo allowlist que SKILL.md: una cifra "verificada" contra un blog no está
// verificada. La procedencia tiene que ser oficial o no cuenta.
export const FUENTES_OFICIALES = [
  "mintrabajo.gov.co",
  "funcionpublica.gov.co",
  "cortesuprema.gov.co",
  "corteconstitucional.gov.co",
  "dane.gov.co",
  "sic.gov.co",
  "suin-juriscol.gov.co",
  "dian.gov.co",
  "secretariasenado.gov.co",
];

export function rutaRegistro(raiz) {
  return join(raiz || process.cwd(), ".fabrica", "legal-verificado.jsonl");
}

// ── Registro de cifras verificadas ─────────────────────────────────────────
// No es una base de datos de derecho: es la libreta de lo que YA se verificó,
// con su procedencia. Deliberadamente empieza vacía. Precargarla con cifras
// "de memoria" sería cometer el error que el módulo existe para impedir.
export function registrarCifra({ concepto, anio, valor, fuente, fechaConsulta }, opciones = {}) {
  for (const [campo, v] of Object.entries({ concepto, anio, valor, fuente, fechaConsulta })) {
    if (v === undefined || v === null || String(v).trim() === "") {
      throw new Error(`falta "${campo}": una cifra sin procedencia completa no se registra.`);
    }
  }
  const host = String(fuente).replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
  if (!FUENTES_OFICIALES.some((f) => host === f || host.endsWith("." + f))) {
    throw new Error(`fuente no oficial: "${host}". Solo se registran cifras verificadas en: ${FUENTES_OFICIALES.join(", ")}`);
  }

  const entrada = {
    concepto: String(concepto).trim().toLowerCase(),
    anio: Number(anio),
    valor: Number(String(valor).replace(/[^\d]/g, "")),
    fuente: String(fuente),
    fechaConsulta: String(fechaConsulta),
    ts: Date.now(),
  };
  const archivo = rutaRegistro(opciones.raiz);
  mkdirSync(dirname(archivo), { recursive: true });
  appendFileSync(archivo, JSON.stringify(entrada) + "\n", "utf8");
  return entrada;
}

export function cifrasVerificadas(anio, opciones = {}) {
  const archivo = rutaRegistro(opciones.raiz);
  if (!existsSync(archivo)) return [];
  const todas = readFileSync(archivo, "utf8").split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
  return anio ? todas.filter((c) => c.anio === Number(anio)) : todas;
}

// ── Detección ───────────────────────────────────────────────────────────────
const MARCA = /\[(?:verificado:[^\]]*|del documento|no verificado)\]/i;

// Pistas de que lo que sigue se NIEGA o se PROHÍBE en vez de afirmarse.
// Limitación conocida y aceptada: solo mira la misma línea. Un documento que
// DISCUTE el contrato bajo un encabezado "PROHIBIDO:" (como el propio
// SKILL.md) seguirá produciendo falsos positivos — el auditor está hecho para
// borradores de respuesta, no para textos que hablan de sí mismos. Añadir
// análisis de contexto multilínea con regex crearía más falsos positivos de
// los que quitaría.
const NEGACION = /\b(?:no|nunca|jam[áa]s|sin|prohibido|proh[íi]be|evita|evitar|abst[ée]n\w*)\b/i;

// Cada patrón describe una afirmación que, sin procedencia, puede hacer daño.
const PATRONES = [
  {
    tipo: "monto",
    gravedad: "alto",
    re: /(?:\$\s?\d[\d.,]*|\b\d{1,3}(?:\.\d{3})+\b)/g,
    razon: "un monto sin procedencia es la falla más dañina: el usuario puede reclamar o aceptar una cifra falsa",
  },
  {
    tipo: "porcentaje",
    gravedad: "alto",
    re: /\b\d{1,3}(?:[.,]\d+)?\s*%/g,
    razon: "los recargos y porcentajes laborales cambian por ley; sin fuente no se afirman",
  },
  {
    tipo: "articulo",
    gravedad: "alto",
    re: /\bart[íi]culos?\.?\s*\d+/gi,
    razon: "citar un número de artículo de memoria es la alucinación legal clásica",
  },
  {
    tipo: "norma",
    gravedad: "medio",
    re: /\b(?:ley|decreto|resoluci[óo]n|sentencia)\s+[\w.-]*\d+[\w.-]*\s*(?:de\s*)?\d{4}/gi,
    razon: "el número y año de la norma deben salir de fuente oficial, no de memoria",
  },
  {
    tipo: "vigencia",
    gravedad: "medio",
    // Solo formas ASERTIVAS. La primera versión marcaba "vigente" a secas y
    // acusaba a "necesito confirmar el texto vigente" — una frase que
    // CUESTIONA la vigencia, justo lo que la skill debe hacer. Un auditor que
    // castiga la conducta correcta se desactiva a la semana.
    re: /\b(?:sigue|está|se mantiene|continúa)\s+vigente\b|\bactualmente\s+rige\b|\bentr[óo]\s+en\s+vigencia\b|\ba\s+partir\s+de\s+\d{4}\b/gi,
    razon: "afirmar vigencia sin verificar ignora reformas, derogatorias e inexequibilidades",
  },
];

/**
 * Audita un borrador de respuesta legal.
 * @returns {{ok:boolean, riesgos:Array, resumen:string}}
 */
export function auditarRespuesta(texto, opciones = {}) {
  const riesgos = [];
  const lineas = String(texto).split("\n");
  let dentroDeCodigo = false;

  lineas.forEach((linea, i) => {
    // Los bloques de código hay que rastrearlos por ESTADO, no por línea: la
    // primera versión solo saltaba la línea del cerco ``` y auditaba todo el
    // contenido de adentro, acusando ejemplos ilustrativos.
    if (/^\s*```/.test(linea)) { dentroDeCodigo = !dentroDeCodigo; return; }
    if (dentroDeCodigo) return;

    // Citas (`>`) y filas de tabla (`|`): texto ilustrativo o del usuario.
    if (/^\s*(?:>|\|)/.test(linea)) return;
    if (MARCA.test(linea)) return;

    for (const p of PATRONES) {
      p.re.lastIndex = 0;
      for (const m of linea.matchAll(p.re)) {
        // Negación en la misma línea: "no puedo afirmar que esté vigente" o
        // "sin verificar el artículo 64" NIEGAN la afirmación, no la hacen.
        // Castigar la conducta correcta es la forma más rápida de que alguien
        // apague el auditor.
        if (NEGACION.test(linea.slice(0, m.index))) continue;

        riesgos.push({
          tipo: p.tipo,
          gravedad: p.gravedad,
          linea: i + 1,
          fragmento: m[0].trim(),
          contexto: linea.trim().slice(0, 120),
          razon: p.razon,
        });
      }
    }
  });

  // Contradicción contra lo ya verificado: gravedad crítica. Si el usuario
  // verificó el SMLMV de este año y el borrador dice otra cosa, no es una
  // afirmación sin fuente — es una afirmación contra la evidencia.
  const verificadas = opciones.cifras ?? cifrasVerificadas(opciones.anio, opciones);
  for (const c of verificadas) {
    lineas.forEach((linea, i) => {
      if (!linea.toLowerCase().includes(c.concepto)) return;
      const montos = [...linea.matchAll(/\b\d{1,3}(?:\.\d{3})+\b|\$\s?\d[\d.,]*/g)]
        .map((m) => Number(m[0].replace(/[^\d]/g, "")))
        .filter((n) => n > 0);
      for (const n of montos) {
        if (n !== c.valor) {
          riesgos.push({
            tipo: "contradice-verificado",
            gravedad: "critico",
            linea: i + 1,
            fragmento: String(n),
            contexto: linea.trim().slice(0, 120),
            razon: `contradice el valor verificado de "${c.concepto}" para ${c.anio}: ${c.valor} (fuente: ${c.fuente}, consultado ${c.fechaConsulta})`,
          });
        }
      }
    });
  }

  const criticos = riesgos.filter((r) => r.gravedad === "critico").length;
  const altos = riesgos.filter((r) => r.gravedad === "alto").length;
  const medios = riesgos.filter((r) => r.gravedad === "medio").length;

  return {
    ok: riesgos.length === 0,
    riesgos,
    resumen: riesgos.length
      ? `${riesgos.length} afirmación(es) sin procedencia — ${criticos} crítica(s), ${altos} alta(s), ${medios} media(s)`
      : "sin afirmaciones de riesgo sin procedencia",
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function imprimirAuditoria(r) {
  if (r.ok) {
    console.log("ok: " + r.resumen);
    return 0;
  }
  console.error(`\nAUDITORÍA LEGAL: ${r.resumen}\n`);
  const orden = { critico: 0, alto: 1, medio: 2 };
  for (const g of [...r.riesgos].sort((a, b) => orden[a.gravedad] - orden[b.gravedad])) {
    console.error(`  [${g.gravedad.toUpperCase()}] línea ${g.linea} — ${g.tipo}: "${g.fragmento}"`);
    console.error(`      ${g.contexto}`);
    console.error(`      ${g.razon}\n`);
  }
  console.error("Marca cada afirmación con su procedencia antes de entregar:");
  console.error("  [verificado: <fuente oficial> <fecha>]   [del documento]   [no verificado]");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "auditar" && args[0]) {
    if (!existsSync(args[0])) { console.error(`No existe: ${args[0]}`); process.exit(1); }
    process.exit(imprimirAuditoria(auditarRespuesta(readFileSync(args[0], "utf8"))));
  } else if (cmd === "cifras") {
    const c = cifrasVerificadas(args[0] ? Number(args[0]) : undefined);
    if (!c.length) {
      console.log("No hay cifras verificadas registradas.");
      console.log("El registro empieza vacío A PROPÓSITO: precargarlo de memoria sería");
      console.log("cometer el error que este módulo existe para impedir.");
      console.log("Registra una tras consultarla en fuente oficial:");
      console.log('  node nucleo/legal.mjs registrar "salario mínimo" 2026 <valor> https://www.mintrabajo.gov.co/... 2026-07-25');
    } else {
      for (const x of c) console.log(`  ${x.anio}  ${x.concepto}: ${x.valor}  (${x.fuente}, consultado ${x.fechaConsulta})`);
    }
  } else if (cmd === "registrar" && args.length >= 5) {
    try {
      const e = registrarCifra({ concepto: args[0], anio: args[1], valor: args[2], fuente: args[3], fechaConsulta: args[4] });
      console.log(`ok: registrado ${e.concepto} ${e.anio} = ${e.valor} (${e.fuente})`);
    } catch (e) { console.error(`Rechazado: ${e.message}`); process.exit(1); }
  } else {
    console.error("Uso:\n  node nucleo/legal.mjs auditar <archivo>\n  node nucleo/legal.mjs cifras [año]\n  node nucleo/legal.mjs registrar <concepto> <año> <valor> <fuente> <fecha>");
    process.exit(1);
  }
}
