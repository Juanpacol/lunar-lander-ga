// Física del descenso + render en canvas.

const SIM = {
  START_Y: 80,          // altura inicial (m)
  GRAVITY: 1.62,        // aceleración gravitatoria lunar (m/s^2)
  THRUST_POWER: 4.0,    // aceleración máxima del motor (m/s^2) -> umbral de vuelo estacionario ~0.4
  DT: 0.1,              // paso de tiempo (s)
  CONTROL_WINDOW: 150,  // pasos físicos que cubre el ADN (15s) antes de apagar motor
  GENES: 18,            // nº de genes del ADN (puntos de control de potencia, interpolados en el tiempo)
  MAX_SIM_STEPS: 600,   // límite de seguridad; una vez sin combustible la gravedad siempre termina el descenso
  FUEL_CAPACITY: 8,     // combustible total disponible (limitado, obliga a ser eficiente)
  FUEL_RATE: 1,         // consumo por unidad de thrust*dt
  SAFE_SPEED: 2.5,      // velocidad máxima de impacto para aterrizaje seguro (m/s)
};

// Cada gen es un punto de control de potencia; se interpola linealmente entre ellos
// para obtener una curva de empuje suave a lo largo de la ventana de control.
function thrustAt(dna, t) {
  if (t >= SIM.CONTROL_WINDOW) return 0;
  const pos = (t / (SIM.CONTROL_WINDOW - 1)) * (dna.length - 1);
  const i0 = Math.floor(pos);
  const i1 = Math.min(dna.length - 1, i0 + 1);
  const frac = pos - i0;
  return dna[i0] * (1 - frac) + dna[i1] * frac;
}

// Simula un ADN completo y devuelve el historial de vuelo + evaluación de fitness.
// Pasada la ventana de control el motor se apaga (thrust=0): la gravedad siempre acaba
// completando el aterrizaje, así que no hace falta penalizar un "no aterrizó".
function simulate(dna) {
  let y = SIM.START_Y;
  let vy = 0;
  let fuel = SIM.FUEL_CAPACITY;
  const history = [{ y, vy, thrust: 0, fuel }];

  for (let t = 0; t < SIM.MAX_SIM_STEPS; t++) {
    let thrust = fuel > 0 ? thrustAt(dna, t) : 0;

    fuel -= thrust * SIM.FUEL_RATE * SIM.DT;
    if (fuel < 0) fuel = 0;

    // vy > 0 = subiendo, vy < 0 = cayendo. Gravedad resta, el motor suma.
    vy -= SIM.GRAVITY * SIM.DT;
    vy += thrust * SIM.THRUST_POWER * SIM.DT;
    y += vy * SIM.DT;

    if (y <= 0) {
      y = 0;
      history.push({ y, vy, thrust, fuel });
      break;
    }
    history.push({ y, vy, thrust, fuel });
  }

  const impactSpeed = Math.abs(vy);
  const crashed = impactSpeed > SIM.SAFE_SPEED;
  // Penaliza fuerte el choque, premia el aterrizaje preciso y suave.
  let fitness = 1 / (1 + impactSpeed * impactSpeed);
  if (!crashed) {
    fitness += 0.3 * (fuel / SIM.FUEL_CAPACITY); // bonus por eficiencia solo si aterrizó bien
  }

  return { fitness, impactSpeed, crashed, landed: true, fuelLeft: fuel, history };
}

// ---------- Render ----------

function drawScene(ctx, w, h, frame) {
  ctx.clearRect(0, 0, w, h);

  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  // Cielo
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  if (isDark) {
    sky.addColorStop(0, "#05070f");
    sky.addColorStop(1, "#0e1220");
  } else {
    sky.addColorStop(0, "#dbe9ff");
    sky.addColorStop(1, "#f4f7ff");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Estrellas
  ctx.fillStyle = isDark ? "rgba(255,255,255,0.6)" : "rgba(120,140,180,0.35)";
  for (let i = 0; i < 40; i++) {
    const sx = (i * 97) % w;
    const sy = (i * 53) % (h - 80);
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }

  // Suelo
  const groundH = 40;
  ctx.fillStyle = isDark ? "#2a2f3d" : "#c9d2e0";
  ctx.fillRect(0, h - groundH, w, groundH);
  ctx.fillStyle = isDark ? "#3a4054" : "#aeb9cc";
  for (let x = 0; x < w; x += 24) {
    ctx.fillRect(x, h - groundH, 12, 4);
  }

  if (!frame) return;

  const usableH = h - groundH;
  const scale = usableH / SIM.START_Y;
  const landerX = w / 2;
  const landerY = usableH - frame.y * scale;

  // Llama del motor
  if (frame.thrust > 0.05) {
    const flameLen = 10 + frame.thrust * 26;
    const grad = ctx.createLinearGradient(landerX, landerY + 14, landerX, landerY + 14 + flameLen);
    grad.addColorStop(0, "rgba(255,180,60,0.95)");
    grad.addColorStop(1, "rgba(255,80,20,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(landerX - 6, landerY + 14);
    ctx.lineTo(landerX + 6, landerY + 14);
    ctx.lineTo(landerX, landerY + 14 + flameLen);
    ctx.closePath();
    ctx.fill();
  }

  // Cuerpo de la nave
  ctx.save();
  ctx.translate(landerX, landerY);
  ctx.fillStyle = isDark ? "#e8ecf5" : "#3a4256";
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(11, 10);
  ctx.lineTo(-11, 10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#4fa8ff";
  ctx.beginPath();
  ctx.arc(0, -3, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = isDark ? "#e8ecf5" : "#3a4256";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-11, 8);
  ctx.lineTo(-18, 16);
  ctx.moveTo(11, 8);
  ctx.lineTo(18, 16);
  ctx.stroke();
  ctx.restore();
}

// Reproduce un historial de vuelo comprimido a una duración fija, independiente del nº de pasos.
// La maniobra de frenado (o el choque) ocurre siempre en el último tramo del vuelo; con un
// mapeo lineal dura una fracción de segundo y no se alcanza a ver. Con ease-out cúbico se
// recorren rápido los primeros pasos (caída libre, poco interesante) y se "estira" el tiempo
// real dedicado al tramo final, que es justo donde se nota si frenó bien o se estrelló.
function playHistory(history, durationMs, onFrame, onDone) {
  const start = performance.now();
  let rafId;
  let done = false;

  // Chrome pausa requestAnimationFrame por completo en pestañas ocultas: sin este
  // atajo, cambiar de pestaña/app deja la animación (y con ella todo el bucle de
  // generaciones, que espera su callback) congelada hasta volver a mirarla.
  function finishNow() {
    if (done) return;
    done = true;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    const lastIdx = history.length - 1;
    onFrame(history[lastIdx], lastIdx, history.length);
    if (onDone) onDone();
  }

  function onVisibilityChange() {
    if (document.hidden) finishNow();
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  // Si la pestaña ya estaba oculta cuando arrancó esta generación, no hay evento
  // "visibilitychange" que dispare (no hay cambio de estado) y requestAnimationFrame
  // nunca llega a correr: sin este chequeo, la espera queda colgada para siempre.
  if (document.hidden) {
    setTimeout(finishNow, 0);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }

  function tick(now) {
    const elapsed = now - start;
    const linear = Math.min(1, elapsed / durationMs);
    const eased = 1 - Math.pow(1 - linear, 3);
    const idx = Math.min(history.length - 1, Math.floor(eased * (history.length - 1)));
    onFrame(history[idx], idx, history.length);

    if (linear < 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      done = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (onDone) onDone();
    }
  }

  rafId = requestAnimationFrame(tick);
  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    cancelAnimationFrame(rafId);
  };
}

function drawChart(ctx, w, h, bestHistory, avgHistory) {
  ctx.clearRect(0, 0, w, h);
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  ctx.fillStyle = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
  ctx.fillRect(0, 0, w, h);

  if (bestHistory.length < 2) return;

  const maxVal = Math.max(0.1, ...bestHistory, ...avgHistory);
  const pad = 10;

  function plot(series, color, lineWidth) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    series.forEach((v, i) => {
      const x = pad + (i / (series.length - 1)) * (w - pad * 2);
      const y = h - pad - (v / maxVal) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  plot(avgHistory, isDark ? "rgba(120,170,255,0.55)" : "rgba(60,110,220,0.5)", 2);
  plot(bestHistory, isDark ? "#4fd6a8" : "#1f9e6d", 2.5);
}
