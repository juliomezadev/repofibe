#!/usr/bin/env node
// instalar.mjs - instalador multi-host de repofibe.
//
// Las copias se registran archivo por archivo. La desinstalacion solo elimina
// un archivo si repofibe lo creo y su contenido no cambio desde la instalacion.
// Las carpetas se limpian unicamente cuando quedaron vacias.

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
  unlinkSync,
  rmdirSync,
  readdirSync,
  lstatSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// Ejecuta sin shell. En Windows los CLIs de npm son shims .cmd.
function ejecutar(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: "pipe" });
  } catch (e) {
    if (process.platform === "win32" && (e.code === "ENOENT" || e.code === "EINVAL")) {
      execFileSync(cmd + ".cmd", args, { stdio: "pipe" });
    } else {
      throw e;
    }
  }
}

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOGAR = homedir();
const APP = join(HOGAR, ".repofibe", "app");
const REGISTRO = join(HOGAR, ".repofibe", "instalado.json");
const MARCA_INICIO = "<!-- repofibe:inicio -->";
const MARCA_FIN = "<!-- repofibe:fin -->";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? (args[i + 1] ?? true) : null; };
const hostPedido = flag("--host");
const workspace = flag("--workspace");
const quitar = args.includes("--quitar");
const refrescar = args.includes("--refrescar");
const adoptar = args.includes("--adoptar");
const dryRun = args.includes("--dry-run");

if (dryRun) {
  console.log("=== EJECUCIÓN EN MODO DRY-RUN ===");
}

function existe(ruta) {
  try { lstatSync(ruta); return true; } catch { return false; }
}

function claveRuta(ruta) {
  const absoluta = resolve(ruta);
  return process.platform === "win32" ? absoluta.toLowerCase() : absoluta;
}

function rutaDentro(ruta, base) {
  const r = claveRuta(ruta);
  const b = claveRuta(base);
  return r === b || r.startsWith(b.endsWith(sep) ? b : b + sep);
}

function hashTexto(texto) {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

function hashArchivo(ruta) {
  return createHash("sha256").update(readFileSync(ruta)).digest("hex");
}

function registroBase() {
  return {
    version: 2,
    rutas: [],
    bloques: [],
    archivos: [],
    bloquesPropios: [],
    directorios: [],
    destinos: [],
    plugins: [],
  };
}

function leerRegistro() {
  let bruto = null;
  try { bruto = JSON.parse(readFileSync(REGISTRO, "utf8")); } catch {}
  const registro = { ...registroBase(), ...(bruto && typeof bruto === "object" ? bruto : {}) };
  registro.rutas = Array.isArray(registro.rutas) ? registro.rutas.filter((r) => typeof r === "string") : [];
  registro.bloques = Array.isArray(registro.bloques) ? registro.bloques.filter((r) => typeof r === "string") : [];
  registro.archivos = Array.isArray(registro.archivos)
    ? registro.archivos.filter((r) => r && typeof r.ruta === "string" && typeof r.sha256 === "string")
    : [];
  registro.bloquesPropios = Array.isArray(registro.bloquesPropios)
    ? registro.bloquesPropios.filter((r) => r && typeof r.ruta === "string" && typeof r.sha256 === "string")
    : [];
  registro.directorios = Array.isArray(registro.directorios) ? registro.directorios.filter((r) => typeof r === "string") : [];
  registro.destinos = Array.isArray(registro.destinos) ? registro.destinos.filter((r) => typeof r === "string") : [];
  registro.plugins = Array.isArray(registro.plugins) ? registro.plugins.filter((r) => typeof r === "string") : [];
  registro.version = 2;
  registro._legacy = !bruto || bruto.version !== 2 || !Array.isArray(bruto.archivos);
  return registro;
}

function guardarRegistro(registro) {
  mkdirSync(dirname(REGISTRO), { recursive: true });
  const serializable = { ...registro };
  delete serializable._legacy;
  writeFileSync(REGISTRO, JSON.stringify(serializable, null, 2) + "\n", "utf8");
}

function anotar(registro, ruta) {
  const absoluta = resolve(ruta);
  if (!registro.rutas.some((r) => claveRuta(r) === claveRuta(absoluta))) registro.rutas.push(absoluta);
}

function anotarDestino(registro, ruta) {
  const absoluta = resolve(ruta);
  if (!registro.destinos.some((r) => claveRuta(r) === claveRuta(absoluta))) registro.destinos.push(absoluta);
}

function anotarDirectorio(registro, ruta) {
  const absoluta = resolve(ruta);
  if (!registro.directorios.some((r) => claveRuta(r) === claveRuta(absoluta))) registro.directorios.push(absoluta);
}

// Crea solo los directorios ausentes y los registra para poder limpiar vacios.
function asegurarDirectorio(registro, ruta) {
  const objetivo = resolve(ruta);
  const faltantes = [];
  let actual = objetivo;
  while (true) {
    try {
      const st = lstatSync(actual);
      if (!st.isDirectory()) throw new Error(`La ruta no es un directorio: ${actual}`);
      break;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      faltantes.push(actual);
      const padre = dirname(actual);
      if (padre === actual) throw new Error(`No se pudo resolver el padre de ${actual}`);
      actual = padre;
    }
  }
  for (const dir of faltantes.reverse()) {
    if (!dryRun) mkdirSync(dir); else console.log("[DRY-RUN] mkdir", dir);
    anotarDirectorio(registro, dir);
  }
}

function registrarArchivo(registro, ruta, sha256) {
  const absoluta = resolve(ruta);
  const existente = registro.archivos.find((r) => claveRuta(r.ruta) === claveRuta(absoluta));
  if (existente) {
    existente.ruta = absoluta;
    existente.sha256 = sha256;
  } else {
    registro.archivos.push({ ruta: absoluta, sha256 });
  }
}

function buscarArchivo(registro, ruta) {
  return registro.archivos.find((r) => claveRuta(r.ruta) === claveRuta(ruta));
}

function registrarBloque(registro, ruta, sha256, creado) {
  const absoluta = resolve(ruta);
  const existente = registro.bloquesPropios.find((r) => claveRuta(r.ruta) === claveRuta(absoluta));
  if (existente) {
    existente.ruta = absoluta;
    existente.sha256 = sha256;
    existente.creado = existente.creado || creado;
  } else {
    registro.bloquesPropios.push({ ruta: absoluta, sha256, creado });
  }
  if (!registro.bloques.some((r) => claveRuta(r) === claveRuta(absoluta))) registro.bloques.push(absoluta);
}

function buscarBloque(registro, ruta) {
  return registro.bloquesPropios.find((r) => claveRuta(r.ruta) === claveRuta(ruta));
}

function esRutaLegacy(registro, ruta) {
  return registro._legacy && registro.rutas.some((base) => rutaDentro(ruta, base));
}

function copiarArchivoSeguro(registro, origen, destino) {
  const src = resolve(origen);
  const dst = resolve(destino);
  const srcStat = lstatSync(src);
  if (!srcStat.isFile()) throw new Error(`La fuente no es un archivo regular: ${src}`);
  asegurarDirectorio(registro, dirname(dst));

  const propietario = buscarArchivo(registro, dst);
  if (existe(dst)) {
    const dstStat = lstatSync(dst);
    if (!dstStat.isFile() || dstStat.isSymbolicLink()) {
      console.warn(`  omitido por ruta no regular o enlace: ${dst}`);
      return false;
    }
    const actual = hashArchivo(dst);
    if (!propietario) {
      if (esRutaLegacy(registro, dst) && actual === hashArchivo(src)) {
        registrarArchivo(registro, dst, actual);
      } else {
        console.warn(`  conservado archivo preexistente: ${dst}`);
      }
      return false;
    }
    if (actual !== propietario.sha256) {
      console.warn(`  conservado archivo modificado por el usuario: ${dst}`);
      return false;
    }
  }

  if (!dryRun) copyFileSync(src, dst); else console.log("[DRY-RUN] copy", dst);
  registrarArchivo(registro, dst, hashArchivo(src));
  return true;
}

function escribirArchivoSeguro(registro, destino, contenido) {
  const dst = resolve(destino);
  asegurarDirectorio(registro, dirname(dst));
  const esperado = hashTexto(contenido);
  const propietario = buscarArchivo(registro, dst);
  if (existe(dst)) {
    const st = lstatSync(dst);
    if (!st.isFile() || st.isSymbolicLink()) {
      console.warn(`  omitido por ruta no regular o enlace: ${dst}`);
      return false;
    }
    const actual = hashArchivo(dst);
    if (!propietario) {
      if (esRutaLegacy(registro, dst) && actual === esperado) registrarArchivo(registro, dst, actual);
      else console.warn(`  conservado archivo preexistente: ${dst}`);
      return false;
    }
    if (actual !== propietario.sha256) {
      console.warn(`  conservado archivo modificado por el usuario: ${dst}`);
      return false;
    }
  }
  if (!dryRun) writeFileSync(dst, contenido, "utf8"); else console.log("[DRY-RUN] write", dst);
  registrarArchivo(registro, dst, esperado);
  return true;
}

function copiarArbol(registro, origen, destino) {
  asegurarDirectorio(registro, destino);
  for (const entrada of readdirSync(origen, { withFileTypes: true })) {
    const src = join(origen, entrada.name);
    const dst = join(destino, entrada.name);
    if (entrada.isDirectory()) copiarArbol(registro, src, dst);
    else if (entrada.isFile()) copiarArchivoSeguro(registro, src, dst);
    else console.warn(`  omitido tipo de fuente no soportado: ${src}`);
  }
}

// Copia el nucleo compartido a ~/.repofibe/app.
function instalarApp(registro) {
  asegurarDirectorio(registro, APP);
  for (const d of ["plantillas", "nucleo"]) copiarArbol(registro, join(RAIZ, d), join(APP, d));
  for (const f of ["FILOSOFIA.md", "VERSION"]) copiarArchivoSeguro(registro, join(RAIZ, f), join(APP, f));
  anotar(registro, APP);
  console.log(`  nucleo compartido -> ${APP}`);
}

function skills() {
  return readdirSync(join(RAIZ, "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existe(join(RAIZ, "skills", d.name, "SKILL.md")))
    .map((d) => d.name);
}

function copiarSkills(registro, destinoBase, prefijo = "repofibe-") {
  const base = resolve(destinoBase);
  asegurarDirectorio(registro, base);
  anotarDestino(registro, base);
  for (const s of skills()) {
    const destino = join(base, prefijo + s);
    copiarArbol(registro, join(RAIZ, "skills", s), destino);
    anotar(registro, destino);
  }
  console.log(`  ${skills().length} skills -> ${base}`);
}

function extraerBloque(texto) {
  const i = texto.indexOf(MARCA_INICIO);
  const f = texto.indexOf(MARCA_FIN);
  if (i < 0 || f <= i) return null;
  const fin = f + MARCA_FIN.length;
  return { inicio: i, fin, contenido: texto.slice(i, fin) };
}

// Inserta/reemplaza el bloque marcado sin apropiarse de bloques desconocidos.
function ponerBloque(registro, archivo, contenido) {
  const destino = resolve(archivo);
  asegurarDirectorio(registro, dirname(destino));
  const existia = existe(destino);
  if (existia && (!lstatSync(destino).isFile() || lstatSync(destino).isSymbolicLink())) {
    console.warn(`  bloque omitido por ruta no regular o enlace: ${destino}`);
    return false;
  }

  const bloque = `${MARCA_INICIO}\n${contenido.trim()}\n${MARCA_FIN}`;
  const texto = existia ? readFileSync(destino, "utf8") : "";
  const actual = extraerBloque(texto);
  const propio = buscarBloque(registro, destino);
  if (actual) {
    const coincideConRegistro = propio && hashTexto(actual.contenido) === propio.sha256;
    const coincideConLegacy = !propio && registro._legacy && registro.bloques.some((r) => claveRuta(r) === claveRuta(destino)) && actual.contenido === bloque;
    if (!coincideConRegistro && !coincideConLegacy) {
      console.warn(`  bloque preexistente conservado: ${destino}`);
      return false;
    }
  }

  let nuevo;
  if (actual) nuevo = texto.slice(0, actual.inicio) + bloque + texto.slice(actual.fin);
  else nuevo = texto.trimEnd() + (texto ? "\n\n" : "") + bloque + "\n";
  if (dryRun) console.log("[DRY-RUN] write", destino); else writeFileSync(destino, nuevo, "utf8");
  const instalado = extraerBloque(nuevo);
  registrarBloque(registro, destino, hashTexto(instalado.contenido), !existia);
  console.log(`  bloque de reglas -> ${destino}`);
  return true;
}

function bloqueReglas() {
  const lista = skills().map((s) => "repofibe-" + s).join(", ");
  return `## repofibe - La Fabrica
Equipo de ingenieria virtual en espanol. Skills instaladas (Agent Skills): ${lista}.
- Flujo de sprint: pensar (oficina) -> planear (plan-ceo, plan-ing, plan-diseno) -> construir -> revisar -> probar (qa) -> shipear -> retro. Orquestador: repofibe-fabrica.
- Protocolo: evidencia antes de afirmacion; causa raiz antes de parche; leer antes de escribir. Detalle: ~/.repofibe/app/plantillas/razonamiento-fable.md
- Antes de comandos destructivos (rm -rf, git reset --hard, push --force, DROP TABLE): explicar que se pierde y pedir confirmacion explicita.`;
}

function anotarPlugin(registro, nombre) {
  if (!registro.plugins.includes(nombre)) registro.plugins.push(nombre);
}

// Desinstala solo archivos cuyo hash demuestra que siguen siendo la copia creada.
function quitarArchivoPropio(registro, propiedad) {
  const ruta = resolve(propiedad.ruta);
  if (!existe(ruta)) return;
  const st = lstatSync(ruta);
  if (!st.isFile() || st.isSymbolicLink()) {
    console.warn(`  conservado archivo no regular: ${ruta}`);
    return;
  }
  if (hashArchivo(ruta) !== propiedad.sha256) {
    console.warn(`  conservado archivo modificado por el usuario: ${ruta}`);
    return;
  }
  if (!dryRun) unlinkSync(ruta); else console.log("[DRY-RUN] unlink", ruta);
  console.log(`  eliminado: ${ruta}`);
}

function quitarBloquePropio(propiedad) {
  const ruta = resolve(propiedad.ruta);
  if (!existe(ruta)) return;
  const st = lstatSync(ruta);
  if (!st.isFile() || st.isSymbolicLink()) {
    console.warn(`  bloque conservado por ruta no regular: ${ruta}`);
    return;
  }
  const texto = readFileSync(ruta, "utf8");
  const actual = extraerBloque(texto);
  if (!actual || hashTexto(actual.contenido) !== propiedad.sha256) {
    console.warn(`  bloque conservado por cambios del usuario: ${ruta}`);
    return;
  }
  let despues = texto.slice(actual.fin);
  if (despues.startsWith("\r\n")) despues = despues.slice(2);
  else if (despues.startsWith("\n")) despues = despues.slice(1);
  const nuevo = texto.slice(0, actual.inicio) + despues;
  if (propiedad.creado && nuevo.trim() === "") {
    if (!dryRun) unlinkSync(ruta); else console.log("[DRY-RUN] unlink", ruta);
  } else {
    if (!dryRun) writeFileSync(ruta, nuevo, "utf8"); else console.log("[DRY-RUN] write", ruta);
  }
  console.log(`  bloque removido de: ${ruta}`);
}

function quitarDirectoriosVacios(registro) {
  const orden = [...registro.directorios].sort((a, b) => b.length - a.length);
  for (const ruta of orden) {
    try {
      const st = lstatSync(ruta);
      if (st.isDirectory() && readdirSync(ruta).length === 0) {
        if (!dryRun) rmdirSync(ruta); else console.log("[DRY-RUN] rmdir", ruta);
        console.log(`  directorio vacio eliminado: ${ruta}`);
      }
    } catch {}
  }
}

// hosts
const HOSTS = {
  claude: {
    detectar: () => existe(join(HOGAR, ".claude")),
    instalar(registro) {
      const yaEnCopias = registro.rutas.some((r) => r.includes(join(".claude", "skills", "repofibe-")));
      if (yaEnCopias) {
        copiarSkills(registro, join(HOGAR, ".claude", "skills"));
        console.log("  (refresco en modo copia - instalacion previa detectada)");
        return;
      }
      try {
        ejecutar("claude", ["plugin", "marketplace", "add", RAIZ]);
        ejecutar("claude", ["plugin", "install", "repofibe@repofibe-marketplace"]);
        anotarPlugin(registro, "repofibe");
        console.log("  plugin nativo instalado (incluye hooks deterministas)");
        return;
      } catch {
        console.log("  CLI de claude no disponible u ocupada - fallback a copia de skills");
      }
      copiarSkills(registro, join(HOGAR, ".claude", "skills"));
      console.log("  AVISO: en modo copia los hooks no se cargan. Para guardias deterministas: claude plugin marketplace add <ruta-repofibe> && claude plugin install repofibe@repofibe-marketplace");
    },
  },
  antigravity: {
    detectar: () => existe(join(HOGAR, ".gemini")),
    instalar(registro) {
      copiarSkills(registro, join(HOGAR, ".gemini", "config", "skills"));
      ponerBloque(registro, join(HOGAR, ".gemini", "GEMINI.md"), bloqueReglas());
      if (workspace && typeof workspace === "string") {
        const wf = join(resolve(workspace), ".agent", "workflows");
        for (const s of skills()) {
          const archivo = join(wf, `repofibe-${s}.md`);
          escribirArchivoSeguro(registro, archivo,
            `---\ndescription: repofibe /${s} - ver skill repofibe-${s}\n---\n` +
            `Lee el archivo ~/.gemini/config/skills/repofibe-${s}/SKILL.md y ejecutalo al pie de la letra. ` +
            `La raiz de repofibe es ~/.repofibe/app.\n`);
        }
        console.log(`  workflows de workspace -> ${wf}`);
      } else {
        console.log("  (opcional) --workspace <ruta> genera lanzadores /repofibe-* en .agent/workflows/");
      }
    },
  },
  codex: { detectar: () => existe(join(HOGAR, ".codex")), instalar(registro) { copiarSkills(registro, join(HOGAR, ".codex", "skills")); } },
  cursor: { detectar: () => existe(join(HOGAR, ".cursor")), instalar(registro) { copiarSkills(registro, join(HOGAR, ".cursor", "skills")); } },
  opencode: { detectar: () => existe(join(HOGAR, ".config", "opencode")), instalar(registro) { copiarSkills(registro, join(HOGAR, ".config", "opencode", "skills")); } },
  generico: {
    detectar: () => false,
    instalar(registro) {
      const base = resolve(typeof workspace === "string" ? workspace : process.cwd());
      copiarSkills(registro, join(base, ".agent", "skills"));
      ponerBloque(registro, join(base, "AGENTS.md"), bloqueReglas());
    },
  },
};

// adoptar: migración única para instalaciones anteriores al modelo de
// ownership. Los archivos bajo rutas que repofibe creó (registro.rutas) pero
// sin entrada de ownership quedan registrados con su hash ACTUAL de disco —
// a partir de ahí el refresco puede actualizarlos normalmente. Los archivos
// fuera de registro.rutas siguen intocables. Advertencia honesta: si el
// usuario editó a mano uno de esos archivos instalados, la adopción lo
// tratará como propio y el siguiente refresco lo sobreescribirá — por eso
// este comando es explícito y nunca automático.
if (adoptar) {
  const registro = leerRegistro();
  const listarArchivos = (ruta, salida) => {
    const st = lstatSync(ruta);
    if (st.isSymbolicLink()) return salida;
    if (st.isFile()) { salida.push(ruta); return salida; }
    if (st.isDirectory()) for (const e of readdirSync(ruta)) listarArchivos(join(ruta, e), salida);
    return salida;
  };
  let adoptados = 0;
  for (const base of registro.rutas) {
    if (!existe(base)) continue;
    for (const f of listarArchivos(resolve(base), [])) {
      if (buscarArchivo(registro, f)) continue;
      if (dryRun) { console.log("[DRY-RUN] adoptar", f); adoptados++; continue; }
      registrarArchivo(registro, f, hashArchivo(f));
      adoptados++;
    }
  }
  let bloquesAdoptados = 0;
  for (const ruta of registro.bloques) {
    if (buscarBloque(registro, ruta) || !existe(ruta)) continue;
    const st = lstatSync(ruta);
    if (!st.isFile() || st.isSymbolicLink()) continue;
    const actual = extraerBloque(readFileSync(ruta, "utf8"));
    if (!actual) continue;
    if (dryRun) { console.log("[DRY-RUN] adoptar bloque", ruta); bloquesAdoptados++; continue; }
    registrarBloque(registro, ruta, hashTexto(actual.contenido), false);
    bloquesAdoptados++;
  }
  if (!dryRun) guardarRegistro(registro);
  console.log(`Adopción completa: ${adoptados} archivo(s) y ${bloquesAdoptados} bloque(s) ahora tienen ownership.`);
  console.log("Siguiente paso: node nucleo/instalar.mjs --refrescar (las actualizaciones vuelven a fluir).");
  process.exit(0);
}

// refrescar conserva el contrato anterior, pero ahora respeta ownership.
if (refrescar) {
  const registro = leerRegistro();
  let bases = registro.destinos;
  if (!bases.length) {
    bases = [...new Set(
      registro.rutas
        .filter((r) => /repofibe-[a-z-]+$/.test(r))
        .map((r) => dirname(r)),
    )];
  }
  if (!bases.length && !registro.rutas.includes(APP)) {
    console.log("Nada que refrescar: no hay instalacion previa registrada.");
    process.exit(0);
  }
  instalarApp(registro);
  for (const base of bases) copiarSkills(registro, base);
  guardarRegistro(registro);
  console.log(`Refresco completo en ${bases.length} destino(s).`);
  process.exit(0);
}

if (quitar) {
  const registro = leerRegistro();
  for (const propiedad of registro.archivos) {
    try { quitarArchivoPropio(registro, propiedad); } catch (e) { console.warn(`  no se pudo quitar ${propiedad.ruta}: ${e.message}`); }
  }
  for (const propiedad of registro.bloquesPropios) {
    try { quitarBloquePropio(propiedad); } catch (e) { console.warn(`  no se pudo quitar bloque ${propiedad.ruta}: ${e.message}`); }
  }
  if (registro._legacy && registro.rutas.length) console.warn("  instalacion antigua detectada: carpetas y archivos sin ownership se conservan por seguridad");
  quitarDirectoriosVacios(registro);
  if (registro.plugins.includes("repofibe")) {
    try { ejecutar("claude", ["plugin", "uninstall", "repofibe"]); console.log("  plugin de Claude desinstalado"); } catch {}
  }
  guardarRegistro(registroBase());
  console.log("repofibe desinstalado. (~/.repofibe/memoria.jsonl se conserva; borralo a mano si quieres.)");
  process.exit(0);
}

const elegidos = hostPedido && hostPedido !== true
  ? (hostPedido === "todos" ? Object.keys(HOSTS) : [hostPedido])
  : Object.keys(HOSTS).filter((h) => HOSTS[h].detectar());

if (!elegidos.length) {
  console.error("No se detecto ningun host. Usa --host <claude|antigravity|codex|cursor|opencode|generico>.");
  process.exit(1);
}
if (elegidos.some((h) => !HOSTS[h])) {
  console.error(`Host desconocido. Validos: ${Object.keys(HOSTS).join(", ")}, todos.`);
  process.exit(1);
}

const registro = leerRegistro();
instalarApp(registro);
for (const h of elegidos) {
  console.log(`\n[${h}]`);
  HOSTS[h].instalar(registro);
}
guardarRegistro(registro);
console.log(`\nListo. repofibe ${readFileSync(join(RAIZ, "VERSION"), "utf8").trim()} instalado en: ${elegidos.join(", ")}.`);
console.log("Actualizar = volver a ejecutar este instalador. Desinstalar = --quitar.");
