#!/usr/bin/env node
// navegador.mjs — ojos reales para /qa y /diseno, sin gstack.
//
// Playwright NO es dependencia de repofibe (que sigue siendo cero-deps):
// se importa dinámicamente y, si no está instalado en el proyecto, el
// error explica cómo instalarlo — el mismo patrón que /grafo usa con
// graphify (herramienta externa opcional, nunca embebida).
//
// Sistema de refs: propio, sobre el texto público de page.ariaSnapshot()
// (la API interna que genera refs no está expuesta en el paquete público
// — ver DEMOSTRADO en el cuaderno). Cada snapshot asigna e1, e2, e3... por
// orden de aparición, desambiguados por (role, nombre, índice de
// ocurrencia) para que elementos duplicados (dos botones "Guardar") sean
// direccionables por separado.
//
// Uso:
//   node navegador.mjs ejecutar '[{"accion":"navegar","url":"..."},...]'
//   node navegador.mjs ejecutar --archivo <script.json>
//   node navegador.mjs ejecutar --stdin
//   node navegador.mjs daemon
//
// Acciones soportadas: perfil{dominio} (carga cookies guardadas), navegar{url}, snapshot{},
// click{ref}, escribir{ref,texto}, texto{ref} (lee el texto visible),
// screenshot{archivo}, esperar{ms}.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { detectarInyeccion } from "./no-confiable.mjs";
import { cargar as cargarAuth, dirAuth as dirAuthBase } from "./cookies.mjs";
import readline from "readline";
import { withTrace } from "./traza.mjs";

async function cargarPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error(
      "Playwright no está instalado en este proyecto. Instálalo con:\n" +
      "  npm install playwright && npx playwright install chromium\n" +
      "(repofibe no lo empaqueta — sigue siendo cero-dependencias)."
    );
  }
}

const LINEA_ELEMENTO = /^\s*-\s*(\w+)\s+"([^"]*)"/;

export function parsearRefs(snapshotTexto) {
  const refs = {};
  const conteo = {};
  let n = 0;
  for (const linea of snapshotTexto.split("\n")) {
    const m = linea.match(LINEA_ELEMENTO);
    if (!m) continue;
    const [, role, name] = m;
    const clave = `${role}::${name}`;
    const indice = conteo[clave] ?? 0;
    conteo[clave] = indice + 1;
    n++;
    refs[`e${n}`] = { role, name, indice };
  }
  return refs;
}

function formatearSnapshot(snapshotTexto) {
  let n = 0;
  return snapshotTexto.split("\n").map((linea) => {
    if (!LINEA_ELEMENTO.test(linea)) return linea;
    n++;
    return `[e${n}] ${linea.trim()}`;
  }).join("\n");
}

async function localizador(page, refs, ref) {
  const info = refs[ref];
  if (!info) throw new Error(`ref desconocido: ${ref} (¿corriste "snapshot" primero en este mismo script?)`);
  return page.getByRole(info.role, { name: info.name, exact: true }).nth(info.indice);
}

// Ejecutor unificado (try/catch a nivel de comando para modo daemon seguro)
async function ejecutarComandoInseguroBase(accion, page, browser, refs, dirBase) {
  const inicio = Date.now();
  let res = null;

  switch (accion.accion) {
    case "perfil": {
      const state = cargarAuth(accion.dominio, dirBase);
      if (state && state.cookies) {
        await page.context().addCookies(state.cookies);
      }
      if (state && state.origins) {
        for (const origin of state.origins) {
          for (const item of origin.localStorage || []) {
            try {
              await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: item.name, v: item.value });
            } catch (e) {}
          }
        }
      }
      res = { accion: "perfil", ok: true, dominio: accion.dominio };
      break;
    }
    case "exportarPerfil": {
      const state = await page.context().storageState();
      res = { accion: "exportarPerfil", ok: true, state };
      break;
    }
    case "navegar": {
      await page.goto(accion.url, { waitUntil: "domcontentloaded" });
      res = { accion: "navegar", ok: true, url: page.url() };
      break;
    }
    case "snapshot": {
      const dom = await snapshotPagina(page, refs);
      const iny = detectarInyeccion(dom);
      res = { accion: "snapshot", ok: true, dom, refsCount: Object.keys(refs).length, inyeccion: iny };
      break;
    }
    case "click": {
      const target = refs[accion.ref];
      if (!target) {
        res = { accion: "click", ok: false, error: `ref no encontrado: ${accion.ref}` };
        break;
      }
      await target.click({ timeout: 5000 });
      res = { accion: "click", ok: true, ref: accion.ref };
      break;
    }
    case "escribir": {
      const target = refs[accion.ref];
      if (!target) {
        res = { accion: "escribir", ok: false, error: `ref no encontrado: ${accion.ref}` };
        break;
      }
      await target.fill(accion.texto || "", { timeout: 5000 });
      res = { accion: "escribir", ok: true, ref: accion.ref };
      break;
    }
    case "texto": {
      const loc = await localizador(page, refs, accion.ref);
      const info = refs[accion.ref];
      const esCampo = info?.role === "textbox" || info?.role === "combobox" || info?.role === "searchbox";
      const txt = esCampo ? await loc.inputValue() : await loc.innerText();
      const inyeccion = detectarInyeccion(txt);
      res = { accion: "texto", ok: true, ref: accion.ref, valor: txt, inyeccion };
      break;
    }
    case "screenshot": {
      const buffer = await page.screenshot();
      if (accion.archivo) writeFileSync(accion.archivo, buffer);
      res = { accion: "screenshot", ok: true, bytes: buffer.length, archivo: accion.archivo ?? null };
      break;
    }
    case "esperar": {
      await page.waitForTimeout(Number(accion.ms) || 0);
      res = { accion: "esperar", ok: true, ms: accion.ms };
      break;
    }
    default:
      res = { accion: accion.accion, ok: false, error: `acción desconocida: ${accion.accion}` };
  }

  if (res && page && !res.url) {
    try { res.url = page.url(); } catch (e) {}
  }
  return res;
}

const ejecutarComandoInseguro = async (accion, page, browser, refs, dirBase) => {
  const fn = withTrace(`Navegador: ${accion.accion}`, ejecutarComandoInseguroBase);
  return fn(accion, page, browser, refs, dirBase);
};

export async function ejecutarScript(acciones, { headless = true, timeoutMs = 15000, dirBase = undefined } = {}) {
  const { chromium } = await cargarPlaywright();
  const browser = await chromium.launch({ headless });
  let ctxOpts = {};
  const perfilAccion = acciones.find((a) => a.accion === "perfil");
  if (perfilAccion) {
    const state = cargarAuth(perfilAccion.dominio, dirBase);
    if (state) {
      ctxOpts = { storageState: state };
    } else {
      throw new Error(`No hay storageState para ${perfilAccion.dominio} — ejecuta: node <RAIZ>/nucleo/cookies.mjs guardar ${perfilAccion.dominio}`);
    }
  }
  const page = await browser.newPage(ctxOpts);
  page.setDefaultTimeout(timeoutMs);
  let refs = {};
  const resultados = [];
  try {
    for (const accion of acciones) {
      try {
        const r = await ejecutarComandoInseguro(accion, page, browser, refs, dirBase);
        resultados.push(r);
        if (!r.ok) break; // one-shot detiene en error
      } catch (e) {
        resultados.push({ accion: accion.accion, ok: false, error: e.message });
        break;
      }
    }
  } finally {
    await browser.close();
  }
  return resultados;
}

export async function ejecutarDaemon({ headless = true, timeoutMs = 15000, dirBase = undefined } = {}) {
  const { chromium } = await cargarPlaywright();
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  let refs = {};
  
  // Apocalipsis Zombie Defense
  let muerto = false;
  const morir = async () => {
    if (muerto) return;
    muerto = true;
    try { await browser.close(); } catch {}
    process.exit(0);
  };
  
  process.on('SIGINT', morir);
  process.on('SIGTERM', morir);
  
  page.on('crash', () => {
    console.log(JSON.stringify({ status: "error", error: "La página de Chromium crasheó.", fatal: true }));
    morir();
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  rl.on('close', morir);
  
  // Semaphore/Queue para prevenir Race Conditions en IPC
  let lock = Promise.resolve();
  
  console.log(JSON.stringify({ status: "ready", message: "Daemon de Chromium iniciado" }));

  rl.on('line', (line) => {
    lock = lock.then(async () => {
      let comando;
      try {
        comando = JSON.parse(line);
      } catch {
        return; // Ignorar ruido nativo no-JSON que ensucia el IPC
      }
      
      if (comando.accion === "close") {
        console.log(JSON.stringify({ status: "closed", msgId: comando.msgId }));
        return morir();
      }

      try {
        const resultado = await ejecutarComandoInseguro(comando, page, browser, refs, dirBase);
        resultado.msgId = comando.msgId; // Correlación obligatoria
        console.log(JSON.stringify(resultado));
      } catch (e) {
        // En modo daemon un error de click no mata el proceso
        console.log(JSON.stringify({ status: "error", error: e.message, msgId: comando.msgId }));
      }
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...args] = process.argv.slice(2);
  
  if (cmd === "daemon") {
    ejecutarDaemon().catch(e => {
      console.error(JSON.stringify({ status: "fatal", error: e.message }));
      process.exit(1);
    });
  } else if (cmd === "ejecutar") {
    let crudo;
    if (args[0] === "--archivo") crudo = readFileSync(args[1], "utf8");
    else if (args[0] === "--stdin") crudo = readFileSync(0, "utf8");
    else crudo = args[0];
    if (!crudo) { console.error("Falta el script de acciones."); process.exit(1); }

    let acciones;
    try { acciones = JSON.parse(crudo); } catch (e) { console.error(`Script inválido (no es JSON): ${e.message}`); process.exit(1); }
    if (!Array.isArray(acciones)) { console.error("El script debe ser un array de acciones."); process.exit(1); }

    ejecutarScript(acciones).then(resultados => {
      console.log(JSON.stringify(resultados, null, 2));
      process.exit(resultados.some((r) => !r.ok) ? 1 : 0);
    }).catch(e => {
      console.error(e.message);
      process.exit(1);
    });
  } else {
    console.error("Uso: ejecutar [...] | daemon");
    process.exit(1);
  }
}
