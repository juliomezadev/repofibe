// Recibos operacionales locales para gates de pruebas (contrato v1).
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { redactar } from "../secretos.mjs";
import { crearEvidencia } from "./contratos.mjs";

export const VERSION_RECIBO_EJECUCION = 1;
export const VERSION_RUNNER_EJECUCION = "repofibe-ejecuciones/1";

const HASH = (valor) => createHash("sha256").update(valor).digest("hex");
const SEPARADOR = "\0";
const EXTENSIONES_FUENTE = new Set([".cjs", ".css", ".htm", ".html", ".js", ".json", ".jsx", ".mjs", ".ps1", ".py", ".sh", ".ts", ".tsx", ".yaml", ".yml"]);
const ARCHIVOS_CONFIG = new Set(["package.json", "package-lock.json", "tsconfig.json", "jsconfig.json"]);

function ejecutarGit(raiz, args) {
  try {
    const salida = execFileSync("git", ["-C", raiz, ...args], { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "pipe"] }).replace(/\r\n/g, "\n");
    return args.includes("-z") ? salida : salida.trim();
  } catch (error) {
    throw new Error(`No se pudo identificar la revisión Git: ${String(error.stderr ?? error.message).trim()}`);
  }
}

function rutaRelativa(raiz, ruta) {
  return relative(raiz, ruta).split(sep).join("/");
}

function estaDentro(raiz, ruta) {
  const diferencia = relative(raiz, ruta);
  return diferencia === "" || (!diferencia.startsWith(`..${sep}`) && diferencia !== ".." && !isAbsolute(diferencia));
}

function workspaceSnapshot(raiz) {
  const commit = ejecutarGit(raiz, ["rev-parse", "HEAD"]);
  const tracked = ejecutarGit(raiz, ["ls-files", "-z"]).split(SEPARADOR).filter(Boolean);
  const untracked = ejecutarGit(raiz, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split(SEPARADOR).filter(Boolean)
    .filter((ruta) => EXTENSIONES_FUENTE.has(extname(ruta).toLowerCase()) || ARCHIVOS_CONFIG.has(ruta.split(/[\\/]/).at(-1)));
  const rutas = [...new Set([...tracked, ...untracked])]
    .filter((ruta) => !ruta.startsWith(".fabrica/") && !ruta.startsWith(".git/") && !ruta.includes("/node_modules/"))
    .sort((a, b) => a.localeCompare(b));
  const fuentes = [];
  const hash = createHash("sha256");
  for (const ruta of rutas) {
    const absoluta = resolve(raiz, ruta);
    let contenido;
    try {
      const meta = lstatSync(absoluta);
      contenido = meta.isSymbolicLink() ? `SYMLINK:${readlinkSync(absoluta)}` : readFileSync(absoluta);
    } catch (error) {
      contenido = `MISSING:${error.code ?? "unknown"}`;
    }
    const sha256 = HASH(contenido);
    fuentes.push({ ruta: rutaRelativa(raiz, absoluta), sha256 });
    hash.update(rutaRelativa(raiz, absoluta)); hash.update("\0"); hash.update(sha256); hash.update("\0");
  }
  return { commit, fuentes, fingerprint: hash.digest("hex") };
}

function idWorkspace(raiz) {
  return HASH(realpathSync(raiz).replaceAll("\\", "/").toLowerCase());
}

function validarDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) throw new Error("descriptor de prueba inválido");
  for (const [campo, valor] of Object.entries(descriptor)) {
    if (/(aprobaci[oó]n|public(ar|aci[oó]n)|deploy|publicaci[oó]n)/i.test(campo) && valor) {
      throw new Error("el runner no permite descriptores de aprobación o publicación externa");
    }
    if (typeof valor === "string" && /^(solicitar[-_ ]?aprobaci[oó]n|publicar|publicaci[oó]n|deploy)$/i.test(valor.trim())) {
      throw new Error("el runner no permite descriptores de aprobación o publicación externa");
    }
  }
  if (typeof descriptor.gateId !== "string" || !descriptor.gateId.trim()) throw new Error("gateId es obligatorio");
  if (typeof descriptor.comando !== "string" || !descriptor.comando.trim()) throw new Error("comando es obligatorio");
  if (!Array.isArray(descriptor.args) || descriptor.args.some((arg) => typeof arg !== "string")) throw new Error("args debe ser una lista de textos");
  const ejecutable = descriptor.comando.toLowerCase().replaceAll("\\", "/").split("/").at(-1).replace(/\.(exe|cmd|bat)$/i, "");
  const args = descriptor.args.map((arg) => arg.toLowerCase());
  const peligroso = (ejecutable === "git" && args.includes("push")) ||
    (["npm", "pnpm", "yarn"].includes(ejecutable) && args.includes("publish")) ||
    (ejecutable === "gh" && args[0] === "release" && args[1] === "create");
  if (peligroso) throw new Error("comando de publicación externa no permitido en un gate de prueba");
}

function validarCwd(raiz, cwd) {
  const destino = realpathSync(resolve(cwd ?? raiz));
  if (!estaDentro(raiz, destino)) throw new Error("cwd debe permanecer dentro del workspace del recibo");
  return destino;
}

function escribirNuevo(ruta, contenido) {
  writeFileSync(ruta, contenido, { encoding: "utf8", flag: "wx" });
}

function argumentosVisibles(args) {
  return args.map((arg) => /^--?[A-Za-z][A-Za-z0-9_-]*$/.test(arg)
    ? arg
    : `<REDACTADO:${Buffer.byteLength(arg, "utf8")} bytes>`);
}

function directorioEjecuciones(raiz, crear) {
  let actual = raiz;
  for (const segmento of [".fabrica", "ejecuciones"]) {
    const ruta = join(actual, segmento);
    if (!existsSync(ruta)) {
      if (!crear) return null;
      try { mkdirSync(ruta); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
    }
    const info = lstatSync(ruta);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`directorio de recibos inseguro: ${rutaRelativa(raiz, ruta)}`);
    const real = realpathSync(ruta);
    if (!estaDentro(raiz, real)) throw new Error(`directorio de recibos fuera del workspace: ${rutaRelativa(raiz, real)}`);
    actual = ruta;
  }
  return actual;
}

function archivoRegularDentro(raiz, ruta) {
  const info = lstatSync(ruta);
  if (info.isSymbolicLink() || !info.isFile()) return false;
  return estaDentro(raiz, realpathSync(ruta));
}

export async function ejecutarPrueba(descriptor = {}) {
  validarDescriptor(descriptor);
  const raiz = realpathSync(resolve(descriptor.workspace ?? descriptor.cwd ?? process.cwd()));
  const cwd = validarCwd(raiz, descriptor.cwd ?? raiz);
  const timeoutMs = descriptor.timeoutMs ?? 120_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) throw new Error("timeoutMs debe estar entre 1 y 600000");
  const carpeta = directorioEjecuciones(raiz, true);
  const runId = `run-${randomUUID()}`;
  const stdoutPath = join(carpeta, `${runId}.stdout.log`);
  const stderrPath = join(carpeta, `${runId}.stderr.log`);
  const reciboPath = join(carpeta, `${runId}.json`);

  const antes = workspaceSnapshot(raiz);
  const iniciado = new Date().toISOString();
  const proceso = spawnSync(descriptor.comando, descriptor.args, {
    cwd,
    env: process.env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });
  const finalizado = new Date().toISOString();
  const despues = workspaceSnapshot(raiz);
  const exitCode = Number.isInteger(proceso.status) ? proceso.status : (proceso.error?.code === "ETIMEDOUT" ? 124 : 127);
  const stdout = redactar(proceso.stdout ?? "");
  const stderrRaw = [proceso.stderr ?? "", proceso.error?.message ?? ""].filter(Boolean).join("\n");
  const stderr = redactar(stderrRaw);
  if (directorioEjecuciones(raiz, false) !== carpeta) throw new Error("el directorio de recibos cambió durante la ejecución");
  const stdoutRel = rutaRelativa(raiz, stdoutPath);
  const stderrRel = rutaRelativa(raiz, stderrPath);
  const stdoutText = stdout.texto;
  const stderrText = stderr.texto;
  escribirNuevo(stdoutPath, stdoutText);
  escribirNuevo(stderrPath, stderrText);

  const recibo = {
    version: VERSION_RECIBO_EJECUCION,
    runId,
    gateId: descriptor.gateId.trim(),
    runnerVersion: VERSION_RUNNER_EJECUCION,
    comando: descriptor.comando,
    argsSha256: HASH(JSON.stringify(descriptor.args)),
    argsRedactados: argumentosVisibles(descriptor.args),
    workspaceId: idWorkspace(raiz),
    commit: antes.commit,
    fuentesFingerprint: antes.fingerprint,
    fuentes: antes.fuentes,
    iniciado,
    finalizado,
    exitCode,
    fuentesEstables: antes.commit === despues.commit && antes.fingerprint === despues.fingerprint,
    hashesSalida: { stdout: HASH(stdoutText), stderr: HASH(stderrText) },
    logs: {
      stdout: { ruta: stdoutRel, sha256: HASH(stdoutText), redactado: true, hallazgos: stdout.hallazgos },
      stderr: { ruta: stderrRel, sha256: HASH(stderrText), redactado: true, hallazgos: stderr.hallazgos },
    },
  };
  const reciboBytes = `${JSON.stringify(recibo, null, 2)}\n`;
  escribirNuevo(reciboPath, reciboBytes);
  const sha256Recibo = HASH(reciboBytes);
  const exito = exitCode === 0 && recibo.fuentesEstables;
  const evidencia = crearEvidencia({
    gateId: recibo.gateId,
    tipo: "prueba",
    fuente: descriptor.comando,
    resultado: exito ? "Comando finalizado con éxito y fuentes estables." : `Comando fallido o fuentes modificadas durante la ejecución (exitCode ${exitCode}).`,
    exito,
    exitCode,
    archivos: recibo.fuentes.map((fuente) => fuente.ruta),
    confianza: "alta",
    timestamp: finalizado,
    procedencia: "observada",
    ejecucionRef: { runId, sha256Recibo, argsSha256: recibo.argsSha256 },
  });
  return { recibo, reciboPath, sha256Recibo, evidencia };
}

export function verificarEjecucion(evidencia, gate, workspace = process.cwd()) {
  try {
    const ref = evidencia?.ejecucionRef;
    if (!ref || typeof ref.runId !== "string" || !/^run-[0-9a-f-]{36}$/i.test(ref.runId)) return false;
    const raiz = realpathSync(resolve(workspace));
    const carpeta = directorioEjecuciones(raiz, false);
    if (!carpeta) return false;
    const ruta = join(carpeta, `${ref.runId}.json`);
    if (!existsSync(ruta) || !archivoRegularDentro(raiz, ruta)) return false;
    const bytes = readFileSync(ruta, "utf8");
    if (HASH(bytes) !== ref.sha256Recibo) return false;
    const recibo = JSON.parse(bytes);
    if (recibo.version !== VERSION_RECIBO_EJECUCION || recibo.runId !== ref.runId || recibo.runnerVersion !== VERSION_RUNNER_EJECUCION) return false;
    if (recibo.gateId !== gate.id || evidencia.gateId !== gate.id || recibo.comando !== evidencia.fuente ||
        ref.argsSha256 !== recibo.argsSha256 || !/^[a-f0-9]{64}$/i.test(recibo.argsSha256 ?? "") ||
        !Array.isArray(recibo.argsRedactados) || recibo.exitCode !== 0 || recibo.fuentesEstables !== true) return false;
    if (evidencia.tipo !== "prueba" || evidencia.procedencia !== "observada" || evidencia.exito !== true || evidencia.exitCode !== 0) return false;
    if (evidencia.timestamp !== recibo.finalizado || !Array.isArray(recibo.fuentes) || !Array.isArray(evidencia.archivos)) return false;
    if (JSON.stringify(evidencia.archivos) !== JSON.stringify(recibo.fuentes.map((fuente) => fuente.ruta))) return false;
    if (recibo.workspaceId !== idWorkspace(raiz)) return false;
    const actual = workspaceSnapshot(raiz);
    if (recibo.commit !== actual.commit || recibo.fuentesFingerprint !== actual.fingerprint) return false;
    for (const tipo of ["stdout", "stderr"]) {
      const log = recibo.logs?.[tipo];
      if (!log || log.redactado !== true || typeof log.ruta !== "string" || !/^[a-f0-9]{64}$/i.test(log.sha256)) return false;
      const esperada = rutaRelativa(raiz, join(carpeta, `${ref.runId}.${tipo}.log`));
      if (log.ruta !== esperada) return false;
      const rutaLog = resolve(raiz, log.ruta);
      if (!estaDentro(raiz, rutaLog) || !existsSync(rutaLog) || !archivoRegularDentro(raiz, rutaLog)) return false;
      const logBytes = readFileSync(rutaLog, "utf8");
      if (HASH(logBytes) !== log.sha256 || log.sha256 !== recibo.hashesSalida?.[tipo]) return false;
    }
    return true;
  } catch {
    return false;
  }
}
