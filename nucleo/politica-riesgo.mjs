// politica-riesgo.mjs - reconocimiento acotado de comandos `git push`.
// No pretende analizar por completo Bash ni PowerShell. Detecta las formas
// directas y wrappers comunes que usa la herramienta git, y deja el shell
// estrictamente bloqueado cuando hay congelamiento activo.

const SEPARADORES = new Set([";", "|", "&", "\n"]);
const GIT_BINARIOS = new Set(["git", "git.exe", "git.cmd", "git.bat"]);

function segmentar(comando) {
  const entrada = String(comando);
  const segmentos = [];
  let actual = [];
  let token = "";
  let comilla = null;
  let escapado = false;

  const guardarToken = () => {
    if (token) actual.push(token);
    token = "";
  };
  const guardarSegmento = () => {
    guardarToken();
    if (actual.length) segmentos.push(actual);
    actual = [];
  };

  for (let i = 0; i < entrada.length; i += 1) {
    const caracter = entrada[i];
    if (escapado) {
      token += caracter;
      escapado = false;
      continue;
    }
    if (!comilla && caracter === "\\") {
      const siguiente = entrada[i + 1];
      // Bash permite escapar separadores y espacios. Una barra de una ruta
      // Windows (por ejemplo C:\\repo) se conserva como parte del token.
      if (siguiente && /[\s;|&'"\\]/.test(siguiente)) {
        escapado = true;
        continue;
      }
      token += caracter;
      continue;
    }
    if (comilla) {
      if (caracter === comilla) comilla = null;
      else token += caracter;
      continue;
    }
    if (caracter === "'" || caracter === '"') {
      comilla = caracter;
      continue;
    }
    if (/\s/.test(caracter)) {
      guardarToken();
      continue;
    }
    if (SEPARADORES.has(caracter)) {
      guardarSegmento();
      continue;
    }
    token += caracter;
  }
  if (escapado) token += "\\";
  guardarSegmento();
  return segmentos;
}

function esGit(token) {
  const nombre = String(token ?? "").split(/[\\/]/).at(-1)?.toLowerCase();
  return GIT_BINARIOS.has(nombre);
}

function saltarValor(segmento, indice) {
  return indice + 1 < segmento.length ? indice + 2 : -1;
}

function entrarPorSudo(segmento, indice) {
  if (segmento[indice] !== "sudo") return indice;
  indice += 1;
  const valor = new Set(["-u", "--user", "-g", "--group", "-h", "--host", "-p", "--prompt", "-C", "--chdir"]);
  while (segmento[indice]?.startsWith("-")) {
    const opcion = segmento[indice];
    if (valor.has(opcion)) {
      indice = saltarValor(segmento, indice);
      if (indice < 0) return -1;
    } else if (["-E", "-H", "-n", "-i", "-S", "--login", "--set-home", "--non-interactive", "--preserve-env"].includes(opcion)
      || /^--(?:user|group|host|prompt|chdir)=/.test(opcion)) {
      indice += 1;
    } else {
      return -1;
    }
  }
  return indice;
}

function entrarPorEnv(segmento, indice) {
  if (segmento[indice] !== "env") return indice;
  indice += 1;
  while (segmento[indice]) {
    const opcion = segmento[indice];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(opcion)) {
      indice += 1;
    } else if (["-i", "--ignore-environment", "-0", "--null"].includes(opcion)) {
      indice += 1;
    } else if (["-u", "--unset", "-C", "--chdir", "-S", "--split-string"].includes(opcion)) {
      indice = saltarValor(segmento, indice);
      if (indice < 0) return -1;
    } else if (/^--(?:unset|chdir|split-string)=/.test(opcion)) {
      indice += 1;
    } else {
      break;
    }
  }
  return indice;
}

function argumentosGitPush(segmento, buscarEnTexto = false) {
  let indice = buscarEnTexto ? segmento.findIndex(esGit) : 0;
  if (indice < 0) return null;

  if (!buscarEnTexto && segmento[indice] === "sudo") {
    indice = entrarPorSudo(segmento, indice);
    if (indice < 0) return null;
  }
  if (!buscarEnTexto && segmento[indice] === "command") {
    indice += 1;
    if (segmento[indice] === "-p") indice += 1;
  }
  if (!buscarEnTexto) {
    indice = entrarPorEnv(segmento, indice);
    if (indice < 0) return null;
  }
  if (!esGit(segmento[indice])) return null;

  indice += 1;
  while (segmento[indice]) {
    const opcion = segmento[indice];
    if (opcion === "push") return segmento.slice(indice + 1);
    if (opcion === "--") return null;

    // Opciones globales de Git que consumen un valor.
    if (["-C", "-c", "--config-env", "--exec-path", "--git-dir", "--work-tree", "--namespace", "--super-prefix"].includes(opcion)) {
      indice = saltarValor(segmento, indice);
      if (indice < 0) return null;
      continue;
    }
    if (["--no-pager", "--paginate", "--bare", "--literal-pathspecs", "--glob-pathspecs", "--noglob-pathspecs", "--icase-pathspecs", "--no-replace-objects", "--no-optional-locks", "--no-lazy-fetch"].includes(opcion)) {
      indice += 1;
      continue;
    }
    if (/^-C.+/.test(opcion) || /^-c.+/.test(opcion)
      || /^--(?:config-env|exec-path|git-dir|work-tree|namespace|super-prefix)=/.test(opcion)) {
      indice += 1;
      continue;
    }
    return null;
  }
  return null;
}

function esForce(argumento) {
  return argumento === "--force" || argumento === "-f"
    || (/^-[^-]+$/.test(argumento) && argumento.slice(1).includes("f"));
}

function esForceWithLease(argumento) {
  return argumento === "--force-with-lease" || argumento.startsWith("--force-with-lease=");
}

function pushForzado(argumentos) {
  let despuesDeSeparador = false;
  let lease = false;
  let forzado = false;
  const opcionesConValor = new Set([
    "-o", "--push-option", "--receive-pack", "--repo", "--recurse-submodules", "--signed",
  ]);

  for (let i = 0; i < argumentos.length; i += 1) {
    const argumento = argumentos[i];
    if (argumento === "--") {
      despuesDeSeparador = true;
      continue;
    }
    if (!despuesDeSeparador && argumento.startsWith("-")) {
      // Estas opciones reciben su valor en el argumento siguiente. Evita
      // confundir sus valores con flags o refspecs, incluso si el valor
      // comienza con `--force` o `+`.
      if (opcionesConValor.has(argumento)) {
        if (i + 1 < argumentos.length) i += 1;
        continue;
      }
      if (esForce(argumento)) forzado = true;
      if (esForceWithLease(argumento)) lease = true;
      continue;
    }
    if (esForce(argumento)) forzado = true;
    if (esForceWithLease(argumento)) lease = true;
    if (argumento.startsWith("+")) forzado = true;
  }
  return { forzado, conForceWithLease: lease };
}

export function analizarGitPush(comando, { buscarEnTexto = false } = {}) {
  let esGitPush = false;
  let conForceWithLease = false;
  for (const segmento of segmentar(comando)) {
    const argumentos = argumentosGitPush(segmento, buscarEnTexto);
    if (!argumentos) continue;
    esGitPush = true;
    const resultado = pushForzado(argumentos);
    conForceWithLease ||= resultado.conForceWithLease;
    if (resultado.forzado) {
      return { esGitPush: true, forzado: true, conForceWithLease, requiereProteccion: true };
    }
  }
  return { esGitPush, forzado: false, conForceWithLease, requiereProteccion: false };
}
