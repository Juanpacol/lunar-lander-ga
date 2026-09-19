// Algoritmo genético: población, selección (ruleta), cruce, mutación, nueva generación.
// Representación real: cada gen es un flotante en [0,1] = potencia de motor en el instante t.

function randomDNA(n) {
  return Array.from({ length: n }, () => Math.random());
}

function createPopulation(size, dnaLength) {
  return Array.from({ length: size }, () => ({
    dna: randomDNA(dnaLength),
    fitness: 0,
    result: null,
  }));
}

function evaluatePopulation(pop, simulateFn) {
  for (const ind of pop) {
    const result = simulateFn(ind.dna);
    ind.result = result;
    ind.fitness = result.fitness;
  }
}

// Selección por ruleta: cada individuo ocupa una porción proporcional a su fitness / Σfitness.
function rouletteSelect(pop, totalFitness) {
  let r = Math.random() * totalFitness;
  for (const ind of pop) {
    r -= ind.fitness;
    if (r <= 0) return ind;
  }
  return pop[pop.length - 1];
}

// Cruce aritmético (adecuado para representación real): hijo = alpha*A + (1-alpha)*B, alpha por gen.
function crossover(dnaA, dnaB, crossRate) {
  if (Math.random() > crossRate) {
    return (Math.random() < 0.5 ? dnaA : dnaB).slice();
  }
  return dnaA.map((g, i) => {
    const alpha = Math.random();
    return g * alpha + dnaB[i] * (1 - alpha);
  });
}

// Mutación: con probabilidad mutRate por gen, se suma ruido acotado y se recorta a [0,1].
function mutate(dna, mutRate) {
  return dna.map((g) => {
    if (Math.random() < mutRate) {
      g += (Math.random() * 2 - 1) * 0.2;
      g = Math.max(0, Math.min(1, g));
    }
    return g;
  });
}

// Población → Selección → Cruce → Mutación → Nueva generación (con elitismo)
function nextGeneration(pop, crossRate, mutRate, elitism = 2) {
  const sorted = [...pop].sort((a, b) => b.fitness - a.fitness);
  const totalFitness = pop.reduce((s, i) => s + i.fitness, 0) || 1;

  const newPop = [];
  for (let i = 0; i < elitism && i < sorted.length; i++) {
    newPop.push({ dna: sorted[i].dna.slice(), fitness: 0, result: null });
  }

  while (newPop.length < pop.length) {
    const parentA = rouletteSelect(pop, totalFitness);
    const parentB = rouletteSelect(pop, totalFitness);
    let childDNA = crossover(parentA.dna, parentB.dna, crossRate);
    childDNA = mutate(childDNA, mutRate);
    newPop.push({ dna: childDNA, fitness: 0, result: null });
  }

  return newPop;
}
