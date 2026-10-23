#!/usr/bin/env node
// Coordinación Git segura por ownership y worktrees aislados.
// Solo crea ramas/worktrees en el scope explícito. Nunca limpia ni reescribe
// historia; la integración se aplica en un worktree dedicado que parte de base.

import {
  existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync,
  renameSync, writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ESQUEMA = 1;
const MAX_SALIDA = 2 * 1024 * 1024;
const MAX_TIEMPO = 120_000;

export class ErrorCoordinacion extends Error {
  constructor(codigo, mensaje, detalles = {}) {
    super(mensaje);
    this.name = "ErrorCoordinacion";
    this.codigo = codigo;
    Object.assign(this, detalles);
  }
}

const crearError = (codigo, mensaje, contexto, detalles = {}) =>
  new ErrorCoordinacion(codigo, mensaje, { operaciones: [...(contexto?.operaciones ?? [])], ...detalles });

function canonicaExistente(ruta, etiqueta) {
  if (typeof ruta !== "string" || !ruta.trim()) throw new ErrorCoordinacion("CONFIG_INVALIDA", `${etiqueta} debe ser una ruta no vacía.`);
  try { return realpathSync.native(resolve(ruta)); }
  catch { throw new ErrorCoordinacion("RUTA_INEXISTENTE", `${etiqueta} debe existir: ${ruta}`); }
}

function keyPath(ruta) {
  const p = resolve(ruta).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? p.toLowerCase() : p;
}

function dentroDe(raiz, ruta) {
  const rel = relative(keyPath(raiz), keyPath(ruta));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function mismaRuta(a, b) { return keyPath(a) === keyPath(b); }

function parsearSalida(resultado) {
  if (Buffer.isBuffer(resultado)) return resultado;
  return Buffer.from(resultado ?? "");
}

function entornoGit() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|PREFIX|COMMON_DIR|CEILING_DIRECTORIES)$/i.test(k)) delete env[k];
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_OPTIONAL_LOCKS = "0";
  return env;
}

function ejecutar(programa, args, cwd, contexto, opciones = {}) {
  const inicio = Date.now();
  const resultado = spawnSync(programa, args, {
    cwd,
    env: entornoGit(),
    input: opciones.input,
    encoding: null,
    timeout: opciones.timeout ?? 30_000,
    maxBuffer: MAX_SALIDA,
    windowsHide: true,
    shell: false,
  });
  const out = parsearSalida(resultado.stdout);
  const err = parsearSalida(resultado.stderr);
  const registro = {
    ejecutable: programa,
    argumentos: args,
    cwd,
    codigo: resultado.status,
    senal: resultado.signal ?? null,
    ms: Date.now() - inicio,
    errorProceso: resultado.error?.message ?? null,
    stderr: err.toString("utf8").trim().slice(0, 4000),
  };
  contexto?.operaciones.push(registro);
  return { ...registro, stdout: out, stderrBuffer: err };
}

function gitArgs(ctx, args) {
  return ["-c", `core.hooksPath=${ctx.hooksPath}`, "-c", "core.fsmonitor=false", ...args];
}

function git(ctx, args, cwd = ctx.repo, opciones = {}) {
  const r = ejecutar("git", gitArgs(ctx, args), cwd, ctx, opciones);
  if (r.errorProceso) throw crearError("GIT_NO_DISPONIBLE", `No se pudo iniciar Git: ${r.errorProceso}`, ctx);
  if (r.codigo !== 0 && !opciones.permitirFallo) {
    throw crearError(opciones.codigo ?? "GIT_ERROR", `Git falló (${r.codigo}): git ${args.join(" ")}`, ctx, { stderr: r.stderr });
  }
  return r;
}

function texto(r) { return r.stdout.toString("utf8").replace(/\r\n/g, "\n").trim(); }
function nombres(r) { return r.stdout.toString("utf8").split("\0").filter(Boolean); }

function validarRef(ctx, ref) {
  const r = git(ctx, ["check-ref-format", "--branch", ref], ctx.repo, { permitirFallo: true });
  if (r.codigo !== 0) throw crearError("REF_INVALIDA", `Nombre de rama inválido: ${ref}`, ctx);
}

function validarRootYConfig(config) {
  const scope = canonicaExistente(config.scopeRoot, "scopeRoot");
  const repo = canonicaExistente(config.repo, "repo");
  const worktreeRoot = canonicaExistente(config.worktreeRoot, "worktreeRoot");
  if (!dentroDe(scope, repo)) throw new ErrorCoordinacion("FUERA_DE_SCOPE", "El repositorio debe estar dentro de scopeRoot.");
  if (!dentroDe(scope, worktreeRoot)) throw new ErrorCoordinacion("FUERA_DE_SCOPE", "worktreeRoot debe estar dentro de scopeRoot.");
  if (dentroDe(repo, worktreeRoot) || mismaRuta(repo, worktreeRoot)) {
    throw new ErrorCoordinacion("WORKTREE_DENTRO_DEL_REPO", "worktreeRoot debe estar fuera del árbol de trabajo del repositorio.");
  }
  if (!config.baseBranch || !config.coordinatorBranch || !/^[0-9a-f]{40,64}$/i.test(config.expectedHead ?? "")) {
    throw new ErrorCoordinacion("CONFIG_INVALIDA", "Se requieren baseBranch, coordinatorBranch y expectedHead SHA completo.");
  }
  if (config.coordinatorBranch !== config.baseBranch) {
    throw new ErrorCoordinacion("RAMA_INESPERADA", "La rama coordinadora debe coincidir con la rama base que se inspecciona.");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,47}$/.test(config.runId ?? "")) {
    throw new ErrorCoordinacion("RUN_ID_INVALIDO", "runId debe ser slug (1–48 caracteres alfanuméricos, punto, guion o guion bajo).");
  }
  if (!Array.isArray(config.agents) || config.agents.length < 1 || config.agents.length > 12) {
    throw new ErrorCoordinacion("CONFIG_INVALIDA", "agents debe contener entre 1 y 12 agentes.");
  }
  const ids = new Set();
  const paths = [];
  for (const agent of config.agents) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,39}$/.test(agent.id ?? "") || ids.has(agent.id)) {
      throw new ErrorCoordinacion("AGENTE_INVALIDO", `Identificador de agente inválido o repetido: ${agent.id}`);
    }
    ids.add(agent.id);
    if (!Array.isArray(agent.paths) || agent.paths.length === 0) throw new ErrorCoordinacion("OWNERSHIP_INVALIDO", `${agent.id} debe tener rutas exclusivas explícitas.`);
    const localPaths = new Set();
    for (const raw of agent.paths) {
      if (typeof raw !== "string" || !raw.trim() || raw.includes("\0") || raw.includes("\\")) {
        throw new ErrorCoordinacion("OWNERSHIP_INVALIDO", `Ruta inválida para ${agent.id}: ${raw}`);
      }
      const directory = raw.endsWith("/");
      const p = directory ? raw.slice(0, -1) : raw;
      const parts = p.split("/");
      const reservedWindows = process.platform === "win32" && parts.some((part) => /[<>:"|?*]/.test(part) || /[ .]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
      if (!p || p.startsWith("/") || /^[a-zA-Z]:/.test(p) || parts.some((part) => !part || part === "." || part === "..") || p.toLowerCase() === ".git" || p.toLowerCase().startsWith(".git/") || reservedWindows) {
        throw new ErrorCoordinacion("OWNERSHIP_INVALIDO", `Ruta fuera del repositorio o reservada: ${raw}`);
      }
      const norm = process.platform === "win32" ? p.toLowerCase() : p;
      if (localPaths.has(norm)) throw new ErrorCoordinacion("OWNERSHIP_INVALIDO", `Ruta repetida para ${agent.id}: ${raw}`);
      localPaths.add(norm);
      paths.push({ id: agent.id, path: norm, directory });
    }
  }
  for (let i = 0; i < paths.length; i++) {
    for (let j = i + 1; j < paths.length; j++) {
      const a = paths[i], b = paths[j];
      if (a.id === b.id) continue;
      const aCubreB = a.directory && b.path.startsWith(`${a.path}/`);
      const bCubreA = b.directory && a.path.startsWith(`${b.path}/`);
      if (a.path === b.path || aCubreB || bCubreA) {
        throw new ErrorCoordinacion("OWNERSHIP_TRASLAPADO", `Ownership traslapado: ${a.id}:${a.path} y ${b.id}:${b.path}`);
      }
    }
  }
  const tests = config.tests ?? [];
  if (!Array.isArray(tests) || tests.length === 0) throw new ErrorCoordinacion("TESTS_INVALIDOS", "Se requiere al menos una prueba acordada (program + args).");
  for (const test of tests) {
    if (!test || typeof test.program !== "string" || !test.program.trim() || !Array.isArray(test.args) || test.args.some((x) => typeof x !== "string" || x.includes("\0"))) {
      throw new ErrorCoordinacion("TESTS_INVALIDOS", "Cada prueba debe declarar program y args como argv; no se acepta shell command.");
    }
  }
  const contracts = config.contracts ?? [];
  if (!Array.isArray(contracts) || contracts.some((p) => typeof p !== "string" || !p || p.startsWith("/") || p.includes("\\") || p.split("/").some((part) => !part || part === "." || part === ".." || (process.platform === "win32" && (/[<>:"|?*]/.test(part) || /[ .]$/.test(part)) )))) {
    throw new ErrorCoordinacion("CONTRATOS_INVALIDOS", "contracts debe contener rutas relativas exactas.");
  }
  return { scope, repo, worktreeRoot, tests, contracts };
}

function contextoDe(config, rutas, operaciones = []) {
  return {
    ...rutas,
    hooksPath: join(rutas.worktreeRoot, ".repofibe-hooks-disabled"),
    operaciones,
  };
}

function comprobarRepoBase(ctx, config) {
  const top = texto(git(ctx, ["rev-parse", "--show-toplevel"]));
  if (!mismaRuta(top, ctx.repo)) throw crearError("REPO_INVALIDO", "La ruta configurada no es exactamente la raíz Git esperada.", ctx);
  const branch = texto(git(ctx, ["symbolic-ref", "--quiet", "--short", "HEAD"], ctx.repo, { codigo: "HEAD_DETACHED" }));
  if (branch !== config.coordinatorBranch) throw crearError("RAMA_INESPERADA", `Rama activa ${branch}; se esperaba ${config.coordinatorBranch}.`, ctx);
  const head = texto(git(ctx, ["rev-parse", "HEAD"]));
  if (head.toLowerCase() !== config.expectedHead.toLowerCase()) throw crearError("BASE_CAMBIO_CONCURRENTE", `HEAD cambió: esperado ${config.expectedHead}, actual ${head}.`, ctx, { expectedHead: config.expectedHead, actualHead: head });
  const base = texto(git(ctx, ["rev-parse", `${config.baseBranch}^{commit}`]));
  if (base.toLowerCase() !== config.expectedHead.toLowerCase()) throw crearError("BASE_CAMBIO_CONCURRENTE", `La rama ${config.baseBranch} ya no apunta al commit aprobado.`, ctx, { expectedHead: config.expectedHead, actualHead: base });
  const status = git(ctx, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.stdout.length) throw crearError("REPO_SUCIO", "El repositorio coordinador tiene cambios; se conserva y se cancela la operación.", ctx, { status: status.stdout.toString("utf8") });
  return head;
}

function asegurarWorkspaceVacio(ctx, runId) {
  if (readdirNames(ctx.worktreeRoot).length) throw crearError("WORKTREE_ROOT_NO_VACIO", "worktreeRoot debe estar vacío para este run; no se sobrescriben archivos existentes.", ctx);
  const hooksPath = ctx.hooksPath;
  mkdirSync(hooksPath, { recursive: false });
  if (existsSync(join(ctx.worktreeRoot, `coordinacion-${runId}.json`))) throw crearError("MANIFIESTO_EXISTENTE", "El manifiesto ya existe; elige un runId nuevo.", ctx);
}

function readdirNames(dir) {
  // La raíz debe estar vacía y ser un directorio real, no una junction/symlink.
  const st = lstatSync(dir);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new ErrorCoordinacion("WORKTREE_ROOT_INVALIDO", "worktreeRoot debe ser un directorio existente sin reparse point.");
  return readdirSync(dir);
}

function manifestPath(rutas, runId) { return join(rutas.worktreeRoot, `coordinacion-${runId}.json`); }

function guardarManifest(path, manifest) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  renameSync(tmp, path);
}

function prepararEstructura(config, rutas, operaciones) {
  const ctx = contextoDe(config, rutas, operaciones);
  const baseHead = comprobarRepoBase(ctx, config);
  asegurarWorkspaceVacio(ctx, config.runId);
  const integrationBranch = `repofibe/${config.runId}/integration`;
  const integrationPath = join(rutas.worktreeRoot, "integration");
  const agents = config.agents.map((agent) => ({
    id: agent.id,
    paths: agent.paths,
    branch: `repofibe/${config.runId}/agent/${agent.id}`,
    worktree: join(rutas.worktreeRoot, "agents", agent.id),
    commit: null,
  }));
  const allBranches = [integrationBranch, ...agents.map((a) => a.branch)];
  for (const ref of allBranches) {
    validarRef(ctx, ref);
    const existe = git(ctx, ["show-ref", "--verify", "--quiet", `refs/heads/${ref}`], ctx.repo, { permitirFallo: true });
    if (existe.codigo === 0) throw crearError("RAMA_EXISTENTE", `La rama ${ref} ya existe; se conserva. Usa otro runId.`, ctx);
    if (existe.codigo !== 1) throw crearError("GIT_ERROR", `No se pudo comprobar la rama ${ref}.`, ctx);
  }
  const worktreeList = texto(git(ctx, ["worktree", "list", "--porcelain"]));
  for (const p of [integrationPath, ...agents.map((a) => a.worktree)]) {
    if (existsSync(p) || worktreeList.toLowerCase().includes(`worktree ${p}`.toLowerCase())) {
      throw crearError("WORKTREE_EXISTENTE", `La ruta de worktree ya existe o está registrada: ${p}`, ctx);
    }
  }
  const mPath = manifestPath(rutas, config.runId);
  const manifest = {
    schema: ESQUEMA,
    estado: "creando",
    runId: config.runId,
    creado: new Date().toISOString(),
    scopeRoot: rutas.scope,
    repo: rutas.repo,
    worktreeRoot: rutas.worktreeRoot,
    baseBranch: config.baseBranch,
    coordinatorBranch: config.coordinatorBranch,
    baseCommit: baseHead,
    integrationBranch,
    integrationPath,
    integrationCommit: baseHead,
    contracts: [...(config.contracts ?? [])],
    tests: config.tests ?? [],
    agents,
    operaciones: [...operaciones],
  };
  guardarManifest(mPath, manifest);
  try {
    mkdirSync(dirname(agents[0].worktree), { recursive: true });
    git(ctx, ["worktree", "add", "-b", integrationBranch, integrationPath, baseHead]);
    for (const agent of agents) {
      git(ctx, ["worktree", "add", "-b", agent.branch, agent.worktree, baseHead]);
    }
    comprobarRepoBase(ctx, config);
    manifest.estado = "preparada";
    manifest.operaciones = [...operaciones];
    guardarManifest(mPath, manifest);
    return { manifestPath: mPath, manifest, operaciones };
  } catch (error) {
    manifest.estado = "preparacion-incompleta";
    manifest.error = { codigo: error.codigo ?? "ERROR", mensaje: error.message };
    manifest.operaciones = [...operaciones];
    guardarManifest(mPath, manifest);
    if (error instanceof ErrorCoordinacion) throw error;
    throw crearError("PREPARACION_INCOMPLETA", error.message, ctx, { manifestPath: mPath });
  }
}

export function preparar(config) {
  const operaciones = [];
  const rutas = validarRootYConfig(config);
  const ctx = contextoDe(config, rutas, operaciones);
  const head = comprobarRepoBase(ctx, config);
  if (head.toLowerCase() !== config.expectedHead.toLowerCase()) throw crearError("BASE_CAMBIO_CONCURRENTE", "La base no coincide con expectedHead.", ctx);
  return prepararEstructura(config, rutas, operaciones);
}

function cargarManifest(path) {
  const resolved = resolve(path);
  let st;
  try { st = lstatSync(resolved); }
  catch { throw new ErrorCoordinacion("MANIFIESTO_NO_ENCONTRADO", `No existe el manifiesto: ${path}`); }
  if (!st.isFile() || st.isSymbolicLink()) throw new ErrorCoordinacion("MANIFIESTO_INVALIDO", "El manifiesto debe ser un archivo regular, no symlink/junction.");
  let manifest;
  try { manifest = JSON.parse(readFileSync(resolved, "utf8")); }
  catch { throw new ErrorCoordinacion("MANIFIESTO_INVALIDO", "El manifiesto no contiene JSON válido."); }
  if (manifest.schema !== ESQUEMA || !manifest.runId || !Array.isArray(manifest.agents)) throw new ErrorCoordinacion("MANIFIESTO_INVALIDO", "Esquema de manifiesto no compatible.");
  const scope = canonicaExistente(manifest.scopeRoot, "scopeRoot");
  const repo = canonicaExistente(manifest.repo, "repo");
  const worktreeRoot = canonicaExistente(manifest.worktreeRoot, "worktreeRoot");
  if (!dentroDe(scope, repo) || !dentroDe(scope, worktreeRoot) || dentroDe(repo, worktreeRoot)) throw new ErrorCoordinacion("FUERA_DE_SCOPE", "El manifiesto apunta fuera de su scope registrado.");
  if (!mismaRuta(dirname(resolved), worktreeRoot) || basename(resolved) !== `coordinacion-${manifest.runId}.json`) {
    throw new ErrorCoordinacion("MANIFIESTO_INVALIDO", "La ruta del manifiesto no corresponde a worktreeRoot/runId.");
  }
  const ctx = { scope, repo, worktreeRoot, hooksPath: join(worktreeRoot, ".repofibe-hooks-disabled"), operaciones: [] };
  if (!existsSync(ctx.hooksPath) || lstatSync(ctx.hooksPath).isSymbolicLink()) throw crearError("HOOKS_PATH_INVALIDO", "Falta el directorio vacío que neutraliza hooks Git.", ctx);
  const rutas = validarRootYConfig({
    scopeRoot: scope,
    repo,
    worktreeRoot,
    baseBranch: manifest.baseBranch,
    coordinatorBranch: manifest.coordinatorBranch,
    expectedHead: manifest.baseCommit,
    runId: manifest.runId,
    agents: manifest.agents,
    contracts: manifest.contracts,
    tests: manifest.tests,
  });
  if (manifest.integrationBranch !== `repofibe/${manifest.runId}/integration` || !mismaRuta(manifest.integrationPath, join(worktreeRoot, "integration"))) {
    throw crearError("MANIFIESTO_INVALIDO", "La rama o ruta de integración no coincide con el run aislado.", ctx);
  }
  for (const agent of manifest.agents) {
    if (agent.branch !== `repofibe/${manifest.runId}/agent/${agent.id}` || !mismaRuta(agent.worktree, join(worktreeRoot, "agents", agent.id))) {
      throw crearError("MANIFIESTO_INVALIDO", `El agente ${agent.id} apunta fuera del worktree aislado o tiene una rama inesperada.`, ctx);
    }
  }
  return { manifest, path: resolved, ctx };
}

function cambiosAgente(agent, manifest, ctx) {
  const branchHead = texto(git(ctx, ["rev-parse", `${agent.branch}^{commit}`], ctx.repo));
  const wtTop = texto(git(ctx, ["rev-parse", "--show-toplevel"], agent.worktree));
  if (!mismaRuta(wtTop, agent.worktree)) throw crearError("AGENT_WORKTREE_INVALIDO", `${agent.id} ya no apunta a su worktree esperado.`, ctx);
  const wtBranch = texto(git(ctx, ["symbolic-ref", "--quiet", "--short", "HEAD"], agent.worktree, { codigo: "AGENT_HEAD_DETACHED" }));
  if (wtBranch !== agent.branch) throw crearError("AGENT_RAMA_INVALIDA", `${agent.id} está en ${wtBranch}, esperaba ${agent.branch}.`, ctx);
  const dirty = git(ctx, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], agent.worktree);
  if (dirty.stdout.length) throw crearError("AGENT_DIRTY", `El worktree de ${agent.id} tiene cambios no confirmados; no se ignoran ni se descartan.`, ctx, { agente: agent.id, status: dirty.stdout.toString("utf8") });
  const anc = git(ctx, ["merge-base", "--is-ancestor", manifest.baseCommit, branchHead], ctx.repo, { permitirFallo: true });
  if (anc.codigo !== 0) throw crearError("AGENT_BASE_INVALIDA", `${agent.id} no desciende del commit base registrado.`, ctx, { agente: agent.id });
  const mb = texto(git(ctx, ["merge-base", manifest.baseCommit, branchHead], ctx.repo));
  if (mb.toLowerCase() !== manifest.baseCommit.toLowerCase()) throw crearError("AGENT_BASE_INVALIDA", `${agent.id} tiene una base compartida distinta de la aprobada.`, ctx, { agente: agent.id });
  const diff = git(ctx, ["diff", "--name-only", "-z", "--no-renames", manifest.baseCommit, branchHead, "--"], ctx.repo);
  const changed = nombres(diff);
  const normFile = (file) => process.platform === "win32" ? file.toLowerCase() : file;
  const ownership = agent.paths.map((p) => ({ path: normFile(p.endsWith("/") ? p.slice(0, -1) : p), directory: p.endsWith("/") }));
  const outside = changed.filter((file) => !ownership.some((owner) => normFile(file) === owner.path || (owner.directory && normFile(file).startsWith(`${owner.path}/`))));
  const reservedContracts = [".gitattributes", ".gitmodules", ...manifest.contracts];
  const protectedContracts = changed.filter((file) => reservedContracts.some((p) => normFile(p) === normFile(file)));
  const modes = git(ctx, ["diff", "--summary", "--no-renames", manifest.baseCommit, branchHead, "--"], ctx.repo);
  if (/mode 120000|mode 160000/i.test(texto(modes))) {
    throw crearError("TIPO_DE_ARCHIVO_NO_ADMITIDO", `${agent.id} cambia symlink o submódulo; no se integra automáticamente.`, ctx, { agente: agent.id, resumen: texto(modes) });
  }
  return { id: agent.id, branch: agent.branch, head: branchHead, changed, outside, protectedContracts };
}

function validarIntegracion(run, opciones = {}) {
  const { manifest, ctx } = run;
  const config = { baseBranch: manifest.baseBranch, coordinatorBranch: manifest.coordinatorBranch, expectedHead: manifest.baseCommit };
  comprobarRepoBase(ctx, config);
  const integrationHead = texto(git(ctx, ["rev-parse", "HEAD"], manifest.integrationPath));
  const integrationBranch = texto(git(ctx, ["symbolic-ref", "--quiet", "--short", "HEAD"], manifest.integrationPath, { codigo: "INTEGRATION_HEAD_DETACHED" }));
  if (integrationBranch !== manifest.integrationBranch) throw crearError("INTEGRATION_BRANCH_INVALIDA", "La rama de integración ya no coincide con el manifiesto.", ctx);
  if (integrationHead.toLowerCase() !== manifest.baseCommit.toLowerCase()) {
    throw crearError("INTEGRATION_CHANGED", "La rama/worktree de integración cambió concurrentemente; se conserva íntegra y no se aplica nada.", ctx, { esperado: manifest.baseCommit, actual: integrationHead });
  }
  const integrationDirty = git(ctx, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], manifest.integrationPath);
  if (integrationDirty.stdout.length) throw crearError("INTEGRATION_DIRTY", "El worktree de integración ya tiene cambios; no se sobrescribe ni se limpia.", ctx, { status: integrationDirty.stdout.toString("utf8") });
  const changes = manifest.agents.map((agent) => cambiosAgente(agent, manifest, ctx));
  const changedByPath = new Map();
  for (const change of changes) {
    for (const path of change.changed) {
      const key = process.platform === "win32" ? path.toLowerCase() : path;
      const list = changedByPath.get(key) ?? [];
      list.push(change.id);
      changedByPath.set(key, list);
    }
  }
  const overlaps = [...changedByPath].filter(([, owners]) => owners.length > 1).map(([path, owners]) => ({ path, agentes: owners }));
  const outside = changes.filter((c) => c.outside.length).map((c) => ({ agente: c.id, archivos: c.outside }));
  const contracts = changes.filter((c) => c.protectedContracts.length).map((c) => ({ agente: c.id, archivos: c.protectedContracts }));
  if (outside.length || contracts.length || overlaps.length) {
    throw crearError("CONTRATO_RECHAZADO", "No se integra: hay cambios fuera de ownership, en contratos o solapados entre agentes.", ctx, { outside, contracts, overlaps });
  }
  if (!opciones.saltarEstado) {
    manifest.agents = manifest.agents.map((agent, i) => ({ ...agent, commit: changes[i].head, changed: changes[i].changed }));
  }
  return { changes, overlaps };
}

export function validar(manifestFile) {
  const run = cargarManifest(manifestFile);
  const { manifest, ctx } = run;
  const before = ctx.operaciones.length;
  try {
    const result = validarIntegracion(run);
    manifest.estado = "validada";
    manifest.validada = new Date().toISOString();
    manifest.operaciones.push(...ctx.operaciones.slice(before));
    guardarManifest(run.path, manifest);
    return { estado: manifest.estado, cambios: result.changes, operaciones: ctx.operaciones };
  } catch (error) {
    manifest.estado = "bloqueada";
    manifest.error = { codigo: error.codigo ?? "ERROR", mensaje: error.message, detalles: error.outside || error.contracts || error.overlaps ? { outside: error.outside, contracts: error.contracts, overlaps: error.overlaps } : undefined };
    manifest.operaciones.push(...ctx.operaciones.slice(before));
    guardarManifest(run.path, manifest);
    if (error instanceof ErrorCoordinacion) {
      error.operaciones = ctx.operaciones;
      throw error;
    }
    throw crearError("VALIDACION_FALLIDA", error.message, ctx);
  }
}

function archivosIntegrados(ctx, manifest) {
  return nombres(git(ctx, ["diff", "--cached", "--name-only", "-z", "--no-renames", manifest.baseCommit, "--"], manifest.integrationPath));
}

function testsIntegracion(ctx, manifest) {
  const results = [];
  for (const test of manifest.tests) {
    const r = ejecutar(test.program, test.args, manifest.integrationPath, ctx, { timeout: test.timeoutMs ?? MAX_TIEMPO });
    const out = r.stdout.toString("utf8").slice(-8000);
    const stderr = r.stderr;
    const record = { program: test.program, args: test.args, cwd: manifest.integrationPath, code: r.codigo, ms: r.ms, stdout: out, stderr };
    results.push(record);
    if (r.errorProceso || r.codigo !== 0) throw crearError("TEST_FALLIDO", `La suite posterior a la integración falló: ${test.program} ${test.args.join(" ")}`, ctx, { tests: results });
  }
  return results;
}

export function integrar(manifestFile) {
  const run = cargarManifest(manifestFile);
  const { manifest, ctx } = run;
  const before = ctx.operaciones.length;
  let applied = [];
  try {
    const { changes } = validarIntegracion(run);
    const allFiles = changes.flatMap((change) => change.changed);
    const canonicalFiles = allFiles.map((p) => process.platform === "win32" ? p.toLowerCase() : p);
    if (new Set(canonicalFiles).size !== canonicalFiles.length) throw crearError("CONFLICTO_DETECTADO", "Dos agentes cambiaron el mismo archivo; se conserva el worktree sin integración.", ctx);
    // Todas las precondiciones se verifican antes de aplicar el primer parche.
    for (const change of changes) {
      comprobarRepoBase(ctx, { baseBranch: manifest.baseBranch, coordinatorBranch: manifest.coordinatorBranch, expectedHead: manifest.baseCommit });
      const currentAgentHead = texto(git(ctx, ["rev-parse", `${change.branch}^{commit}`], ctx.repo));
      if (currentAgentHead.toLowerCase() !== change.head.toLowerCase()) {
        throw crearError("AGENT_CHANGED_CONCURRENTLY", `La rama de ${change.id} avanzó después de validarla; se conserva todo y no se aplica su parche.`, ctx, { agente: change.id, esperado: change.head, actual: currentAgentHead });
      }
      const agentStatus = git(ctx, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], manifest.agents.find((a) => a.id === change.id).worktree);
      if (agentStatus.stdout.length) throw crearError("AGENT_CHANGED_CONCURRENTLY", `El worktree de ${change.id} recibió cambios después de validarlo; se preservan.`, ctx, { agente: change.id, status: agentStatus.stdout.toString("utf8") });
      const head = texto(git(ctx, ["rev-parse", "HEAD"], manifest.integrationPath));
      if (head.toLowerCase() !== manifest.baseCommit.toLowerCase()) throw crearError("INTEGRATION_CHANGED", "La rama de integración cambió durante la operación; se detiene sin revertir archivos.", ctx);
      const expected = new Set(applied);
      const stagedBefore = nombres(git(ctx, ["diff", "--cached", "--name-only", "-z"], manifest.integrationPath));
      const unstagedBefore = nombres(git(ctx, ["diff", "--name-only", "-z"], manifest.integrationPath));
      const untrackedBefore = nombres(git(ctx, ["ls-files", "--others", "--exclude-standard", "-z"], manifest.integrationPath));
      if (unstagedBefore.length || untrackedBefore.length || stagedBefore.some((p) => !expected.has(p)) || [...expected].some((p) => !stagedBefore.includes(p))) {
        throw crearError("INTEGRATION_CHANGED", "Se detectó una edición concurrente en el worktree de integración; se conservan todos los archivos.", ctx, { staged: stagedBefore, unstaged: unstagedBefore, untracked: untrackedBefore });
      }
      const patch = git(ctx, ["diff", "--binary", "--no-ext-diff", "--no-renames", manifest.baseCommit, change.head, "--"], ctx.repo);
      if (!patch.stdout.length) continue;
      const appliedResult = ejecutar("git", gitArgs(ctx, ["apply", "--3way", "--index"]), manifest.integrationPath, ctx, { input: patch.stdout, timeout: 30_000 });
      if (appliedResult.errorProceso || appliedResult.codigo !== 0) {
        throw crearError("CONFLICTO_GIT", `Git no pudo aplicar el parche de ${change.id}; el worktree de integración se conserva para inspección.`, ctx, { agente: change.id, stderr: appliedResult.stderr, worktree: manifest.integrationPath });
      }
      applied = [...new Set([...applied, ...change.changed])];
      const nowCached = new Set(nombres(git(ctx, ["diff", "--cached", "--name-only", "-z"], manifest.integrationPath)));
      const nowUnstaged = nombres(git(ctx, ["diff", "--name-only", "-z"], manifest.integrationPath));
      const nowUntracked = nombres(git(ctx, ["ls-files", "--others", "--exclude-standard", "-z"], manifest.integrationPath));
      if (nowUnstaged.length || nowUntracked.length || [...nowCached].some((p) => !applied.includes(p))) {
        throw crearError("INTEGRATION_CHANGED", "El worktree de integración cambió durante la aplicación; se conservan los resultados parciales.", ctx, { staged: [...nowCached], unstaged: nowUnstaged, untracked: nowUntracked });
      }
    }
    const files = archivosIntegrados(ctx, manifest);
    if (files.some((file) => !allFiles.includes(file))) throw crearError("CONFLICTO_DETECTADO", "El resultado integrado incluye archivos fuera de los parches aprobados.", ctx, { files });
    const tests = testsIntegracion(ctx, manifest);
    manifest.estado = "integrada-validada";
    manifest.integrada = new Date().toISOString();
    manifest.archivosIntegrados = files;
    manifest.testsResultado = tests;
    manifest.operaciones.push(...ctx.operaciones.slice(before));
    guardarManifest(run.path, manifest);
    return { estado: manifest.estado, integrationPath: manifest.integrationPath, integrationBranch: manifest.integrationBranch, archivos: files, tests, operaciones: ctx.operaciones };
  } catch (error) {
    manifest.estado = error.codigo === "CONFLICTO_GIT" || error.codigo === "CONFLICTO_DETECTADO" ? "conflicto-conservado" : error.codigo === "TEST_FALLIDO" ? "tests-fallidos-conservados" : "bloqueada-conservada";
    manifest.error = { codigo: error.codigo ?? "ERROR", mensaje: error.message, worktree: manifest.integrationPath, detalles: error.outside || error.contracts || error.overlaps ? { outside: error.outside, contracts: error.contracts, overlaps: error.overlaps } : undefined };
    try { manifest.archivosIntegrados = archivosIntegrados(ctx, manifest); }
    catch (scanError) { manifest.archivosIntegrados = null; manifest.error.scanError = scanError.message; }
    manifest.operaciones.push(...ctx.operaciones.slice(before));
    guardarManifest(run.path, manifest);
    if (error instanceof ErrorCoordinacion) { error.operaciones = ctx.operaciones; throw error; }
    throw crearError("INTEGRACION_FALLIDA", error.message, ctx, { worktree: manifest.integrationPath });
  }
}

function leerJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new ErrorCoordinacion("CONFIG_INVALIDA", `No se pudo leer JSON: ${path}`); }
}

function mostrar(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [cmd, file] = process.argv.slice(2);
  try {
    if (!file) throw new ErrorCoordinacion("USO", "Uso: node nucleo/agentes-git.mjs preparar <config.json> | validar <manifest.json> | integrar <manifest.json>");
    if (cmd === "preparar") mostrar(preparar(leerJson(file)));
    else if (cmd === "validar") mostrar(validar(file));
    else if (cmd === "integrar") mostrar(integrar(file));
    else throw new ErrorCoordinacion("USO", "Comando inválido. Usa preparar, validar o integrar.");
  } catch (error) {
    mostrar({ error: { codigo: error.codigo ?? "ERROR", mensaje: error.message, detalles: error.detalles, worktree: error.worktree, operaciones: error.operaciones ?? [] } });
    process.exitCode = 1;
  }
}
