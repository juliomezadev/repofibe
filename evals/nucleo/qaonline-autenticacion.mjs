#!/usr/bin/env node
// Regresiones SA03: QA no declara curación si sigue en login y no persiste
// perfiles antes de verificar una postcondición autenticada.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TEMP = mkdtempSync(join(process.cwd(), ".sa03-qaonline-auth-"));
const REPO = process.cwd();
const TRAZAS = join(TEMP, "trazas");
mkdirSync(TRAZAS, { recursive: true });
process.env.REPOFIBE_TRAZA_DIR = TRAZAS;
process.chdir(TEMP);
const { ejecutarQAOnline } = await import("../../nucleo/qaonline.mjs");
const { cargar, guardarEstado } = await import("../../nucleo/cookies.mjs");

function html(body) { return `<!doctype html><html><body>${body}</body></html>`; }

async function iniciarServidor({ loginFunciona, expirarEnDashboard = false }) {
  let protectedRequests = 0;
  const server = createServer((req, res) => {
    const autenticado = (req.headers.cookie || "").includes("sa03-auth=ok");
    if (req.url === "/login") {
      res.writeHead(200, { "Content-Type": "text/html" });
      const accion = loginFunciona
        ? "document.cookie='sa03-auth=ok; path=/'; location='/dashboard'"
        : "location='/login?intent=still-logged-out'";
      res.end(html(`<h1>Login</h1><button id="entrar" onclick="${accion}">Entrar</button>`));
    } else if (req.url?.startsWith("/protected")) {
      protectedRequests++;
      if (autenticado) {
        const headers = { "Content-Type": "text/html" };
        if (expirarEnDashboard) headers["Set-Cookie"] = "sa03-auth=; Path=/; Max-Age=0";
        res.writeHead(200, headers);
        res.end(html('<h1>Dashboard privado</h1><script>setTimeout(()=>{document.cookie="sa03-late=visible; path=/"; const ok=document.createElement("p"); ok.id="auth-ok"; ok.textContent="Sesión comprobada"; document.body.append(ok)},250)</script><button>Continuar</button>'));
      } else {
        res.writeHead(302, { Location: "/login" });
        res.end();
      }
    } else if (req.url === "/dashboard") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html(autenticado ? '<h1 id="auth-ok">Dashboard privado</h1>' : "<h1>Dashboard sin sesión</h1>"));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}`, requests: () => protectedRequests };
}

try {
  const invalido = await iniciarServidor({ loginFunciona: true, expirarEnDashboard: true });
  try {
    const origin = invalido.origin;
    await assert.rejects(
      () => ejecutarQAOnline({
        flujo: "Login que no autentica",
        dominio: origin,
        dirBase: TEMP,
        script: [{ accion: "navegar", url: `${origin}/protected` }, { accion: "snapshot" }],
        macroLogin: [
          { accion: "navegar", url: `${origin}/login` },
          { accion: "snapshot" },
          { accion: "click", ref: "e2" },
        ],
        postcondicionAutenticada: { url: `${origin}/dashboard`, selector: "#auth-ok" },
      }),
      /autentic|postcondici[oó]n|login/i,
      "QA debe fallar cuando el retry sigue en login o no satisface el selector autenticado"
    );
    assert.equal(cargar(origin, TEMP), null, "un macro fallido no debe guardar un perfil falso");
    assert.equal(invalido.requests(), 2, "Self-Healing tiene como máximo un retry del paso que disparó el login");
  } finally {
    await new Promise((resolve) => invalido.server.close(resolve));
  }

  const valido = await iniciarServidor({ loginFunciona: true });
  try {
    const origin = valido.origin;
    const res = await ejecutarQAOnline({
      flujo: "Login confirmado",
      dominio: origin,
      dirBase: TEMP,
      script: [{ accion: "navegar", url: `${origin}/protected` }, { accion: "snapshot" }],
      macroLogin: [
        { accion: "navegar", url: `${origin}/login` },
        { accion: "snapshot" },
        { accion: "click", ref: "e2" },
      ],
      postcondicionAutenticada: { selector: "#auth-ok" },
    });
    assert.equal(res.ok, true);
    const guardado = cargar(origin, TEMP);
    assert.ok(guardado, "la sesión se persiste solo después de validar la postcondición");
    assert.ok(guardado.cookies.some((cookie) => cookie.name === "sa03-late"), "QA espera al selector hidratado y exporta cookies que aparecen antes de la confirmación");
    assert.match(readFileSync(res.evidenciaPath, "utf8"), /Self-Healing Auth activado/);

    await assert.rejects(
      () => ejecutarQAOnline({
        flujo: "Sin contrato de autenticación",
        dominio: origin,
        dirBase: TEMP,
        script: [{ accion: "navegar", url: `${origin}/protected` }],
        macroLogin: [{ accion: "navegar", url: `${origin}/login` }],
      }),
      /postcondici[oó]n/i,
      "una macro de login debe declarar su postcondición autenticada"
    );
  } finally {
    await new Promise((resolve) => valido.server.close(resolve));
  }

  console.log("ok: QA exige postcondición, verifica salida del login, limita a un retry y persiste solo el estado validado");
} finally {
  process.chdir(REPO);
  rmSync(TEMP, { recursive: true, force: true });
}
