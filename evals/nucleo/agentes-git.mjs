#!/usr/bin/env node
// Harness Windows: coordinación exclusiva mediante branches/worktrees locales.
// Todo Git se ejecuta únicamente bajo una raíz temporal sintética, que se
// conserva al terminar para inspeccionar la evidencia.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { integrar, preparar, validar } from "../../nucleo/agentes-git.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "repofibe-agentes-git-"));
const OPS = [];
const t0 = Date.now();
const TEST = process.execPath;
const testCode = "const fs=require('node:fs'); for (const p of ['src/api/new.txt','src/docs/new.txt']) if (!fs.existsSync(p)) process.exit(3); if (fs.readFileSync('sentinel.txt','utf8').trim() !== 'untouched') process.exit(4); console.log('suite posterior OK');";

function git(args, cwd, { expected = 0 } = {}) {
  const started = Date.now();
  let stdout = "", stderr = "", code = 0;
  try { stdout = execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 }); }
  catch (e) { stdout = e.stdout?.toString() ?? ""; stderr = e.stderr?.toString() ?? e.message; code = e.status ?? 1; }
  OPS.push({ executable: "git", args: ["-C", cwd, ...args], cwd, code, ms: Date.now() - started });
  assert.equal(code, expected, `git ${args.join(" ")} @ ${cwd}: ${stderr}`);
  return stdout.trim();
}

function fixture(name, agents, extra = {}) {
  const scope = join(ROOT, name);
  const repo = join(scope, "repo");
  const worktreeRoot = join(scope, "worktrees");
  const hooks = join(scope, "hooks-empty");
  mkdirSync(repo, { recursive: true });
  mkdirSync(worktreeRoot, { recursive: true });
  mkdirSync(hooks, { recursive: true });
  git(["init", "-b", "main", "-q"], repo);
  git(["config", "user.name", "Repofibe eval"], repo);
  git(["config", "user.email", "eval@repofibe.invalid"], repo);
  git(["config", "core.hooksPath", hooks], repo);
  writeFileSync(join(repo, "sentinel.txt"), "untouched\n");
  mkdirSync(join(repo, "src", "api"), { recursive: true });
  mkdirSync(join(repo, "src", "docs"), { recursive: true });
  writeFileSync(join(repo, "src", "api", "base.txt"), "api base\n");
  writeFileSync(join(repo, "src", "docs", "base.txt"), "docs base\n");
  mkdirSync(join(repo, "contracts"), { recursive: true });
  writeFileSync(join(repo, "contracts", "schema.json"), '{"version":1}\n');
  git(["add", "-A"], repo);
  git(["commit", "-m", "synthetic base"], repo);
  const expectedHead = git(["rev-parse", "HEAD"], repo);
  const config = {
    scopeRoot: scope,
    repo,
    worktreeRoot,
    baseBranch: "main",
    coordinatorBranch: "main",
    expectedHead,
    runId: name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 48),
    agents,
    contracts: ["contracts/schema.json"],
    tests: [{ program: TEST, args: ["-e", testCode], timeoutMs: 10_000 }],
    ...extra,
  };
  return { scope, repo, worktreeRoot, hooks, config, expectedHead };
}

function prepare(f) {
  const result = preparar(f.config);
  assert.equal(result.manifest.estado, "preparada");
  OPS.push(...result.operaciones);
  return result;
}

function commitAgent(agent, files) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(agent.worktree, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, content);
    git(["add", "--", path], agent.worktree);
  }
  git(["commit", "-m", `synthetic change ${agent.id}`], agent.worktree);
}

function expectError(fn, code) {
  let error;
  try { fn(); } catch (e) { error = e; }
  assert.ok(error, `se esperaba ${code}`);
  assert.equal(error.codigo, code, `${error.codigo}: ${error.message}`);
  OPS.push(...(error.operaciones ?? []));
  return error;
}

function branchHead(repo, branch) { return git(["rev-parse", branch], repo); }
function normalized(path) { return readFileSync(path, "utf8").replace(/\r\n/g, "\n"); }

try {
  console.log(`PILOT_ROOT=${ROOT}`);

  // 1. Asignaciones solapadas se rechazan antes de crear ramas o worktrees.
  {
    const f = fixture("overlap", [{ id: "a", paths: ["src/"] }, { id: "b", paths: ["src/api/"] }]);
    const error = expectError(() => preparar(f.config), "OWNERSHIP_TRASLAPADO");
    assert.equal(branchHead(f.repo, "main"), f.expectedHead);
    assert.equal(normalized(join(f.repo, "sentinel.txt")), "untouched\n");
    assert.equal((await import("node:fs")).readdirSync(f.worktreeRoot).length, 0);
    console.log(`ok: ownership traslapado bloqueado (${error.codigo})`);
  }

  // 1b. Un manifiesto editado no puede redirigir integración a otra ruta.
  {
    const f = fixture("manifest-tamper", [{ id: "api", paths: ["src/api/"] }]);
    const run = prepare(f);
    const manifest = JSON.parse(readFileSync(run.manifestPath, "utf8"));
    const outsideSentinel = join(ROOT, "outside-sentinel");
    writeFileSync(outsideSentinel, "must remain unchanged\n");
    manifest.integrationPath = outsideSentinel;
    writeFileSync(run.manifestPath, JSON.stringify(manifest, null, 2));
    const error = expectError(() => validar(run.manifestPath), "MANIFIESTO_INVALIDO");
    assert.equal(normalized(join(f.repo, "sentinel.txt")), "untouched\n");
    assert.equal(readFileSync(outsideSentinel, "utf8"), "must remain unchanged\n");
    console.log(`ok: manifiesto redirigido bloqueado (${error.codigo})`);
  }

  // 2. Un agente que escribe fuera de su ruta no puede pasar validación.
  {
    const f = fixture("outside-contract", [{ id: "api", paths: ["src/api/"] }, { id: "docs", paths: ["src/docs/"] }]);
    const run = prepare(f);
    const api = run.manifest.agents.find((a) => a.id === "api");
    commitAgent(api, { "src/docs/foreign.txt": "unauthorized\n" });
    const error = expectError(() => validar(run.manifestPath), "CONTRATO_RECHAZADO");
    assert.ok(error.outside.some((item) => item.agente === "api" && item.archivos.includes("src/docs/foreign.txt")));
    assert.equal(normalized(join(f.repo, "sentinel.txt")), "untouched\n");
    assert.equal(readFileSync(join(api.worktree, "src", "docs", "foreign.txt"), "utf8"), "unauthorized\n");
    console.log("ok: ruta fuera de contrato rechazada y cambio del agente preservado");
  }

  // 3. Cambio concurrente al mismo archivo: overlap explícito y sin aplicación.
  {
    const f = fixture("same-file", [{ id: "api", paths: ["src/api/"] }, { id: "docs", paths: ["src/docs/"] }]);
    const run = prepare(f);
    const api = run.manifest.agents.find((a) => a.id === "api");
    const docs = run.manifest.agents.find((a) => a.id === "docs");
    commitAgent(api, { "src/api/shared.txt": "api version\n" });
    commitAgent(docs, { "src/api/shared.txt": "docs concurrent version\n" });
    const error = expectError(() => validar(run.manifestPath), "CONTRATO_RECHAZADO");
    assert.ok(error.overlaps.some((item) => item.path === "src/api/shared.txt" && item.agentes.length === 2));
    assert.equal(normalized(join(f.repo, "sentinel.txt")), "untouched\n");
    assert.equal(readFileSync(join(api.worktree, "src", "api", "shared.txt"), "utf8"), "api version\n");
    assert.equal(readFileSync(join(docs.worktree, "src", "api", "shared.txt"), "utf8"), "docs concurrent version\n");
    console.log("ok: dos agentes sobre mismo archivo detectados; no se sobrescribieron sus datos");
  }

  // 4. Un avance concurrente de la rama base invalida el token esperado.
  {
    const f = fixture("base-race", [{ id: "api", paths: ["src/api/"] }]);
    const run = prepare(f);
    writeFileSync(join(f.repo, "concurrent.txt"), "concurrent base commit\n");
    git(["add", "--", "concurrent.txt"], f.repo);
    git(["commit", "-m", "concurrent base update"], f.repo);
    const error = expectError(() => validar(run.manifestPath), "BASE_CAMBIO_CONCURRENTE");
    assert.equal(normalized(join(f.repo, "sentinel.txt")), "untouched\n");
    assert.equal(readFileSync(join(f.repo, "concurrent.txt"), "utf8"), "concurrent base commit\n");
    assert.notEqual(branchHead(f.repo, "main"), f.expectedHead);
    console.log(`ok: base concurrente ${error.codigo}; commit y sentinel permanecen intactos`);
  }

  // 5. Drift de integración con cambios en el mismo archivo: aborta antes de aplicar.
  {
    const f = fixture("integration-conflict", [{ id: "api", paths: ["src/api/"] }]);
    const run = prepare(f);
    const agent = run.manifest.agents[0];
    commitAgent(agent, { "src/api/conflict.txt": "agent version\n" });
    const target = join(run.manifest.integrationPath, "src", "api", "conflict.txt");
    writeFileSync(target, "coordinator concurrent version\n");
    git(["add", "--", "src/api/conflict.txt"], run.manifest.integrationPath);
    git(["commit", "-m", "concurrent integration edit"], run.manifest.integrationPath);
    const integrationBefore = branchHead(f.repo, run.manifest.integrationBranch);
    const error = expectError(() => integrar(run.manifestPath), "INTEGRATION_CHANGED");
    assert.equal(branchHead(f.repo, run.manifest.integrationBranch), integrationBefore);
    assert.equal(readFileSync(target, "utf8"), "coordinator concurrent version\n");
    assert.equal(readFileSync(join(agent.worktree, "src", "api", "conflict.txt"), "utf8"), "agent version\n");
    assert.equal(normalized(join(f.repo, "sentinel.txt")), "untouched\n");
    console.log(`ok: conflicto concurrente ${error.codigo}; ambos lados preservados, sin reset/abort`);

    // Recuperación: run nuevo aislado contra la misma base limpia, sin limpiar el conflicto anterior.
    const recoveryRoot = join(f.scope, "worktrees-recovery");
    mkdirSync(recoveryRoot);
    f.config.worktreeRoot = recoveryRoot;
    f.config.runId = "recovered-run";
    f.config.tests = [{ program: TEST, args: ["-e", "const fs=require('node:fs'); if(fs.readFileSync('sentinel.txt','utf8').trim()!=='untouched') process.exit(5); console.log('recovery OK');"], timeoutMs: 10_000 }];
    const recovery = prepare(f);
    commitAgent(recovery.manifest.agents[0], { "src/api/recovered.txt": "recovered safely\n" });
    const done = integrar(recovery.manifestPath);
    OPS.push(...done.operaciones);
    assert.equal(done.estado, "integrada-validada");
    assert.equal(normalized(join(done.integrationPath, "sentinel.txt")), "untouched\n");
    assert.equal(normalized(join(done.integrationPath, "src", "api", "recovered.txt")), "recovered safely\n");
    assert.equal(readFileSync(target, "utf8"), "coordinator concurrent version\n");
    console.log("ok: recuperación en worktree nuevo; rama de conflicto, sentinel y trabajo agente conservados");
  }

  // 6. Integración normal de rutas exclusivas y suite acordada en Node aislado.
  {
    const f = fixture("happy-path", [{ id: "api", paths: ["src/api/"] }, { id: "docs", paths: ["src/docs/"] }]);
    const run = prepare(f);
    commitAgent(run.manifest.agents.find((a) => a.id === "api"), { "src/api/new.txt": "API ready\n" });
    commitAgent(run.manifest.agents.find((a) => a.id === "docs"), { "src/docs/new.txt": "Docs ready\n" });
    const check = validar(run.manifestPath);
    OPS.push(...check.operaciones);
    assert.equal(check.estado, "validada");
    const result = integrar(run.manifestPath);
    OPS.push(...result.operaciones);
    assert.equal(result.estado, "integrada-validada");
    assert.deepEqual(new Set(result.archivos), new Set(["src/api/new.txt", "src/docs/new.txt"]));
    assert.equal(result.tests.length, 1);
    assert.equal(result.tests[0].code, 0);
    assert.equal(normalized(join(result.integrationPath, "sentinel.txt")), "untouched\n");
    assert.equal(normalized(join(result.integrationPath, "src", "api", "new.txt")), "API ready\n");
    assert.equal(normalized(join(result.integrationPath, "src", "docs", "new.txt")), "Docs ready\n");
    assert.equal(git(["status", "--porcelain"], f.repo), "", "el repositorio coordinador original queda limpio");
    assert.equal(branchHead(f.repo, "main"), f.expectedHead, "la rama base permanece intacta");
    console.log(`ok: integración por git apply --3way en ${result.integrationPath}; test ${result.tests[0].code}`);
  }

  const forbidden = OPS.filter((op) => {
    const command = op.ejecutable === "git" ? op.argumentos?.[4] : op.executable === "git" ? op.args?.[2] : "";
    return ["reset", "clean", "merge"].includes(command?.toLowerCase());
  });
  assert.equal(forbidden.length, 0, `no se esperaban reset/clean/merge: ${JSON.stringify(forbidden)}`);
  console.log(`TOTAL_COMMANDS=${OPS.length}`);
  console.log(`REPOFIBE_GIT_COMMANDS=${OPS.filter((op) => op.ejecutable === "git").length}`);
  console.log(`HARNESS_GIT_COMMANDS=${OPS.filter((op) => op.executable === "git").length}`);
  console.log(`ELAPSED_MS=${Date.now() - t0}`);
  console.log(`SENTINEL_ASSERTIONS=8`);
  console.log("RESULT=PASS");
} catch (error) {
  console.error(`PILOT_ROOT=${ROOT}`);
  console.error(error?.stack ?? error);
  process.exitCode = 1;
}
