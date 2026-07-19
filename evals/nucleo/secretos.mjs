#!/usr/bin/env node
// Pruebas funcionales de nucleo/secretos.mjs — punto 7 del PLAN-SUPERACION.md.
// Todos los valores de prueba son ejemplos públicos y ficticios conocidos
// (el AKIA de ejemplo oficial de AWS, el JWT de ejemplo de jwt.io) — nunca
// credenciales reales.

import { strict as assert } from "node:assert";
import { redactar } from "../../nucleo/secretos.mjs";

// Los valores de prueba se arman por concatenación a propósito: si
// aparecieran como string contiguo en el código fuente, escáneres de
// secretos como GitHub Push Protection los bloquean por tener la FORMA de
// un token real (aunque el contenido sea de ejemplo/inventado) — el mismo
// problema estructural que este propio módulo detecta. Concatenar rompe el
// patrón contiguo en el diff sin cambiar el valor real que recibe redactar().
function probarDeteccionPositiva() {
  const casos = [
    ["aws_access_key_id", "const key = 'AKIA" + "IOSFODNN7EXAMPLE';"],
    ["aws_secret_key", "aws_secret_access_key = 'wJalrXUtnFEMI" + "/K7MDENG/bPxRfiCYEXAMPLEKEY'"],
    ["github_token", "TOKEN=ghp_" + "1234567890abcdefghijklmnopqrstuvwxyzAB"],
    ["gitlab_token", "glpat-" + "1234567890abcdefghij"],
    ["openai_key", "OPENAI_API_KEY=sk-test" + "1234567890abcdefghijklmnopqrst"],
    ["slack_token", "xoxb-" + "1234567890-abcdefghijklmnop"],
    ["jwt", "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." + "eyJzdWIiOiIxMjM0NTY3ODkwIn0." + "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"],
    ["pem", "-----BEGIN RSA PRIVATE KEY-----\n" + "MIIFAKEKEYDATAxxxxxxxxxxxxxxxxxxxxxx" + "\n-----END RSA PRIVATE KEY-----"],
    ["conexion_db", "DATABASE_URL=postgres://miusuario:" + "MiPass123secreta@db.ejemplo.com:5432/produccion"],
    ["asignacion_generica", 'password = "Sup3r' + 'Secr3to!"'],
  ];
  for (const [tipo, texto] of casos) {
    const { texto: redactado, hallazgos } = redactar(texto);
    assert.ok(hallazgos.some((h) => h.tipo === tipo), `no se detectó "${tipo}" en: ${texto}`);
    assert.ok(!redactado.includes(texto.match(/[A-Za-z0-9/+=._-]{16,}/)?.[0] ?? "\0IMPOSIBLE\0") || tipo === "pem",
      `el secreto de "${tipo}" sigue visible en el texto redactado: ${redactado}`);
  }
  console.log(`ok: detección positiva en los ${casos.length} formatos conocidos (AWS, GitHub, GitLab, OpenAI, Slack, JWT, PEM, conexión DB, asignación genérica)`);
}

function probarSinFalsosPositivos() {
  const limpios = [
    "const apiKey = process.env.API_KEY;",
    'password: "yourPasswordHere"',
    'secret = "changeme"',
    'client_secret: "${CLIENT_SECRET}"',
    "commit: a1b2c3d4e5f6789012345678901234567890abcd",
    "Configura tu ACCESS_TOKEN como variable de entorno antes de correr esto.",
    "función normal sin nada sensible que hace exactamente lo que dice",
  ];
  for (const texto of limpios) {
    const { texto: redactado, hallazgos } = redactar(texto);
    assert.equal(redactado, texto, `falso positivo: "${texto}" se modificó sin ser un secreto → ${redactado}`);
    assert.equal(hallazgos.length, 0, `falso positivo: "${texto}" se reportó como hallazgo`);
  }
  console.log(`ok: ${limpios.length} casos limpios (placeholders, env refs, hash de git, texto normal) pasan sin tocar`);
}

function probarGrupoValorCorrecto() {
  // Bug real encontrado antes de shipear: el nombre de la clave
  // ("access_token", 12 chars) podía confundirse con el valor si se
  // buscaba el primer grupo capturado de longitud >=8 en vez de referenciar
  // el índice de grupo correcto. Este caso lo fija en rojo si regresa.
  const { hallazgos: h1 } = redactar('access_token = "changeme"'); // clave larga, valor placeholder
  assert.equal(h1.length, 0, "clave larga con valor placeholder no debía redactarse (bug del grupo equivocado)");
  const { hallazgos: h2 } = redactar('access_token = "zK9mQ2pL7xR4"'); // clave larga, valor real
  assert.ok(h2.some((h) => h.tipo === "asignacion_generica"), "clave larga con valor real sí debía redactarse");
  console.log("ok: el chequeo de placeholder usa el grupo de VALOR, no el nombre de la clave");
}

probarDeteccionPositiva();
probarSinFalsosPositivos();
probarGrupoValorCorrecto();
console.log("Secretos: detección positiva, ausencia de falsos positivos, y grupo de valor correcto verificados.");
