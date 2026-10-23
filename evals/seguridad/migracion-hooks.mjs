#!/usr/bin/env node
// Regresión de F17: retirar únicamente el hook experimental conocido, sin
// borrar hooks de otros productos ni reescribir el resto del settings.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INSTALADOR = join(RAIZ, "nucleo", "instalar.mjs");
const temporal = mkdtempSync(join(tmpdir(), "repofibe-migracion-hooks-"));
const hogar = join(temporal, "hogar");
const settingsPath = join(hogar, ".claude", "settings.json");
mkdirSync(dirname(settingsPath), { recursive: true });

function pathSinClaude() {
  const sep = process.platform === "win32" ? ";" : ":";
  const binarios = process.platform === "win32" ? ["claude.cmd", "claude.exe", "claude"] : ["claude"];
  const dirs = (process.env.PATH || "").split(sep).filter(Boolean)
    .filter((dir) => !binarios.some((binario) => existsSync(join(dir, binario))));
  if (process.platform === "win32") {
    const system32 = join(process.env.SystemRoot || "C:\\Windows", "System32");
    if (!dirs.includes(system32)) dirs.push(system32);
  }
  return dirs.join(sep);
}

const rutaLegado = join(hogar, "Desktop", "proyecto Repofibe 5", "repofibe", "hooks", "antivirus-hook.mjs").replaceAll("\\", "/");
const legado = `node "${rutaLegado}"`;
const legadoOtraCuenta = 'node "C:/Users/synthetic-user/Desktop/proyecto Repofibe 5/repofibe/hooks/antivirus-hook.mjs"';
const terceroMismoNombre = `node "${join(temporal, "otro-producto", "hooks", "antivirus-hook.mjs").replaceAll("\\", "/")}"`;
const entrada = (command) => ({ matcher: "*", hooks: [{ type: "command", command }] });
const original = {
  model: "sonnet",
  permissions: { allow: ["Bash(ls)"], deny: [] },
  hooks: {
    PostToolUse: [entrada(legado), entrada(legadoOtraCuenta), entrada(terceroMismoNombre), entrada("node user-hook.mjs")],
  },
};
writeFileSync(settingsPath, `${JSON.stringify(original, null, 2)}\n`);

const env = {
  ...process.env,
  HOME: hogar,
  USERPROFILE: hogar,
  HOMEDRIVE: hogar.slice(0, 2),
  HOMEPATH: hogar.slice(2),
  PATH: pathSinClaude(),
};
const r = spawnSync(process.execPath, [INSTALADOR, "--host", "claude"], {
  cwd: temporal,
  env,
  encoding: "utf8",
  timeout: 90000,
});

try {
  assert.equal(r.status, 0, `instalación aislada falló:\n${r.stdout}\n${r.stderr}`);
  const actualizado = JSON.parse(readFileSync(settingsPath, "utf8"));
  const comandosPostTool = actualizado.hooks.PostToolUse.flatMap((e) => e.hooks.map((h) => h.command));
  assert.ok(!comandosPostTool.includes(legado), "debe retirar la ruta exacta del hook experimental legado");
  assert.ok(comandosPostTool.includes(legadoOtraCuenta), "debe preservar la ruta homónima bajo otro perfil");
  assert.ok(comandosPostTool.includes(terceroMismoNombre), "debe preservar otro hook con el mismo nombre en otra ruta");
  assert.ok(comandosPostTool.includes("node user-hook.mjs"), "debe preservar el hook del usuario");
  assert.deepEqual(actualizado.permissions, original.permissions);
  assert.equal(actualizado.model, original.model);

  const app = join(hogar, ".repofibe", "app");
  const guardia = actualizado.hooks.PreToolUse.flatMap((e) => e.hooks).find((h) => /guardia\.mjs/.test(h.command));
  const sesion = actualizado.hooks.SessionStart.flatMap((e) => e.hooks).find((h) => /sesion\.mjs/.test(h.command));
  assert.ok(guardia && guardia.command.includes(join(app, "hooks", "guardia.mjs").replaceAll("\\", "/")),
    "el hook nuevo debe apuntar al núcleo instalado estable");
  assert.ok(sesion && sesion.command.includes(join(app, "hooks", "sesion.mjs").replaceAll("\\", "/")),
    "SessionStart debe apuntar al núcleo instalado estable");

  const respaldo = `${settingsPath}.bak-repofibe`;
  assert.ok(existsSync(respaldo), "la migración debe conservar un respaldo privado del settings original");
  assert.deepEqual(JSON.parse(readFileSync(respaldo, "utf8")), original);

  const registroPath = join(hogar, ".repofibe", "instalado.json");
  const registroInstalado = JSON.parse(readFileSync(registroPath, "utf8"));
  const registroConPlugin = { ...registroInstalado, plugins: ["repofibe"] };
  writeFileSync(registroPath, `${JSON.stringify(registroConPlugin, null, 2)}\n`);
  const diagnosticoPlugin = spawnSync(process.execPath, [join(RAIZ, "nucleo", "diagnostico.mjs"), "--json", "--host", "claude", "--raiz", join(hogar, ".repofibe", "app")], {
    cwd: temporal, env, encoding: "utf8", timeout: 10000,
  });
  assert.equal(diagnosticoPlugin.status, 0, `diagnostico de plugin registrado fallo:\n${diagnosticoPlugin.stdout}\n${diagnosticoPlugin.stderr}`);
  const jsonPlugin = JSON.parse(diagnosticoPlugin.stdout);
  assert.equal(jsonPlugin.hooks.estado, "registrado_no_verificado");
  assert.equal(jsonPlugin.hooks.guardia, null);
  assert.equal(jsonPlugin.hooks.sesion, null);
  writeFileSync(registroPath, `${JSON.stringify(registroInstalado, null, 2)}\n`);

  const quitar = spawnSync(process.execPath, [INSTALADOR, "--quitar"], {
    cwd: temporal, env, encoding: "utf8", timeout: 90000,
  });
  assert.equal(quitar.status, 0, `desinstalación aislada falló:\n${quitar.stdout}\n${quitar.stderr}`);
  const trasQuitar = JSON.parse(readFileSync(settingsPath, "utf8"));
  const despuesPostTool = trasQuitar.hooks.PostToolUse.flatMap((e) => e.hooks.map((h) => h.command));
  assert.ok(despuesPostTool.includes(terceroMismoNombre) && despuesPostTool.includes("node user-hook.mjs"),
    "desinstalar debe preservar hooks ajenos y del usuario");
  assert.ok(!trasQuitar.hooks.PreToolUse?.some((e) => e.hooks.some((h) => /hooks\/guardia\.mjs/.test(h.command))),
    "desinstalar debe retirar el guardia propio de settings.json");
  assert.ok(!trasQuitar.hooks.SessionStart?.some((e) => e.hooks.some((h) => /hooks\/sesion\.mjs/.test(h.command))),
    "desinstalar debe retirar SessionStart propio de settings.json");

  const hogarDryRun = join(temporal, "hogar-dry-run");
  mkdirSync(join(hogarDryRun, ".claude"), { recursive: true });
  const settingsDryRun = join(hogarDryRun, ".claude", "settings.json");
  writeFileSync(settingsDryRun, "{}\n");
  const dryRun = spawnSync(process.execPath, [INSTALADOR, "--host", "claude", "--dry-run"], {
    cwd: temporal,
    env: { ...env, HOME: hogarDryRun, USERPROFILE: hogarDryRun, HOMEDRIVE: hogarDryRun.slice(0, 2), HOMEPATH: hogarDryRun.slice(2) },
    encoding: "utf8",
    timeout: 90000,
  });
  assert.equal(dryRun.status, 0, `dry-run aislado fallo:\n${dryRun.stdout}\n${dryRun.stderr}`);
  assert.equal(readFileSync(settingsDryRun, "utf8"), "{}\n", "dry-run no debe cambiar settings.json");
  assert.ok(!existsSync(join(hogarDryRun, ".repofibe")), "dry-run no debe crear el home de la app");

  // Simula Claude CLI con una copia temporal de node.exe llamada claude.exe;
  // nunca ejecuta la CLI real ni escribe fuera de este árbol temporal.
  const fakeBin = join(temporal, "fake-bin");
  mkdirSync(fakeBin);
  copyFileSync(process.execPath, join(fakeBin, "claude.exe"));
  const logCli = join(temporal, "claude-mock.jsonl");
  const scriptCli = join(temporal, "plugin");
  writeFileSync(scriptCli, [
    'const fs = require("node:fs");',
    'const path = require("node:path");',
    'const args = process.argv.slice(2);',
    'const mercadoPath = process.env.MOCK_CLAUDE_MARKET_STATE;',
    'const pluginsPath = process.env.MOCK_CLAUDE_PLUGINS_STATE;',
    'const leer = (p) => JSON.parse(fs.readFileSync(p, "utf8"));',
    'const guardar = (p, valor) => fs.writeFileSync(p, JSON.stringify(valor));',
    'fs.appendFileSync(process.env.MOCK_CLAUDE_LOG, JSON.stringify(args) + "\\n");',
    'if (args[0] === "marketplace" && args[1] === "list") { console.log(JSON.stringify(leer(mercadoPath))); process.exit(0); }',
    'if (args[0] === "list") { console.log(JSON.stringify(leer(pluginsPath))); process.exit(0); }',
    'if (args[0] === "marketplace" && args[1] === "add") {',
    '  const mercados = leer(mercadoPath);',
    '  if (mercados.some((m) => m.name === "repofibe-marketplace")) console.log(JSON.stringify({ command: "marketplace-add", outcome: "ok", message: "Marketplace already on disk" }));',
    '  else { mercados.push({ name: "repofibe-marketplace", source: "directory", path: process.env.MOCK_CLAUDE_SOURCE }); guardar(mercadoPath, mercados); console.log(JSON.stringify({ command: "marketplace-add", outcome: "ok", marketplace: "repofibe-marketplace", message: "Successfully added marketplace: repofibe-marketplace" })); }',
    '  process.exit(0);',
    '}',
    'if (args[0] === "marketplace" && args[1] === "remove") {',
    '  if (process.env.MOCK_CLAUDE_MODE === "fail-compensations") process.exit(22);',
    '  const mercados = leer(mercadoPath).filter((m) => m.name !== "repofibe-marketplace");',
    '  guardar(mercadoPath, mercados);',
    '  guardar(pluginsPath, leer(pluginsPath).filter((p) => !p.id.endsWith("@repofibe-marketplace")));',
    '  console.log(JSON.stringify({ command: "marketplace-remove", outcome: "ok", marketplace: "repofibe-marketplace", message: "Successfully removed marketplace: repofibe-marketplace" })); process.exit(0);',
    '}',
    'if (args[0] === "install" && ["fail-install-partial", "fail-compensations"].includes(process.env.MOCK_CLAUDE_MODE)) { const plugins = leer(pluginsPath); if (!plugins.some((p) => p.id === "repofibe@repofibe-marketplace")) plugins.push({ id: "repofibe@repofibe-marketplace", scope: "user", enabled: true }); guardar(pluginsPath, plugins); process.exit(19); }',
    'if (args[0] === "uninstall") {',
    '  if (process.env.MOCK_CLAUDE_MODE === "fail-compensations") process.exit(21);',
    '  guardar(pluginsPath, leer(pluginsPath).filter((p) => !(p.id === "repofibe@repofibe-marketplace" && p.scope === "user")));',
    '  console.log(JSON.stringify({ command: "uninstall", outcome: "ok", message: "Successfully uninstalled plugin: repofibe" })); process.exit(0);',
    '}',
    'if (args[0] === "install") { const plugins = leer(pluginsPath); if (!plugins.some((p) => p.id === "repofibe@repofibe-marketplace")) plugins.push({ id: "repofibe@repofibe-marketplace", scope: "user", enabled: true }); guardar(pluginsPath, plugins); }',
    'if (args[0] === "install" && process.env.MOCK_CLAUDE_MODE === "success-corrupt") {',
    '  fs.writeFileSync(path.join(process.env.USERPROFILE, ".repofibe", "app", "VERSION"), "tampered\\n");',
    '}',
    'if (args[0] === "install" && process.env.MOCK_CLAUDE_MODE === "success-junction") {',
    '  const app = path.join(process.env.USERPROFILE, ".repofibe", "app");',
    '  const hooks = path.join(app, "hooks");',
    '  const saved = path.join(app, "hooks-saved");',
    '  fs.renameSync(hooks, saved);',
    '  const copiarArbol = (origen, destino) => {',
    '    fs.mkdirSync(destino, { recursive: true });',
    '    for (const entry of fs.readdirSync(origen, { withFileTypes: true })) {',
    '      const fuente = path.join(origen, entry.name);',
    '      const salida = path.join(destino, entry.name);',
    '      if (entry.isDirectory()) copiarArbol(fuente, salida);',
    '      else if (entry.isFile()) fs.copyFileSync(fuente, salida);',
    '      else throw new Error("plugin mock rechaza una entrada no regular");',
    '    }',
    '  };',
    '  copiarArbol(saved, process.env.MOCK_CLAUDE_EXTERNAL);',
    '  fs.symlinkSync(process.env.MOCK_CLAUDE_EXTERNAL, hooks, "junction");',
    '  fs.writeFileSync(path.join(app, "VERSION"), "tampered\\n");',
    '}',
    'if (args[0] === "install") console.log(JSON.stringify({ command: "install", outcome: "ok", message: "Successfully installed plugin: repofibe@repofibe-marketplace (scope: user)" }));',
  ].join("\n"));
  const envMock = (hogarMock, modo, directorioExterno = "") => ({
    ...process.env,
    HOME: hogarMock,
    USERPROFILE: hogarMock,
    HOMEDRIVE: hogarMock.slice(0, 2),
    HOMEPATH: hogarMock.slice(2),
    MOCK_CLAUDE_LOG: logCli,
    MOCK_CLAUDE_MODE: modo,
    MOCK_CLAUDE_EXTERNAL: directorioExterno,
    MOCK_CLAUDE_SOURCE: RAIZ,
    MOCK_CLAUDE_MARKET_STATE: estadoMarketplace,
    MOCK_CLAUDE_PLUGINS_STATE: estadoPlugin,
    PATH: `${fakeBin};${pathSinClaude()}`,
  });

  const hogarFallback = join(temporal, "hogar-fallback");
  const estadoPlugin = join(temporal, "plugins-mock-state.json");
  const estadoMarketplace = join(temporal, "marketplace-mock-state.json");
  const resetEstadoMock = (marketplaces = [], plugins = []) => {
    writeFileSync(estadoMarketplace, JSON.stringify(marketplaces));
    writeFileSync(estadoPlugin, JSON.stringify(plugins));
  };
  resetEstadoMock();
  mkdirSync(join(hogarFallback, ".claude"), { recursive: true });
  const settingsFallback = join(hogarFallback, ".claude", "settings.json");
  writeFileSync(settingsFallback, "{}\n");
  resetEstadoMock();
  writeFileSync(logCli, "");
  const pluginFallback = spawnSync(process.execPath, [INSTALADOR, "--host", "claude"], {
    cwd: temporal, env: envMock(hogarFallback, "fail-install-partial"), encoding: "utf8", timeout: 90000,
  });
  assert.equal(pluginFallback.status, 0, `el fallback aislado fallo (error=${pluginFallback.error?.message ?? "sin error de proceso"}):\n${pluginFallback.stdout}\n${pluginFallback.stderr}`);
  const comandosFallback = readFileSync(logCli, "utf8").trim().split("\n").map((s) => JSON.parse(s));
  assert.ok(comandosFallback.some((c) => c[0] === "marketplace" && c[1] === "add"), "el stub debe simular marketplace add");
  assert.ok(comandosFallback.some((c) => c[0] === "install"), "el stub debe simular el fallo de plugin install");
  assert.ok(comandosFallback.some((c) => c[0] === "marketplace" && c[1] === "remove"),
    "si falla plugin install, debe retirar el marketplace recién creado tras comprobar que no quedan plugins");
  assert.deepEqual(JSON.parse(readFileSync(estadoPlugin, "utf8")), [], "debe desinstalar el efecto parcial antes del fallback");
  assert.deepEqual(JSON.parse(readFileSync(estadoMarketplace, "utf8")), [], "debe retirar el marketplace recién creado");

  const hogarMarketplaceTerceros = join(temporal, "hogar-marketplace-terceros");
  mkdirSync(join(hogarMarketplaceTerceros, ".claude"), { recursive: true });
  writeFileSync(join(hogarMarketplaceTerceros, ".claude", "settings.json"), "{}\n");
  const marketplacesTerceros = [{ name: "repofibe-marketplace", source: "directory", path: RAIZ }];
  const pluginsTerceros = [
    { id: "team-linter@repofibe-marketplace", scope: "user", enabled: true },
    { id: "release-helper@repofibe-marketplace", scope: "user", enabled: true },
  ];
  resetEstadoMock(marketplacesTerceros, pluginsTerceros);
  writeFileSync(logCli, "");
  const fallbackMarketplacePreexistente = spawnSync(process.execPath, [INSTALADOR, "--host", "claude"], {
    cwd: temporal, env: envMock(hogarMarketplaceTerceros, "fail-install-partial"), encoding: "utf8", timeout: 90000,
  });
  assert.equal(fallbackMarketplacePreexistente.status, 0,
    `fallo en marketplace preexistente debe caer a copia sin borrarlo:\n${fallbackMarketplacePreexistente.stdout}\n${fallbackMarketplacePreexistente.stderr}`);
  const comandosMarketplacePreexistente = readFileSync(logCli, "utf8").trim().split("\n").map((s) => JSON.parse(s));
  assert.ok(!comandosMarketplacePreexistente.some((c) => c[0] === "marketplace" && (c[1] === "add" || c[1] === "remove")),
    "no debe volver a agregar ni retirar un marketplace preexistente");
  assert.deepEqual(JSON.parse(readFileSync(estadoMarketplace, "utf8")), marketplacesTerceros,
    "debe conservar intacto el marketplace preexistente");
  assert.deepEqual(JSON.parse(readFileSync(estadoPlugin, "utf8")), pluginsTerceros,
    "la compensacion debe conservar todos los plugins de terceros instalados desde el marketplace");

  const hogarCompensacionFallida = join(temporal, "hogar-compensacion-fallida");
  mkdirSync(join(hogarCompensacionFallida, ".claude"), { recursive: true });
  writeFileSync(join(hogarCompensacionFallida, ".claude", "settings.json"), "{}\n");
  resetEstadoMock();
  writeFileSync(logCli, "");
  const compensacionFallida = spawnSync(process.execPath, [INSTALADOR, "--host", "claude"], {
    cwd: temporal,
    env: envMock(hogarCompensacionFallida, "fail-compensations"),
    encoding: "utf8",
    timeout: 90000,
  });
  assert.notEqual(compensacionFallida.status, 0, "no se debe anunciar fallback cuando fallan ambas compensaciones");
  const comandosFallidos = readFileSync(logCli, "utf8").trim().split("\n").map((s) => JSON.parse(s));
  assert.ok(comandosFallidos.filter((c) => c[0] === "uninstall").length >= 2, "debe reintentar uninstall durante rollback");
  assert.equal(comandosFallidos.filter((c) => c[0] === "marketplace" && c[1] === "remove").length, 0,
    "no debe ejecutar marketplace remove mientras plugin list confirme que quedan plugins instalados");
  assert.ok(compensacionFallida.stderr.includes("No se pudieron compensar todos los cambios nativos"),
    "debe informar que quedaron efectos externos sin compensar");
  assert.ok(JSON.parse(readFileSync(estadoPlugin, "utf8")).some((p) => p.id === "repofibe@repofibe-marketplace"),
    "el stub debe dejar evidencia de que la CLI simulada conservó un efecto parcial");

  const hogarRollback = join(temporal, "hogar-rollback");
  mkdirSync(join(hogarRollback, ".claude"), { recursive: true });
  const settingsRollback = join(hogarRollback, ".claude", "settings.json");
  writeFileSync(settingsRollback, "{}\n");
  resetEstadoMock();
  writeFileSync(logCli, "");
  const pluginRollback = spawnSync(process.execPath, [INSTALADOR, "--host", "claude"], {
    cwd: temporal, env: envMock(hogarRollback, "success-corrupt"), encoding: "utf8", timeout: 90000,
  });
  assert.notEqual(pluginRollback.status, 0, "la corrupcion inyectada debe hacer fallar el diagnostico final");
  const comandosRollback = readFileSync(logCli, "utf8").trim().split("\n").map((s) => JSON.parse(s));
  const desinstalar = comandosRollback.findIndex((c) => c[0] === "uninstall" && c[1] === "repofibe@repofibe-marketplace");
  const retirarMarketplace = comandosRollback.findIndex((c) => c[0] === "marketplace" && c[1] === "remove");
  assert.ok(desinstalar >= 0 && retirarMarketplace > desinstalar,
    "un fallo posterior al plugin debe compensar primero plugin y luego marketplace");
  assert.ok(!existsSync(join(hogarRollback, ".repofibe", "instalado.json")), "rollback debe restaurar el registro previo");
  assert.ok(!existsSync(join(hogarRollback, ".repofibe", "en-actualizacion.json")), "rollback debe retirar el marcador");

  const hogarJunction = join(temporal, "hogar-junction");
  const externo = join(temporal, "destino-junction");
  const rutaJunction = join(temporal, "junction-prueba");
  mkdirSync(externo);
  let junctionDisponible = false;
  try {
    symlinkSync(externo, rutaJunction, "junction");
    junctionDisponible = lstatSync(rutaJunction).isSymbolicLink();
    unlinkSync(rutaJunction);
  } catch {}
  if (junctionDisponible) {
    mkdirSync(join(hogarJunction, ".claude"), { recursive: true });
    writeFileSync(join(hogarJunction, ".claude", "settings.json"), "{}\n");
    resetEstadoMock();
    writeFileSync(logCli, "");
    const pluginJunction = spawnSync(process.execPath, [INSTALADOR, "--host", "claude"], {
      cwd: temporal, env: envMock(hogarJunction, "success-junction", externo), encoding: "utf8", timeout: 90000,
    });
    assert.notEqual(pluginJunction.status, 0, "la corrupcion inyectada debe activar el rollback con junction");
    assert.ok(existsSync(join(externo, "guardia.mjs")), "rollback no debe borrar el archivo expuesto por la junction");
    assert.deepEqual(readFileSync(join(externo, "guardia.mjs")), readFileSync(join(RAIZ, "hooks", "guardia.mjs")),
      "el archivo externo no debe alterarse al revertir una ruta redirigida");
    assert.ok(/padres ya no es un archivo regular sin enlaces|directorio no vacío o inseguro/.test(pluginJunction.stderr),
      "rollback debe advertir que omitió una ruta que pasó a junction");
  }
} finally {
  rmSync(temporal, { recursive: true, force: true });
}

console.log("F17: migración precisa de hook y preservación de configuración verificadas.");
