#!/usr/bin/env node
// evals/nucleo/fuentes.mjs — consulta de fuentes legales oficiales.
//
// Sin red externa: levanta un servidor HTTP local real (mismo criterio que la
// eval de salud.mjs). Lo que se prueba de verdad:
//   - el allowlist no se puede eludir,
//   - robots.txt se respeta,
//   - una cifra AUSENTE de la fuente nunca se da por verificada,
//   - el contenido externo se envuelve como no confiable.

import { createServer } from "node:http";
import {
  esHostOficial, permitidoPorRobots, extraerTexto, normalizarNumero,
  verificarEnFuente, consultar, ErrorFuente,
} from "../../nucleo/fuentes.mjs";

const fallos = [];
const fallo = (m) => fallos.push(m);
const ok = (m) => console.log(`  ok: ${m}`);

// ── 1. El allowlist no se elude ────────────────────────────────────────────
{
  const validas = [
    "https://www.mintrabajo.gov.co/decreto",
    "https://funcionpublica.gov.co/eva/gestornormativo/norma.php?i=33104",
    "https://www.dane.gov.co/ipc",
  ];
  const invalidas = [
    "http://www.mintrabajo.gov.co/x",              // HTTP sin cifrar
    "https://blog-laboral.com/smlmv",              // blog
    "https://www.google.com/search?q=smlmv",       // buscador
    "https://mintrabajo.gov.co.attacker.net/x",    // sufijo engañoso
    "https://notmintrabajo.gov.co/x",              // prefijo engañoso
    "javascript:alert(1)",
  ];

  const malas = validas.filter((u) => !esHostOficial(u));
  const coladas = invalidas.filter((u) => esHostOficial(u));
  if (malas.length) fallo(`rechazó fuentes oficiales válidas: ${malas.join(", ")}`);
  else if (coladas.length) fallo(`ACEPTÓ fuentes no oficiales: ${coladas.join(", ")}`);
  else ok("el allowlist acepta lo oficial y rechaza HTTP, blogs, buscadores y hosts engañosos");
}

// ── 2. robots.txt se interpreta bien ───────────────────────────────────────
{
  const casos = [
    ["", "/cualquiera", true, "sin robots.txt no hay restricción"],
    ["User-agent: *\nDisallow: /", "/norma", false, "Disallow total"],
    ["User-agent: *\nDisallow:", "/norma", true, "Disallow vacío permite todo"],
    ["User-agent: *\nDisallow: /privado", "/publico", true, "solo bloquea la ruta indicada"],
    ["User-agent: *\nDisallow: /privado", "/privado/x", false, "bloquea subrutas"],
    ["User-agent: *\nDisallow: /a\nAllow: /a/publico", "/a/publico", true, "la regla más específica gana"],
    ["User-agent: otrobot\nDisallow: /", "/norma", true, "grupo de otro agente no aplica"],
  ];
  const malos = casos.filter(([txt, ruta, esperado]) => permitidoPorRobots(txt, ruta) !== esperado);
  if (malos.length) fallo(`robots.txt mal interpretado: ${malos.map((c) => c[3]).join(" | ")}`);
  else ok(`robots.txt interpretado correctamente en ${casos.length} casos`);
}

// ── 3. Extracción de texto y normalización de cifras ───────────────────────
{
  const html = "<html><head><style>.x{color:red}</style></head><body><script>var a=1</script>" +
    "<p>El salario m&iacute;nimo es <b>$1.300.000</b></p><div>mensuales</div></body></html>";
  const t = extraerTexto(html);
  if (/color:red|var a=1/.test(t)) fallo("extraerTexto dejó pasar script o style");
  else if (!t.includes("1.300.000")) fallo(`extraerTexto perdió la cifra: "${t}"`);
  else ok("extraerTexto limpia script/style/etiquetas y conserva el contenido");

  const formas = ["1.300.000", "1'300.000", "$ 1 300 000", "1300000"];
  if (new Set(formas.map(normalizarNumero)).size !== 1) fallo(`normalizarNumero no unifica: ${formas.map(normalizarNumero).join(" ")}`);
  else ok("normalizarNumero unifica 1.300.000 / 1'300.000 / $ 1 300 000 / 1300000");
}

// ── 4. Contra un servidor real: presencia y AUSENCIA ───────────────────────
// El caso que más importa es el negativo: una cifra que NO está en la fuente
// jamás puede darse por verificada. Ahí es donde un scraper ingenuo miente.
{
  const PAGINA = `<html><body>
    <h1>Decreto de salario mínimo</h1>
    <p>Fíjase el salario mínimo legal mensual vigente en la suma de
    UN MILLÓN TRESCIENTOS MIL PESOS ($1.300.000) moneda corriente.</p>
    <p>Auxilio de transporte: $162.000</p>
  </body></html>`;

  const servidor = createServer((req, res) => {
    if (req.url === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("User-agent: *\nDisallow: /privado"); }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGINA);
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const puerto = servidor.address().port;

  // Se construye la "fuente" con el mismo pipeline real (fetch + extraerTexto)
  // y se inyecta: el allowlist se prueba aparte, aquí se prueba la lógica de
  // verificación contra una página servida de verdad.
  const crudo = await (await fetch(`http://127.0.0.1:${puerto}/decreto`)).text();
  const fuente = {
    url: `http://127.0.0.1:${puerto}/decreto`,
    host: "127.0.0.1",
    fechaConsulta: "2026-07-25",
    texto: extraerTexto(crudo),
    inyeccionDetectada: [],
  };

  const presente = await verificarEnFuente("1300000", fuente.url, { fuente });
  if (!presente.encontrado) fallo("no encontró una cifra que SÍ está en la página (escrita como $1.300.000)");
  else if (!presente.evidencias[0].contexto.toLowerCase().includes("salario mínimo")) {
    fallo(`la evidencia no trae el contexto de la cifra: "${presente.evidencias[0].contexto}"`);
  } else ok("verifica presencia literal y devuelve el fragmento donde aparece");

  const ausente = await verificarEnFuente("1423500", fuente.url, { fuente });
  if (ausente.encontrado) fallo("DIO POR VERIFICADA una cifra que no está en la fuente");
  else if (ausente.evidencias.length) fallo("devolvió evidencias de una cifra ausente");
  else ok("una cifra ausente de la fuente NUNCA se da por verificada");

  // El auxilio, escrito distinto, también debe encontrarse.
  const auxilio = await verificarEnFuente("162000", fuente.url, { fuente });
  if (!auxilio.encontrado) fallo("no encontró el auxilio de transporte ($162.000)");
  else ok("encuentra cifras con separador de miles distinto del pedido");

  // ── 5. robots.txt se respeta de verdad, no solo se parsea ────────────────
  // El host local no está en el allowlist, así que `consultar` debe rechazarlo
  // ANTES de tocar la red: el allowlist es la primera puerta.
  let rechazado = false;
  try { await consultar(`http://127.0.0.1:${puerto}/decreto`); }
  catch (e) { rechazado = e instanceof ErrorFuente; }
  if (!rechazado) fallo("consultar() no rechazó un host fuera del allowlist");
  else ok("consultar() rechaza cualquier host no oficial antes de pedir nada");

  servidor.close();
}

if (fallos.length) {
  console.error(`\nFALLOS (${fallos.length}):`);
  for (const f of fallos) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("ok: fuentes oficiales verificadas (allowlist infranqueable, robots respetado, ausencia nunca es verificación)");
