#!/usr/bin/env node
// memoria.mjs — memoria persistente de repofibe.
// Dos capas: por proyecto (.fabrica/memoria.jsonl) y global (~/.repofibe/memoria.jsonl).
// Cero dependencias estructurales: JSONL puro. Motor semántico ONNX carga dinámicamente si existe.

import { readFileSync, appendFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const TIPOS = ["aprendizaje", "decision", "gusto", "error", "eureka"];
const LOCAL = join(process.cwd(), ".fabrica", "memoria.jsonl");
const GLOBAL = join(homedir(), ".repofibe", "memoria.jsonl");
const LOCAL_VEC = join(process.cwd(), ".fabrica", ".vectores.jsonl");
const GLOBAL_VEC = join(homedir(), ".repofibe", ".vectores.jsonl");

function leer(ruta) {
  if (!existsSync(ruta)) return [];
  return readFileSync(ruta, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function leerVectores(ruta) {
  if (!existsSync(ruta)) return {};
  const map = {};
  for (const v of leer(ruta)) {
    if (v.id) map[v.id] = v.vector;
  }
  return map;
}

function guardarVector(ruta, id, vector) {
  mkdirSync(dirname(ruta), { recursive: true });
  appendFileSync(ruta, JSON.stringify({ id, vector }) + "\n", "utf8");
}

function normalizar(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function mostrar(e, origen) {
  console.log(`[${e.fecha.slice(0, 10)}] (${e.tipo}${origen ? ", " + origen : ""}) ${e.texto}`);
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

let pipelineCache = null;
async function obtenerExtractor() {
  if (pipelineCache) return pipelineCache;
  try {
    const { pipeline } = await import(/* @vite-ignore */ "@xenova/transformers");
    pipelineCache = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      progress_callback: (x) => {
        if (x.status === "downloading" && x.name) {
          process.stderr.write(`\rDescargando motor semántico: ${x.name} - ${Math.round(x.progress ?? 0)}%      `);
        } else if (x.status === "done") {
          process.stderr.write(`\r                                                                     \r`);
        }
      }
    });
    return pipelineCache;
  } catch {
    return null;
  }
}

async function procesarBuscador() {
  const [cmd, ...args] = process.argv.slice(2);
  const esGlobal = args.includes("--global");
  const limpios = args.filter((a) => a !== "--global");

  switch (cmd) {
    case "agregar": {
      const [tipo, ...resto] = limpios;
      const texto = resto.join(" ").trim();
      if (!TIPOS.includes(tipo) || !texto) {
        console.error(`Uso: agregar <${TIPOS.join("|")}> "<texto>" [--global]`);
        process.exit(1);
      }
      const ruta = esGlobal ? GLOBAL : LOCAL;
      mkdirSync(dirname(ruta), { recursive: true });
      const idUnico = Date.now().toString() + Math.random().toString(36).slice(2, 6);
      const entrada = { id: idUnico, fecha: new Date().toISOString(), tipo, texto };
      appendFileSync(ruta, JSON.stringify(entrada) + "\n", "utf8");
      console.log(`Memoria guardada (${esGlobal ? "global" : "proyecto"}): ${texto}`);
      break;
    }

    case "buscar": {
      const queryOriginal = limpios[0] ?? "";
      const terminos = normalizar(queryOriginal).split(/\s+/).filter(Boolean);
      const max = parseInt(limpios[1], 10) || 8;
      if (!terminos.length) { console.error("Uso: buscar \"<términos>\" [max]"); process.exit(1); }
      
      const todoText = [
        ...leer(LOCAL).map((e) => ({ ...e, origen: "proyecto", rutaVec: LOCAL_VEC })),
        ...leer(GLOBAL).map((e) => ({ ...e, origen: "global", rutaVec: GLOBAL_VEC })),
      ];
      
      if (!todoText.length) { console.log("Sin resultados en memoria."); break; }

      // Batch vectorization for missing embeddings (Cold Start on Demand)
      const mapLocal = leerVectores(LOCAL_VEC);
      const mapGlobal = leerVectores(GLOBAL_VEC);
      const getMap = (origen) => origen === "global" ? mapGlobal : mapLocal;
      
      // Compatibilidad hacia atrás: si no tienen id, se usa la fecha como id
      const sinVector = todoText.filter(e => !getMap(e.origen)[e.id || e.fecha]);
      let extractor = null;
      
      // Intentamos cargar silenciosamente para vectorizar el lote si hay algo pendiente
      if (sinVector.length > 0) {
        extractor = await obtenerExtractor();
        if (extractor) {
          for (const e of sinVector) {
            const out = await extractor(e.texto, { pooling: 'mean', normalize: true });
            const vec = Array.from(out.data);
            const clave = e.id || e.fecha;
            guardarVector(e.rutaVec, clave, vec);
            getMap(e.origen)[clave] = vec;
          }
        }
      }

      // Ranking Textual (Match simple por tokens)
      for (const e of todoText) {
        const t = normalizar(e.texto);
        e.scoreTexto = terminos.reduce((acc, term) => acc + (t.includes(term) ? 1 : 0), 0);
      }
      
      // Ranking Vectorial (Coseno)
      let usamosVectores = false;
      if (!extractor) extractor = await obtenerExtractor();
      if (extractor) {
        usamosVectores = true;
        const qOut = await extractor(queryOriginal, { pooling: 'mean', normalize: true });
        const qVec = Array.from(qOut.data);
        for (const e of todoText) {
          const v = getMap(e.origen)[e.id || e.fecha];
          e.scoreVector = v ? cosineSimilarity(qVec, v) : 0;
        }
      }

      // Reciprocal Rank Fusion (RRF)
      const rankedTexto = [...todoText].sort((a, b) => b.scoreTexto - a.scoreTexto);
      const rankedVector = usamosVectores ? [...todoText].sort((a, b) => b.scoreVector - a.scoreVector) : [];

      for (const e of todoText) {
        const rankT = rankedTexto.indexOf(e) + 1;
        const rankV = usamosVectores ? rankedVector.indexOf(e) + 1 : Infinity;
        e.rrf = (e.scoreTexto > 0 ? 1 / (60 + rankT) : 0) + (usamosVectores && e.scoreVector > 0.4 ? 1 / (60 + rankV) : 0);
      }

      const puntuados = todoText
        .filter(x => x.rrf > 0)
        .sort((a, b) => b.rrf - a.rrf || (a.fecha < b.fecha ? 1 : -1))
        .slice(0, max);
        
      if (!puntuados.length) { console.log("Sin resultados en memoria."); break; }
      for (const e of puntuados) mostrar(e, e.origen);
      break;
    }

    case "listar": {
      const max = parseInt(limpios[0], 10) || 20;
      const entradas = leer(esGlobal ? GLOBAL : LOCAL).slice(-max);
      if (!entradas.length) { console.log("Memoria vacía."); break; }
      for (const e of entradas) mostrar(e);
      break;
    }

    default:
      console.error("Comando desconocido. Usa: agregar | buscar | listar");
      process.exit(1);
  }
}

procesarBuscador().catch(e => {
  console.error("Error fatal en memoria:", e);
  process.exit(1);
});
