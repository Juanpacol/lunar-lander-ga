// Orquestación: loop de generaciones, conecta UI ↔ genetic.js ↔ sim.js

const els = {
  canvas: document.getElementById("simCanvas"),
  chart: document.getElementById("chartCanvas"),
  hudAlt: document.getElementById("hudAlt"),
  hudVel: document.getElementById("hudVel"),
  hudFuel: document.getElementById("hudFuel"),
  hudStatus: document.getElementById("hudStatus"),
  popSize: document.getElementById("popSize"),
  crossRate: document.getElementById("crossRate"),
  mutRate: document.getElementById("mutRate"),
  numGen: document.getElementById("numGen"),
  valPop: document.getElementById("valPop"),
  valCross: document.getElementById("valCross"),
  valMut: document.getElementById("valMut"),
  valGen: document.getElementById("valGen"),
  animateToggle: document.getElementById("animateToggle"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  replayBtn: document.getElementById("replayBtn"),
  resetBtn: document.getElementById("resetBtn"),
  statGen: document.getElementById("statGen"),
  statBest: document.getElementById("statBest"),
  statAvg: document.getElementById("statAvg"),
  statImpact: document.getElementById("statImpact"),
};

const ctx = els.canvas.getContext("2d");
const chartCtx = els.chart.getContext("2d");

let bestFitnessHistory = [];
let avgFitnessHistory = [];
let bestOverall = null;
let running = false;
let cancelPlayback = null;  // () => void — cancela el rAF
let resolvePending = null;  // resolve() de la promesa en curso
let stopRequested = false;

function syncLabels() {
  els.valPop.textContent = els.popSize.value;
  els.valCross.textContent = Number(els.crossRate.value).toFixed(2);
  els.valMut.textContent = Number(els.mutRate.value).toFixed(2);
  els.valGen.textContent = els.numGen.value;
}
[els.popSize, els.crossRate, els.mutRate, els.numGen].forEach((el) =>
  el.addEventListener("input", syncLabels)
);
syncLabels();

function drawIdleScene() {
  drawScene(ctx, els.canvas.width, els.canvas.height, { y: SIM.START_Y, vy: 0, thrust: 0, fuel: SIM.FUEL_CAPACITY });
}

function setHud(frame, statusText) {
  els.hudAlt.textContent = `${frame.y.toFixed(0)} m`;
  els.hudVel.textContent = `${frame.vy.toFixed(2)} m/s`;
  els.hudFuel.textContent = `${frame.fuel.toFixed(0)}`;
  els.hudStatus.textContent = statusText;
}

function updateStats(gen, totalGen, best, avg) {
  els.statGen.textContent = `${gen}/${totalGen}`;
  els.statBest.textContent = best.fitness.toFixed(3);
  els.statAvg.textContent = avg.toFixed(3);
  els.statImpact.textContent = `${best.result.impactSpeed.toFixed(2)} m/s`;
}

function drawChartNow() {
  drawChart(chartCtx, els.chart.width, els.chart.height, bestFitnessHistory, avgFitnessHistory);
}

function playIndividual(individual, durationMs, onDone) {
  // Cancela la animación anterior Y resuelve su promesa pendiente para no dejar el loop colgado
  if (cancelPlayback) cancelPlayback();
  if (resolvePending) { resolvePending(); resolvePending = null; }

  cancelPlayback = playHistory(
    individual.result.history,
    durationMs,
    (frame) => {
      drawScene(ctx, els.canvas.width, els.canvas.height, frame);
      const status = frame.y <= 0
        ? (individual.result.crashed ? "💥 Choque" : "✅ Aterrizaje suave")
        : "En descenso…";
      setHud(frame, status);
    },
    () => {
      cancelPlayback = null;
      resolvePending = null;
      drawResultBanner(individual.result);
      if (onDone) onDone();
    }
  );
}

function drawResultBanner(result) {
  const w = els.canvas.width;
  const h = els.canvas.height;
  const crashed = result.crashed;

  ctx.fillStyle = crashed ? "rgba(255,69,58,0.22)" : "rgba(48,209,88,0.18)";
  ctx.fillRect(0, 0, w, h);

  const text = crashed ? "💥 CHOQUE" : "✅ ATERRIZAJE SUAVE";
  const sub = `${result.impactSpeed.toFixed(2)} m/s de impacto`;

  ctx.textAlign = "center";
  ctx.fillStyle = crashed ? "#ff453a" : "#1f9e6d";
  ctx.font = "bold 30px -apple-system, system-ui, sans-serif";
  ctx.fillText(text, w / 2, h / 2 - 8);

  ctx.font = "16px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = crashed ? "#ffb4af" : "#8be6c4";
  ctx.fillText(sub, w / 2, h / 2 + 20);
  ctx.textAlign = "left";
}

function setControlsEnabled(enabled) {
  [els.popSize, els.crossRate, els.mutRate, els.numGen].forEach((el) => (el.disabled = !enabled));
}

async function runEvolution() {
  running = true;
  stopRequested = false;
  bestFitnessHistory = [];
  avgFitnessHistory = [];
  bestOverall = null;

  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  els.replayBtn.disabled = true;
  els.resetBtn.disabled = true;
  setControlsEnabled(false);

  const popSize = Number(els.popSize.value);
  const crossRate = Number(els.crossRate.value);
  const mutRate = Number(els.mutRate.value);
  const totalGen = Number(els.numGen.value);
  const animate = els.animateToggle.checked;
  const dnaLength = SIM.GENES;

  let pop = createPopulation(popSize, dnaLength);

  for (let gen = 1; gen <= totalGen; gen++) {
    if (stopRequested) break;

    evaluatePopulation(pop, simulate);

    const sorted = [...pop].sort((a, b) => b.fitness - a.fitness);
    const best = sorted[0];
    const avgFitness = pop.reduce((s, i) => s + i.fitness, 0) / pop.length;

    if (!bestOverall || best.fitness > bestOverall.fitness) {
      bestOverall = { dna: best.dna.slice(), fitness: best.fitness, result: best.result };
    }

    bestFitnessHistory.push(best.fitness);
    avgFitnessHistory.push(avgFitness);
    updateStats(gen, totalGen, best, avgFitness);
    drawChartNow();

    if (animate) {
      await new Promise((resolve) => { resolvePending = resolve; playIndividual(best, 1500, resolve); });
      resolvePending = null;
      await new Promise((resolve) => setTimeout(resolve, 450)); // pausa para leer el resultado (choque/aterrizaje)
    } else {
      drawScene(ctx, els.canvas.width, els.canvas.height, best.result.history[best.result.history.length - 1]);
      drawResultBanner(best.result);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (gen < totalGen && !stopRequested) {
      pop = nextGeneration(pop, crossRate, mutRate, Math.max(1, Math.round(popSize * 0.03)));
    }
  }

  running = false;
  els.startBtn.disabled = false;
  els.stopBtn.disabled = true;
  els.replayBtn.disabled = !bestOverall;
  els.resetBtn.disabled = false;
  setControlsEnabled(true);
}

els.startBtn.addEventListener("click", () => {
  if (!running) runEvolution();
});

els.stopBtn.addEventListener("click", () => {
  stopRequested = true;
  if (cancelPlayback) cancelPlayback();
  if (resolvePending) { resolvePending(); resolvePending = null; }
});

els.replayBtn.addEventListener("click", () => {
  if (bestOverall) playIndividual(bestOverall, 2200, null);
});

els.resetBtn.addEventListener("click", () => {
  if (cancelPlayback) cancelPlayback();
  if (resolvePending) { resolvePending(); resolvePending = null; }
  stopRequested = true;
  bestFitnessHistory = [];
  avgFitnessHistory = [];
  bestOverall = null;
  els.replayBtn.disabled = true;
  els.statGen.textContent = "0";
  els.statBest.textContent = "0.00";
  els.statAvg.textContent = "0.00";
  els.statImpact.textContent = "—";
  drawIdleScene();
  drawChartNow();
  setHud({ y: SIM.START_Y, vy: 0, fuel: SIM.FUEL_CAPACITY }, "—");
});

drawIdleScene();
drawChartNow();
setHud({ y: SIM.START_Y, vy: 0, fuel: SIM.FUEL_CAPACITY }, "—");

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (!running) drawIdleScene();
  drawChartNow();
});
