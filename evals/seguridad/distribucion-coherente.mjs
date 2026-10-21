#!/usr/bin/env node
// Regresión de F01: lo instalado debe corresponder a una distribución
// identificada, verificable y completa, no solo a la versión del checkout.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VERSION = readFileSync(join(RAIZ, "VERSION"), "utf8").trim();
const temporal = mkdtempSync(join(tmpdir(), "repofibe-distribucion-"));
const fuente = join(temporal, "fuente");
const hogar = join(temporal, "hogar");
const workspace = join(temporal, "workspace");
mkdirSync(workspace, { recursive: true });

// Un checkout temporal permite probar un commit autocontenido con estos
// cambios aún sin integrar. Las únicas rutas copiadas son producto estable.
cpSync(RAIZ, fuente, {
  recursive: true,
  filter: (path) => {
    const rel = relative(RAIZ, path);
    if (!rel) return true;
    const partes = rel.split(sep);
    return [".claude-plugin", "hooks", "nucleo", "plantillas", "skills"].includes(partes[0]) ||
      ["VERSION", "FILOSOFIA.md", "package.json", "package-lock.json"].includes(rel);
  },
});
const gitOpts = { stdio: "ignore" };
execFileSync("git", ["-C", fuente, "init", "--quiet"], gitOpts);
execFileSync("git", ["-C", fuente, "config", "user.email", "eval@example.invalid"], gitOpts);
execFileSync("git", ["-C", fuente, "config", "user.name", "Repofibe eval"], gitOpts);
execFileSync("git", ["-C", fuente, "add", "VERSION", "FILOSOFIA.md", "package.json", "package-lock.json", ".claude-plugin", "hooks", "nucleo", "plantillas", "skills"], gitOpts);
execFileSync("git", ["-C", fuente, "commit", "--quiet", "-m", "fixture de distribución"], gitOpts);
// Simula los dos experimentos fuera de Git, igual que en la auditoría.
writeFileSync(join(fuente, "hooks", "antivirus-hook.mjs"), "throw new Error('experimento');\n");
writeFileSync(join(fuente, "nucleo", "antivirus.mjs"), "throw new Error('experimento');\n");
const INSTALADOR = join(fuente, "nucleo", "instalar.mjs");
const COMMIT = execFileSync("git", ["-C", fuente, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const env = {
  ...process.env,
  HOME: hogar,
  USERPROFILE: hogar,
  HOMEDRIVE: hogar.slice(0, 2),
  HOMEPATH: hogar.slice(2),
};
const ejecutar = (archivo, args = []) => spawnSync(process.execPath, [archivo, ...args], {
  cwd: workspace,
  env,
  encoding: "utf8",
  timeout: 30000,
});

try {
  const artefacto = join(temporal, "artefacto");
  const rutaManifiestoArtefacto = join(artefacto, "distribucion.json");
  mkdirSync(artefacto, { recursive: true });
  let r = ejecutar(join(fuente, "nucleo", "distribucion.mjs"), ["--generar", rutaManifiestoArtefacto]);
  assert.equal(r.status, 0, `generación de manifiesto falló:\n${r.stdout}\n${r.stderr}`);
  const manifiestoPaquete = JSON.parse(readFileSync(rutaManifiestoArtefacto, "utf8"));
  assert.equal(manifiestoPaquete.arbolLimpio, true);
  assert.ok(!manifiestoPaquete.archivos.some((f) => ["hooks/antivirus-hook.mjs", "nucleo/antivirus.mjs"].includes(f.ruta)));
  assert.ok(!manifiestoPaquete.archivos.some((f) => /(?:^|\/)(?:node_modules|\.fabrica|auth)(?:\/|$)/.test(f.ruta)));
  assert.ok(!manifiestoPaquete.archivos.some((f) => f.ruta === "distribucion.json"), "el manifiesto no se incluye a sí mismo");
  for (const archivo of manifiestoPaquete.archivos) {
    const destino = join(artefacto, ...archivo.ruta.split("/"));
    mkdirSync(dirname(destino), { recursive: true });
    copyFileSync(join(fuente, ...archivo.ruta.split("/")), destino);
  }
  r = ejecutar(join(artefacto, "nucleo", "distribucion.mjs"), ["--verificar", artefacto]);
  assert.equal(r.status, 0, `verificación del artefacto recién generado falló:\n${r.stdout}\n${r.stderr}`);
  assert.equal(JSON.parse(r.stdout).estado, "coherente");

  r = ejecutar(INSTALADOR, ["--host", "generico", "--workspace", workspace]);
  assert.equal(r.status, 0, `instalación aislada falló:\n${r.stdout}\n${r.stderr}`);

  const app = join(hogar, ".repofibe", "app");
  const manifiestoPath = join(app, "distribucion.json");
  assert.ok(existsSync(manifiestoPath), "la app instalada debe incluir manifiesto de distribución");
  const manifiesto = JSON.parse(readFileSync(manifiestoPath, "utf8"));
  assert.equal(manifiesto.esquema, 1);
  assert.equal(manifiesto.version, VERSION);
  assert.equal(manifiesto.commit, COMMIT, "la identidad de commit debe acompañar a la versión");
  assert.ok(Array.isArray(manifiesto.archivos) && manifiesto.archivos.length > 0);
  assert.ok(manifiesto.archivos.some((f) => f.ruta === "nucleo/diagnostico.mjs"));
  assert.ok(manifiesto.archivos.some((f) => f.ruta === "hooks/guardia.mjs"));
  assert.ok(!manifiesto.archivos.some((f) => /^(?:hooks\/antivirus-hook\.mjs|nucleo\/antivirus\.mjs)$/.test(f.ruta)),
    "la distribución estable debe excluir los dos archivos experimentales");
  assert.ok(!existsSync(join(app, "hooks", "antivirus-hook.mjs")) && !existsSync(join(app, "nucleo", "antivirus.mjs")),
    "el instalador no debe copiar experimentos no versionados junto al producto");

  for (const archivo of manifiesto.archivos) {
    const instalado = readFileSync(join(app, archivo.ruta));
    const hash = createHash("sha256").update(instalado).digest("hex");
    assert.equal(hash, archivo.sha256, `hash instalado incorrecto: ${archivo.ruta}`);
  }

  const diagnostico = join(app, "nucleo", "diagnostico.mjs");
  r = ejecutar(diagnostico, ["--json"]);
  assert.equal(r.status, 0, `diagnóstico de instalación coherente falló:\n${r.stdout}\n${r.stderr}`);
  assert.equal(JSON.parse(r.stdout).estado, "coherente");

  const registroPath = join(hogar, ".repofibe", "instalado.json");
  const registroOriginal = readFileSync(registroPath, "utf8");
  const registro = JSON.parse(registroOriginal);
  registro.distribucion.commit = "0".repeat(40);
  writeFileSync(registroPath, `${JSON.stringify(registro, null, 2)}\n`);
  r = ejecutar(diagnostico, ["--json"]);
  assert.equal(r.status, 1, "un commit registrado diferente debe fallar");
  assert.equal(JSON.parse(r.stdout).estado, "modificada");
  writeFileSync(registroPath, registroOriginal);

  const archivoModificado = join(app, "nucleo", "estado.mjs");
  writeFileSync(archivoModificado, `${readFileSync(archivoModificado, "utf8")}\n// alteración de fixture\n`);
  r = ejecutar(diagnostico, ["--json"]);
  assert.equal(r.status, 1, "una copia alterada no debe aprobar diagnóstico");
  assert.equal(JSON.parse(r.stdout).estado, "modificada");

  unlinkSync(archivoModificado);
  r = ejecutar(diagnostico, ["--json"]);
  assert.equal(r.status, 1, "un módulo faltante debe fallar el diagnóstico");
  assert.equal(JSON.parse(r.stdout).estado, "incompleta");
  r = ejecutar(INSTALADOR, ["--refrescar"]);
  assert.equal(r.status, 0, `refresco de módulo faltante falló:\n${r.stdout}\n${r.stderr}`);
  assert.equal(readFileSync(archivoModificado, "utf8"), readFileSync(join(fuente, "nucleo", "estado.mjs"), "utf8"));

  writeFileSync(archivoModificado, `${readFileSync(archivoModificado, "utf8")}\n// edición protegida\n`);
  r = ejecutar(INSTALADOR, ["--refrescar"]);
  assert.equal(r.status, 1, "un refresco no debe declarar éxito con archivos editados por el usuario");
  assert.match(readFileSync(archivoModificado, "utf8"), /edición protegida/, "la edición del usuario debe sobrevivir al refresco");
} finally {
  rmSync(temporal, { recursive: true, force: true });
}

console.log("F01: identidad, integridad y diagnóstico de la app instalada verificados.");
