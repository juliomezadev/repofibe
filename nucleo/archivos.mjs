// archivos.mjs - descubrimiento determinista de archivos dentro del repo.
// No sigue symlinks: el grafo y las evaluaciones sólo inspeccionan el árbol
// que pertenece a la raíz solicitada.
import { readdirSync } from "node:fs";
import { join, relative, extname } from "node:path";

export const DIRECTORIOS_IGNORADOS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", "coverage",
  ".fabrica", "__pycache__", ".venv", "venv", "target", "vendor", ".cache",
]);

export function descubrirArchivos(raiz, { extensiones = null, ignorar = DIRECTORIOS_IGNORADOS } = {}) {
  const permitidas = extensiones ? new Set([...extensiones].map((e) => e.toLowerCase())) : null;
  const salida = [];

  function caminar(dir) {
    let entradas;
    try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entradas.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entrada of entradas) {
      if (entrada.isSymbolicLink()) continue;
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (!ignorar.has(entrada.name) && !entrada.name.startsWith(".")) caminar(ruta);
      } else if (!permitidas || permitidas.has(extname(entrada.name).toLowerCase())) {
        salida.push(ruta);
      }
    }
  }

  caminar(raiz);
  return salida.sort((a, b) => {
    const aa = relative(raiz, a).split("\\").join("/");
    const bb = relative(raiz, b).split("\\").join("/");
    return aa < bb ? -1 : aa > bb ? 1 : 0;
  });
}
