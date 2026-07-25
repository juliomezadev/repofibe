#!/usr/bin/env node
// evals/nucleo/grafo.mjs — el grafo de dependencias, probado por lo que PIERDE.
//
// Por qué importa tanto: `pruebas.mjs afectadas` selecciona qué pruebas correr
// cruzando `git diff` con este grafo. Una arista perdida aquí no es un detalle
// académico — es una prueba afectada que NO se ejecuta, y por tanto código
// roto que se shipea creyendo que se probó. El falso NEGATIVO es el peligroso;
// el falso positivo solo cuesta tiempo.
//
// Nace de una auditoría (2026-07-25) que encontró exactamente eso: los alias
// de `tsconfig` (`@/core`) no se resolvían, y en un proyecto Next/Vite/TS esa
// es la forma habitual de importar. Además contaba como dependencias reales
// los imports escritos dentro de comentarios y strings.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fallos = [];
const fallo = (m) => fallos.push(m);
const ok = (m) => console.log(`  ok: ${m}`);

function repoDePrueba(archivos) {
  const dir = mkdtempSync(join(tmpdir(), "repofibe-grafo-"));
  for (const [p, c] of Object.entries(archivos)) {
    mkdirSync(join(dir, dirname(p)), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
  execFileSync(process.execPath, [join(RAIZ, "nucleo", "grafo.mjs"), "generar"], { cwd: dir, stdio: "ignore" });
  return dir;
}

const impactoDe = (dir, archivo) =>
  execFileSync(process.execPath, [join(RAIZ, "nucleo", "grafo.mjs"), "impacto", archivo], { cwd: dir, encoding: "utf8" });

// ── 1. Las seis formas de importar en JS, y la transitividad ──────────────
{
  const dir = repoDePrueba({
    "src/core.js": "export const base = 1;\n",
    "src/a.js": "import { base } from './core.js';\nexport const a = base;\n",
    "src/b.js": "import {\n  base\n} from './core.js';\nexport const b = base;\n",
    "src/c.js": "export async function c() { const m = await import('./core.js'); return m.base; }\n",
    "src/d.js": "export * from './core.js';\n",
    "src/e.js": "const { base } = require('./core.js');\nmodule.exports = base;\n",
    "src/f.js": "import './core.js';\nexport const f = 1;\n",
    "src/g.js": "import { a } from './a.js';\nexport const g = a;\n",
  });
  const imp = impactoDe(dir, "src/core.js");
  const formas = [["a", "estático"], ["b", "multilínea"], ["c", "import() dinámico"],
    ["d", "export * (re-export)"], ["e", "require()"], ["f", "efecto secundario"], ["g", "TRANSITIVA (prof 2)"]];
  const perdidas = formas.filter(([f]) => !imp.includes(`src/${f}.js`));
  if (perdidas.length) fallo(`aristas perdidas: ${perdidas.map(([f, d]) => `${f}.js (${d})`).join(", ")}`);
  else ok(`detecta las ${formas.length} formas de dependencia, incluida la transitiva a profundidad 2`);
  rmSync(dir, { recursive: true, force: true });
}

// ── 2. TypeScript real: sin extensión, barril y ALIAS de tsconfig ─────────
// El alias es el hallazgo que motivó esta eval. Sin resolverlo, un proyecto
// Next/Vite normal pierde aristas y deja de correr pruebas afectadas.
{
  const dir = repoDePrueba({
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }, null, 2),
    "src/core.ts": "export const base = 1;\n",
    "src/index.ts": "export * from './core';\n",
    "src/sinExt.ts": "import { base } from './core';\nexport const a = base;\n",
    "src/barril.ts": "import { base } from './index';\nexport const b = base;\n",
    "src/conAlias.ts": "import { base } from '@/core';\nexport const c = base;\n",
  });
  const imp = impactoDe(dir, "src/core.ts");
  const esperados = [["src/sinExt.ts", "import sin extensión"], ["src/index.ts", "barril"],
    ["src/barril.ts", "consumo vía barril"], ["src/conAlias.ts", "alias @/ de tsconfig"]];
  const perdidas = esperados.filter(([f]) => !imp.includes(f));
  if (perdidas.length) {
    fallo(`FALSO NEGATIVO en proyecto TS — aristas perdidas: ${perdidas.map(([f, d]) => `${f} (${d})`).join(", ")}. ` +
      `Cada una es una prueba afectada que no se ejecutaría.`);
  } else ok("resuelve imports sin extensión, barriles y alias de tsconfig (proyecto TS realista)");
  rmSync(dir, { recursive: true, force: true });
}

// ── 3. Comentarios y strings NO son dependencias ─────────────────────────
{
  const dir = repoDePrueba({
    "src/core.js": "export const base = 1;\n",
    "src/real.js": "import { base } from './core.js';\nexport const r = base;\n",
    "src/falso.js": "// import { base } from './core.js';\n/* import './core.js'; */\nconst t = \"import x from './core.js'\";\nexport const f = t;\n",
  });
  const imp = impactoDe(dir, "src/core.js");
  if (!imp.includes("src/real.js")) fallo("perdió la dependencia real al filtrar comentarios");
  else if (imp.includes("src/falso.js")) fallo("FALSO POSITIVO: cuenta imports escritos en comentarios o dentro de strings");
  else ok("ignora imports en comentarios y strings, sin perder los reales");
  rmSync(dir, { recursive: true, force: true });
}

// ── 4. Un ciclo no debe colgar ni duplicar ───────────────────────────────
{
  const dir = repoDePrueba({
    "src/a.js": "import './b.js';\nexport const a = 1;\n",
    "src/b.js": "import './c.js';\nexport const b = 1;\n",
    "src/c.js": "import './a.js';\nexport const c = 1;\n",
  });
  const imp = impactoDe(dir, "src/a.js");
  const vecesB = (imp.match(/src\/b\.js/g) || []).length;
  if (!imp.includes("src/b.js") || !imp.includes("src/c.js")) fallo("no recorre un ciclo A→B→C→A completo");
  else if (vecesB > 1) fallo(`un ciclo duplica nodos en el impacto (b.js aparece ${vecesB} veces)`);
  else ok("recorre ciclos A→B→C→A sin colgarse ni duplicar nodos");
  rmSync(dir, { recursive: true, force: true });
}

if (fallos.length) {
  console.error(`\nFALLOS (${fallos.length}):`);
  for (const f of fallos) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("ok: grafo verificado por lo que pierde (7 formas de import, TS con alias y barriles, ciclos, sin falsos positivos)");
