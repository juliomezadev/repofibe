#!/usr/bin/env node
// guardia.mjs — hook PreToolUse de repofibe (solo Claude Code).
//
// Dos protecciones deterministas:
//   1. Comandos destructivos (rm -rf, git reset --hard, DROP TABLE, format...)
//      → el harness PIDE CONFIRMACIÓN al usuario, siempre, aunque el modelo
//      no se acuerde de tener cuidado. Se apaga con /guardian off
//      (.fabrica/guardia.json → {"activo": false}).
//   2. Congelamiento de directorio (.fabrica/congelar.json → {"directorio": "src"})
//      → ediciones fuera del directorio congelado se DENIEGAN con explicación.
//
// Diseño: fail-open. Cualquier error interno → exit 0 sin salida. Un hook de
// seguridad jamás debe romper la sesión del usuario.

import { readFileSync, lstatSync, realpathSync, statSync } from "node:fs";
import { join, resolve, sep, parse, relative, isAbsolute } from "node:path";

// Telemetría local: este hook ya corre en cada uso de herramienta, así que es
// el sensor natural de "qué se usa" sin pagar el arranque de otro proceso.
// Import DINÁMICO y protegido a propósito: si nucleo/ no estuviera (copia
// parcial, instalación a medias), un import estático fallido tumbaría el hook
// entero. Fail-open empieza por poder cargarse.
let registrar = () => false;
try { ({ registrar } = await import("../nucleo/traza.mjs")); } catch {}

let analizarGitPush = () => ({ requiereProteccion: false });
try { ({ analizarGitPush } = await import("../nucleo/politica-riesgo.mjs")); } catch {}

function compararRuta(ruta) {
  const absoluta = resolve(ruta);
  return process.platform === "win32" ? absoluta.toLowerCase() : absoluta;
}

function mismaRuta(a, b) {
  return compararRuta(a) === compararRuta(b);
}

function dentroDe(ruta, base) {
  const objetivo = compararRuta(ruta);
  const limite = compararRuta(base);
  const relativa = relative(limite, objetivo);
  return relativa === "" || (relativa !== ".." && !relativa.startsWith(`..${sep}`) && !isAbsolute(relativa));
}

// Devuelve la ruta fisica normalizada y detecta enlaces en todos sus
// componentes. Con permitirEnlaces=false, cualquier enlace invalida la ruta.
function inspeccionarRuta(ruta, permitirEnlaces = false) {
  try {
    const absoluta = resolve(String(ruta));
    const raiz = parse(absoluta).root;
    const partes = absoluta.slice(raiz.length).split(sep).filter(Boolean);
    let cursor = raiz;
    let tieneEnlace = false;

    for (let i = 0; i < partes.length; i += 1) {
      const siguiente = join(cursor, partes[i]);
      let info;
      try {
        info = lstatSync(siguiente);
      } catch (error) {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") {
          return {
            ok: true,
            existe: false,
            esDirectorio: false,
            tieneEnlace,
            ruta: resolve(cursor, ...partes.slice(i)),
          };
        }
        return { ok: false, razon: "no se pudo inspeccionar la ruta" };
      }

      if (info.isSymbolicLink()) {
        tieneEnlace = true;
        if (!permitirEnlaces) return { ok: false, razon: "la ruta contiene un enlace" };
        cursor = realpathSync.native(siguiente);
        if (i < partes.length - 1 && !statSync(cursor).isDirectory()) {
          return { ok: false, razon: "un componente de la ruta no es directorio" };
        }
      } else {
        if (i < partes.length - 1 && !info.isDirectory()) {
          return { ok: false, razon: "un componente de la ruta no es directorio" };
        }
        cursor = siguiente;
      }
    }

    const rutaFisica = partes.length ? realpathSync.native(cursor) : cursor;
    const informacionFinal = statSync(rutaFisica);
    return { ok: true, existe: true, esDirectorio: informacionFinal.isDirectory(), tieneEnlace, ruta: rutaFisica };
  } catch {
    return { ok: false, razon: "no se pudo resolver la ruta" };
  }
}

function rutaOperativa(objetivo, cwd, nombre) {
  const esperada = resolve(cwd, ".fabrica", nombre);
  const propuesta = resolve(objetivo);
  const inspeccionEsperada = inspeccionarRuta(esperada);
  const inspeccionPropuesta = inspeccionarRuta(propuesta);
  if (mismaRuta(esperada, propuesta) && inspeccionEsperada.ok && inspeccionPropuesta.ok) return "exacta";

  // Una ruta alterna que llega al archivo operativo mediante un enlace no
  // hereda la excepcion. Se marca para denegarla, no como una edicion comun.
  const esperadaFisica = inspeccionarRuta(esperada, true);
  const propuestaFisica = inspeccionarRuta(propuesta, true);
  if (esperadaFisica.ok && propuestaFisica.ok && mismaRuta(esperadaFisica.ruta, propuestaFisica.ruta)) return "enlace";
  return null;
}

function leerArchivoSeguro(ruta) {
  const inspeccion = inspeccionarRuta(ruta);
  if (!inspeccion.ok) return { estado: "invalido" };
  if (!inspeccion.existe) return { estado: "ausente", texto: "" };
  try { return { estado: "valido", texto: readFileSync(inspeccion.ruta, "utf8") }; }
  catch { return { estado: "invalido" }; }
}

function leerObjetoSeguro(ruta) {
  const archivo = leerArchivoSeguro(ruta);
  if (archivo.estado === "ausente") return archivo;
  if (archivo.estado !== "valido") return { estado: "invalido" };
  try {
    const objeto = JSON.parse(archivo.texto);
    if (!objeto || typeof objeto !== "object" || Array.isArray(objeto)) return { estado: "invalido" };
    return { estado: "valido", objeto, texto: archivo.texto };
  } catch {
    return { estado: "invalido" };
  }
}

function leerGuardia(cwd) {
  const leido = leerObjetoSeguro(join(cwd, ".fabrica", "guardia.json"));
  if (leido.estado === "ausente") return { activo: true, valido: true };
  if (leido.estado !== "valido") return { activo: true, valido: false };
  if (Object.hasOwn(leido.objeto, "activo") && typeof leido.objeto.activo !== "boolean") {
    return { activo: true, valido: false };
  }
  return { activo: leido.objeto.activo !== false, valido: true };
}

function estadoCongelamiento(objeto, cwd) {
  const directorio = objeto?.directorio;
  if (directorio === undefined || directorio === null || directorio === "") return { estado: "ausente" };
  if (typeof directorio !== "string" || !directorio.trim()) return { estado: "invalido" };
  const rutaConfigurada = resolve(cwd, directorio);
  const inspeccion = inspeccionarRuta(rutaConfigurada);
  if (!inspeccion.ok || !inspeccion.existe || !inspeccion.esDirectorio) return { estado: "invalido" };
  return { estado: "activo", ruta: inspeccion.ruta, directorio };
}

function leerCongelamiento(cwd) {
  const leido = leerObjetoSeguro(join(cwd, ".fabrica", "congelar.json"));
  if (leido.estado === "ausente") return { estado: "ausente" };
  if (leido.estado !== "valido") return { estado: "invalido" };
  return estadoCongelamiento(leido.objeto, cwd);
}

function jsonEfectivo(texto) {
  try {
    const valor = JSON.parse(texto);
    return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : null;
  } catch { return null; }
}

function reemplazarEdicion(texto, edicion) {
  if (typeof edicion?.old_string !== "string" || typeof edicion?.new_string !== "string") return null;
  if (edicion.old_string.length === 0) return null;
  const cantidad = texto.split(edicion.old_string).length - 1;
  if (edicion.replace_all === true) return texto.split(edicion.old_string).join(edicion.new_string);
  if (cantidad !== 1) return null;
  return texto.replace(edicion.old_string, edicion.new_string);
}

function contenidoPropuesto(objetivo, tool, input) {
  if (tool === "Write") {
    if (typeof input.content === "string") return input.content;
    if (typeof input.new_string === "string") return input.new_string;
    return null;
  }
  const actual = leerArchivoSeguro(objetivo);
  if (actual.estado !== "valido") return null;
  let texto = actual.texto;
  if (tool === "Edit") return reemplazarEdicion(texto, input);
  if (tool === "MultiEdit") {
    if (!Array.isArray(input.edits) || input.edits.length === 0) return null;
    for (const edicion of input.edits) {
      texto = reemplazarEdicion(texto, edicion);
      if (texto === null) return null;
    }
    return texto;
  }
  return null;
}

function cambioReduceGuardia(cwd, contenido) {
  const nuevo = jsonEfectivo(contenido);
  if (!nuevo) return true;
  const anterior = leerGuardia(cwd);
  const nuevoActivo = nuevo.activo !== false;
  return anterior.activo && !nuevoActivo;
}

function cambioReduceCongelamiento(cwd, contenido, anterior) {
  const nuevoObjeto = jsonEfectivo(contenido);
  if (!nuevoObjeto) return true;
  const nuevo = estadoCongelamiento(nuevoObjeto, cwd);
  if (anterior.estado === "invalido" || nuevo.estado === "invalido") return true;
  if (anterior.estado === "ausente") return false;
  if (nuevo.estado === "ausente") return true;
  // El conjunto de escrituras nuevas debe estar contenido en el anterior.
  return !dentroDe(nuevo.ruta, anterior.ruta);
}

// Contexto de lo que se va a registrar. SOLO metadatos: nombre de herramienta
// y, si aplica, nombre de skill. Nunca el comando, la ruta ni los argumentos
// — un comando de shell puede llevar una credencial y esto escribe a disco.
let contexto = null;

function salir(decision) {
  try { if (contexto) registrar({ ...contexto, d: decision }, { raiz: contexto.raiz }); } catch {}
  process.exit(0);
}

function responder(decision, razon) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: razon,
    },
  }));
  salir(decision);
}

// Patrones destructivos: [regex, descripción]. Cobertura Bash + PowerShell + cmd + SQL.
const DESTRUCTIVOS = [
  // El patrón original exigía que `r` y `f` estuvieran en el MISMO token, así
  // que `rm -r -f x` y `rm --recursive --force x` pasaban sin aviso — dos de
  // las formas más comunes de escribirlo (encontrado auditando, 2026-07-25).
  // Ahora se piden por separado con lookaheads acotados a `[^\n;|&]*`, que
  // impide cruzar a otro comando encadenado.
  [/\brm\b(?=[^\n;|&]*\s-{1,2}(?:[a-z]*r[a-z]*|recursive)\b)(?=[^\n;|&]*\s-{1,2}(?:[a-z]*f[a-z]*|force)\b)/i,
    "rm recursivo y forzado (en cualquier orden, flags cortos o largos)"],
  [/\bfind\b[^\n;|&]*\s-delete\b/i, "find -delete (borrado masivo sin confirmación)"],
  [/\bfind\b[^\n;|&]*-exec\s+rm\b/i, "find -exec rm (borrado masivo)"],
  [/\bshred\b/i, "shred (borrado irrecuperable)"],
  [/\btruncate\b[^\n;|&]*(-s|--size)\s*0\b/i, "truncate a cero (vacía el archivo)"],
  [/\bchmod\b[^\n;|&]*-R[^\n;|&]*\s0{3,4}\b/i, "chmod -R 000 (deja el árbol inaccesible)"],
  // Descartan TODO el trabajo no commiteado, igual que `git reset --hard`.
  // Solo se alerta sobre el árbol completo (`.` o sin ruta): restaurar un
  // archivo concreto es una operación cotidiana y alertarla sería ruido.
  [/\bgit\s+checkout\s+(--\s+)?\.(\s|$)/i, "git checkout -- . (descarta TODOS los cambios locales)"],
  [/\bgit\s+restore\s+(--\s+)?\.(\s|$)/i, "git restore . (descarta TODOS los cambios locales)"],
  [/\bgit\s+stash\s+(clear|drop)\b/i, "git stash clear/drop (borra trabajo guardado)"],
  [/\b(ri|del|erase|Remove-Item)\b[^|;]*(-Recurse|-Force)\b/i, "Borrado recursivo/forzado en PowerShell"],
  [/\bRemove-Item\b[^|;]*-Recurse\b[^|;]*-Force\b/i, "Remove-Item -Recurse -Force"],
  [/\bRemove-Item\b[^|;]*-Force\b[^|;]*-Recurse\b/i, "Remove-Item -Force -Recurse"],
  [/\bgit\s+reset\s+--hard\b/i, "git reset --hard (descarta cambios locales)"],
  [/\bgit\s+clean\s+-[a-z]*f/i, "git clean -f (borra archivos no versionados)"],
  [/\bgit\s+branch\s+-D\b/i, "borrado forzado de rama"],
  [/\b(DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i, "SQL destructivo"],
  [/\b(del|erase)\s+(\/[a-z]\s+)*\/s\b/i, "del /s (borrado recursivo cmd)"],
  [/\b(rd|rmdir)\s+(\/[a-z]\s+)*\/s\b/i, "rd /s (borrado recursivo cmd)"],
  [/\bformat\s+[a-z]:/i, "formateo de unidad"],
  [/\bmkfs(\.\w+)?\b/i, "creación de sistema de archivos"],
  [/\bdd\b[^\n]*\bof=\/dev\//i, "dd sobre dispositivo"],
  [/>\s*\/dev\/sd[a-z]\b/i, "escritura directa a disco"],
];

try {
  const entrada = JSON.parse(readFileSync(0, "utf8")); // stdin completo
  const tool = entrada.tool_name ?? "";
  const input = entrada.tool_input ?? {};
  const cwd = entrada.cwd ?? process.cwd();

  // Una invocación de skill llega como herramienta "Skill"; el nombre de la
  // skill es el dato que de verdad importa para saber qué se usa.
  contexto = {
    raiz: cwd,
    ev: tool === "Skill" ? "skill" : "herramienta",
    n: tool === "Skill" ? String(input.skill ?? "?") : tool,
  };

  // ── Protección 2: congelamiento de directorio ─────────────────────────────
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
    const objetivo = resolve(cwd, input.file_path ?? input.notebook_path ?? "");
    const rutaGuardia = rutaOperativa(objetivo, cwd, "guardia.json");
    const rutaCongelar = rutaOperativa(objetivo, cwd, "congelar.json");
    const congelamiento = leerCongelamiento(cwd);

    if (rutaGuardia === "enlace" || rutaCongelar === "enlace") {
      responder("deny", "GUARDIA repofibe: los archivos operativos solo se modifican por su ruta exacta, sin enlaces ni alias.");
    }

    if (congelamiento.estado === "invalido" && rutaCongelar !== "exacta") {
      responder("deny", "GUARDIA repofibe: la politica de congelamiento no se puede validar. Repara .fabrica/congelar.json antes de editar.");
    }

    if (rutaGuardia === "exacta" || rutaCongelar === "exacta") {
      const esGuardia = rutaGuardia === "exacta";
      if (congelamiento.estado === "invalido" && esGuardia) {
        responder("deny", "GUARDIA repofibe: repara primero la politica de congelamiento invalida.");
      }
      const propuesto = contenidoPropuesto(objetivo, tool, input);
      if (propuesto === null) {
        responder("ask", "GUARDIA repofibe: no se pudo determinar el estado completo tras esta edicion. Confirma el cambio de proteccion.");
      }
      const reduce = esGuardia
        ? cambioReduceGuardia(cwd, propuesto)
        : cambioReduceCongelamiento(cwd, propuesto, congelamiento);
      if (reduce) {
        responder("ask",
          "GUARDIA repofibe: esta edicion reduce o no permite verificar la proteccion (" +
          (esGuardia ? "guardia de comandos" : "congelamiento de ediciones") +
          "). Confirma el cambio; el agente no puede reducirla por su cuenta.");
      }
      salir("permitir");
    }

    if (congelamiento.estado === "activo") {
      const inspeccionObjetivo = inspeccionarRuta(objetivo, true);
      if (!inspeccionObjetivo.ok || !dentroDe(inspeccionObjetivo.ruta, congelamiento.ruta)) {
        responder("deny",
          "Ediciones congeladas a " + JSON.stringify(congelamiento.directorio) +
          ". La ruta resuelta del archivo esta fuera del limite.");
      }
    }
    if (congelamiento.estado === "invalido") {
      responder("deny", "GUARDIA repofibe: politica de congelamiento invalida; no se puede comprobar el limite de esta edicion.");
    }
    salir("permitir");
  }

  if (tool === "Bash" || tool === "PowerShell") {
    const congelamiento = leerCongelamiento(cwd);
    if (congelamiento.estado === "activo") {
      responder("deny", "GUARDIA repofibe: Bash y PowerShell quedan bloqueados mientras el congelamiento esta activo. Levanta el congelamiento explicitamente para ejecutar shell.");
    }
    if (congelamiento.estado === "invalido") {
      responder("deny", "GUARDIA repofibe: la politica de congelamiento es invalida; Bash y PowerShell quedan bloqueados hasta repararla.");
    }

    const guardia = leerGuardia(cwd);
    if (!guardia.valido) {
      responder("deny", "GUARDIA repofibe: guardia.json es invalido; Bash y PowerShell quedan bloqueados hasta repararlo.");
    }
    if (!guardia.activo) process.exit(0);
    const comando = String(input.command ?? "");
    const push = analizarGitPush(comando);
    if (push.requiereProteccion) {
      responder("ask", "GUARDIA repofibe: git push incluye una actualizacion forzada (--force/-f o refspec +). Confirma que es intencional antes de ejecutarlo.");
    }
    for (const [patron, descripcion] of DESTRUCTIVOS) {
      if (patron.test(comando)) {
        responder("ask",
          "GUARDIA repofibe: el comando contiene \"" + descripcion + "\". " +
          "Confirma que es intencional antes de ejecutarlo. (Desactivar: /guardian off)");
      }
    }
  }

  salir("permitir");
} catch {
  process.exit(0); // fail-open: nunca romper la sesión
}
