// politica-riesgo.mjs — análisis compartido de comandos git push.
//
// Se tokeniza cada segmento del comando para que la política opere sobre los
// argumentos reales de git push, no sobre coincidencias accidentales en texto.

const SEPARADORES = new Set([";", "|", "&", "\n"]);

function segmentar(comando) {
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

  for (const caracter of String(comando)) {
    if (escapado) {
      token += caracter;
      escapado = false;
      continue;
    }
    if (caracter === "\\" && !comilla) {
      escapado = true;
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

function argumentosGitPush(segmento, buscarEnTexto = false) {
  let indice = 0;
  if (buscarEnTexto) indice = segmento.indexOf("git");
  while (["sudo", "command"].includes(segmento[indice])) indice += 1;
  if (segmento[indice] === "env") {
    indice += 1;
    while (segmento[indice] && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(segmento[indice]) || segmento[indice].startsWith("-"))) indice += 1;
  }
  if (segmento[indice] !== "git") return null;
  indice += 1;
  if (segmento[indice] !== "push") return null;
  return segmento.slice(indice + 1);
}

function esForce(argumento) {
  return argumento === "--force" || argumento === "-f" || /^-[^-]*f[^-]*$/i.test(argumento);
}

function esForceWithLease(argumento) {
  return argumento === "--force-with-lease" || argumento.startsWith("--force-with-lease=");
}

export function analizarGitPush(comando, { buscarEnTexto = false } = {}) {
  for (const segmento of segmentar(comando)) {
    const argumentos = argumentosGitPush(segmento, buscarEnTexto);
    if (!argumentos) continue;
    const forzado = argumentos.some(esForce);
    const conForceWithLease = argumentos.some(esForceWithLease);
    return {
      esGitPush: true,
      forzado,
      conForceWithLease,
      requiereProteccion: forzado,
    };
  }
  return { esGitPush: false, forzado: false, conForceWithLease: false, requiereProteccion: false };
}
