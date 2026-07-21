import { pipeline } from '@xenova/transformers';

// Función para calcular similitud del coseno entre dos vectores
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function runSpike() {
  console.log("Cargando modelo de embeddings localmente...");
  // Usamos un modelo ligero de embeddings
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  const textos = [
    "La memoria RAM es un componente vital del ordenador.",
    "El procesador y la memoria principal son rápidos y esenciales.",
    "A mi perro le encanta correr por el parque todos los días.",
  ];

  console.log("Generando embeddings...");
  
  const embeddings = [];
  for (const texto of textos) {
    // pooling mean y normalizado suele ser recomendado para similitud
    const output = await extractor(texto, { pooling: 'mean', normalize: true });
    // Convertimos el tensor (Float32Array) a un Array estándar
    embeddings.push(Array.from(output.data));
  }

  console.log("Calculando similitud del coseno...\n");
  
  const sim0_1 = cosineSimilarity(embeddings[0], embeddings[1]);
  const sim0_2 = cosineSimilarity(embeddings[0], embeddings[2]);

  console.log(`Texto 0: "${textos[0]}"`);
  console.log(`Texto 1: "${textos[1]}"`);
  console.log(`Texto 2: "${textos[2]}"\n`);
  
  console.log(`Similitud entre Texto 0 y Texto 1 (Relacionados): ${sim0_1.toFixed(4)}`);
  console.log(`Similitud entre Texto 0 y Texto 2 (No relacionados): ${sim0_2.toFixed(4)}`);
}

runSpike().catch(console.error);
