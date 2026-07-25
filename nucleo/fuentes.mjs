#!/usr/bin/env node
// fuentes.mjs — consulta de fuentes legales oficiales colombianas.
//
// ── La idea que hace esto distinto de un scraper cualquiera ─────────────────
// Un scraper trae texto y alguien lo interpreta. Interpretar es donde una IA
// alucina. Pero hay una pregunta que NO requiere interpretación y el código
// puede responder solo:
//
//     ¿Esta cifra aparece literalmente en la página oficial?
//
// Eso es comparación de strings, no juicio. Por eso `verificarEnFuente` no
// pregunta "¿cuál es el salario mínimo?" (interpretación, alucinables) sino
// "¿el valor 1300000 aparece en esta URL oficial?" (verificable, determinista).
// El modelo propone; el código comprueba contra la fuente; solo entonces la
// cifra entra al registro con su evidencia literal pegada.
//
// ── Lo que NO hace ──────────────────────────────────────────────────────────
// No lee derecho, no interpreta normas, no decide qué artículo aplica. Trae
// texto oficial con su procedencia y comprueba presencia literal. Todo lo
// demás sigue siendo juicio — humano o del modelo, y declarado como tal.
//
// ── Cómo se comporta en la red ──────────────────────────────────────────────
// Este repo tiene una skill que evalúa la legalidad del scraping y advierte
// que evadir controles de acceso es zona de riesgo penal (Ley 1273/2009).
// Sería incoherente que su propio fetcher se portara mal. Por eso:
//   - solo HTTPS y solo hosts del allowlist oficial (nada de "buscar en Google");
//   - respeta robots.txt antes de pedir la página;
//   - se identifica con User-Agent propio, no se disfraza de navegador;
//   - un solo GET por consulta, con timeout y tope de tamaño;
//   - no toca nada detrás de login ni evade control alguno.
//
// El contenido descargado se envuelve con `no-confiable.mjs` antes de entrar
// al contexto del agente: es texto que repofibe no escribió.
//
// Uso:
//   node nucleo/fuentes.mjs consultar <url>
//   node nucleo/fuentes.mjs verificar <valor> <url>

import { pathToFileURL } from "node:url";
import { FUENTES_OFICIALES } from "./legal.mjs";
import { envolver, detectarInyeccion } from "./no-confiable.mjs";

const AGENTE = "repofibe/0.6 (consulta de fuentes legales oficiales; +https://github.com/juliomezasena-byte/repofibe)";
const TIMEOUT_MS = 15000;
const TOPE_BYTES = 3_000_000; // una norma larga cabe de sobra; un binario no

export class ErrorFuente extends Error {}

export function esHostOficial(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return FUENTES_OFICIALES.some((f) => host === f || host.endsWith("." + f));
}

// ── robots.txt ──────────────────────────────────────────────────────────────
// Parser mínimo y deliberadamente CONSERVADOR: ante la duda, no se pide.
// Solo mira los grupos que aplican a nuestro agente o a `*`.
export function permitidoPorRobots(robotsTxt, ruta, agente = "repofibe") {
  if (!robotsTxt || !robotsTxt.trim()) return true; // sin robots.txt = sin restricción
  const lineas = robotsTxt.split("\n").map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);

  let aplicaGrupo = false;
  let vistoAlgunGrupo = false;
  const reglas = [];

  for (const l of lineas) {
    const m = l.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const campo = m[1].toLowerCase();
    const valor = m[2].trim();

    if (campo === "user-agent") {
      const ua = valor.toLowerCase();
      // Un nuevo bloque de User-Agent tras reglas cierra el grupo anterior.
      if (vistoAlgunGrupo && reglas.length) aplicaGrupo = false;
      if (ua === "*" || agente.toLowerCase().includes(ua)) { aplicaGrupo = true; vistoAlgunGrupo = true; }
      continue;
    }
    if (!aplicaGrupo) continue;
    if (campo === "disallow" || campo === "allow") reglas.push({ tipo: campo, patron: valor });
  }

  // Regla más específica gana (longitud del patrón), como el estándar de facto.
  let decision = true;
  let largo = -1;
  for (const r of reglas) {
    if (r.patron === "") continue;                 // "Disallow:" vacío = permite todo
    if (!ruta.startsWith(r.patron)) continue;
    if (r.patron.length > largo) { largo = r.patron.length; decision = r.tipo === "allow"; }
  }
  return decision;
}

async function pedir(url, { timeoutMs = TIMEOUT_MS } = {}) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: { "user-agent": AGENTE, accept: "text/html,text/plain,*/*" },
      redirect: "follow",
      signal: control.signal,
    });
  } finally {
    clearTimeout(reloj);
  }
}

// ── Extracción de texto sin dependencias ───────────────────────────────────
export function extraerTexto(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Descarga una fuente oficial. Devuelve el texto con su procedencia.
 * No interpreta nada: solo trae y declara de dónde vino.
 */
export async function consultar(url, opciones = {}) {
  if (!esHostOficial(url)) {
    throw new ErrorFuente(
      `"${url}" no es fuente oficial. Solo HTTPS en: ${FUENTES_OFICIALES.join(", ")}. ` +
      `Un dato "verificado" contra un blog o un buscador no está verificado.`
    );
  }
  const u = new URL(url);

  // robots.txt primero. Si no se puede leer, se asume permitido (ausencia de
  // robots.txt = ausencia de restricción), pero si dice que no, no se pide.
  if (opciones.respetarRobots !== false) {
    let robots = "";
    try {
      const r = await pedir(`${u.origin}/robots.txt`, { timeoutMs: 5000 });
      if (r.ok) robots = await r.text();
    } catch { /* sin robots.txt legible: se procede */ }
    if (!permitidoPorRobots(robots, u.pathname, AGENTE)) {
      throw new ErrorFuente(`robots.txt de ${u.hostname} no permite ${u.pathname}. No se consulta.`);
    }
  }

  const respuesta = await pedir(url, opciones);
  if (!respuesta.ok) throw new ErrorFuente(`${u.hostname} respondió ${respuesta.status} ${respuesta.statusText}`);

  const largo = Number(respuesta.headers.get("content-length") || 0);
  if (largo > TOPE_BYTES) throw new ErrorFuente(`respuesta demasiado grande (${largo} bytes)`);

  const crudo = await respuesta.text();
  if (crudo.length > TOPE_BYTES) throw new ErrorFuente(`respuesta demasiado grande (${crudo.length} caracteres)`);

  const texto = extraerTexto(crudo);
  const inyeccion = detectarInyeccion(texto);

  return {
    url,
    host: u.hostname,
    fechaConsulta: new Date().toISOString().slice(0, 10),
    texto,
    // Envuelto para entrar al contexto del agente: es contenido que repofibe
    // no escribió, y una página puede intentar hacerse pasar por instrucción.
    textoParaContexto: envolver(texto, u.hostname),
    inyeccionDetectada: inyeccion,
  };
}

// ── Normalización de cifras ─────────────────────────────────────────────────
// "1.300.000", "1'300.000", "$ 1 300 000" y "1300000" son el mismo número.
// Comparar sin normalizar haría fallar verificaciones correctas.
export function normalizarNumero(s) {
  return String(s).replace(/[^\d]/g, "");
}

/**
 * LA función que hace esto honesto: comprueba que un valor aparece
 * LITERALMENTE en la fuente oficial, y devuelve el fragmento donde aparece.
 *
 * No pregunta "¿cuál es el salario mínimo?" (interpretación, alucinable) sino
 * "¿el valor X está en esta página?" (comparación, verificable).
 */
export async function verificarEnFuente(valor, url, opciones = {}) {
  const objetivo = normalizarNumero(valor);
  if (!objetivo) throw new ErrorFuente(`"${valor}" no contiene dígitos que verificar`);

  const fuente = opciones.fuente ?? (await consultar(url, opciones));
  const evidencias = [];

  // Se buscan todas las secuencias numéricas del texto y se comparan ya
  // normalizadas: así "1.300.000" en la página casa con 1300000 pedido.
  for (const m of fuente.texto.matchAll(/[\d][\d.,'\s ]{2,}\d|\d+/g)) {
    if (normalizarNumero(m[0]) !== objetivo) continue;
    const desde = Math.max(0, m.index - 120);
    const hasta = Math.min(fuente.texto.length, m.index + m[0].length + 120);
    evidencias.push({
      literal: m[0].trim(),
      contexto: fuente.texto.slice(desde, hasta).replace(/\s+/g, " ").trim(),
    });
    if (evidencias.length >= 5) break;
  }

  return {
    encontrado: evidencias.length > 0,
    valor: Number(objetivo),
    url: fuente.url,
    host: fuente.host,
    fechaConsulta: fuente.fechaConsulta,
    evidencias,
    inyeccionDetectada: fuente.inyeccionDetectada,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...args] = process.argv.slice(2);
  const morir = (e) => { console.error(e instanceof ErrorFuente ? `Rechazado: ${e.message}` : `Error: ${e.message}`); process.exit(1); };

  if (cmd === "consultar" && args[0]) {
    consultar(args[0]).then((r) => {
      console.log(`Fuente: ${r.host}  (consultado ${r.fechaConsulta})`);
      if (r.inyeccionDetectada.length) console.log(`AVISO — señales de inyección en la página: ${r.inyeccionDetectada.join(", ")}`);
      console.log(`\n${r.texto.slice(0, 2000)}${r.texto.length > 2000 ? "\n[...]" : ""}`);
    }).catch(morir);
  } else if (cmd === "verificar" && args.length >= 2) {
    verificarEnFuente(args[0], args[1]).then((r) => {
      if (!r.encontrado) {
        console.error(`NO VERIFICADO: el valor ${r.valor} no aparece en ${r.url}`);
        console.error("No lo registres. O la cifra es otra, o la fuente no es la correcta.");
        process.exit(1);
      }
      console.log(`VERIFICADO: ${r.valor} aparece en ${r.host} (consultado ${r.fechaConsulta})`);
      for (const e of r.evidencias.slice(0, 3)) console.log(`\n  "${e.literal}" en:\n  ...${e.contexto}...`);
      console.log(`\nRegístralo:\n  node nucleo/legal.mjs registrar "<concepto>" <año> ${r.valor} ${r.url} ${r.fechaConsulta}`);
    }).catch(morir);
  } else {
    console.error("Uso:\n  node nucleo/fuentes.mjs consultar <url oficial>\n  node nucleo/fuentes.mjs verificar <valor> <url oficial>");
    process.exit(1);
  }
}
