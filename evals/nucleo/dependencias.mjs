#!/usr/bin/env node
// Contrato de reproducibilidad de dependencias del checkout.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(RAIZ, "package-lock.json"), "utf8"));
const raizLock = lock.packages?.[""] ?? {};

assert.equal(pkg.name, "repofibe");
assert.equal(pkg.engines?.node, ">=20", "Node mínimo debe ser explícito");
assert.equal(pkg.scripts?.["setup:chromium"], "playwright install chromium", "Chromium debe prepararse con un comando local reproducible");
assert.deepEqual(pkg.dependencies ?? {}, {}, "Repofibe no tiene dependencias runtime externas");
assert.deepEqual(pkg.devDependencies, { playwright: "1.62.0" }, "Playwright debe ser la única dependencia de desarrollo fijada");
assert.deepEqual(raizLock.devDependencies, { playwright: "1.62.0" }, "lockfile no refleja devDependencies");
assert.equal(lock.packages?.["node_modules/playwright"]?.version, "1.62.0");
assert.equal(lock.packages?.["node_modules/playwright-core"]?.version, "1.62.0");
assert.equal(lock.packages?.["node_modules/playwright"]?.engines?.node, ">=20");
assert.equal(lock.packages?.["node_modules/playwright-core"]?.engines?.node, ">=20");
assert.equal(Object.hasOwn(raizLock, "dependencies"), false, "lockfile no debe declarar Playwright como runtime");
console.log("ok: package.json y package-lock.json declaran sólo Playwright de desarrollo, fijado y compatible con Node 20+");
