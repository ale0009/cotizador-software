// Riesgo de costo y plazo por simulación Monte Carlo. Portado de eiran (`app/budget/riesgo.py`).
//
// Monte Carlo = repetir el cálculo miles de veces sorteando las horas de cada pieza dentro de su
// rango y leer los percentiles. P80 = "en el 80 % de los escenarios simulados cuesta (o tarda) esto o menos".
// Beta-PERT (λ = 4): α = 1 + 4(m−a)/(b−a), β = 1 + 4(b−m)/(b−a); media (a + 4m + b) / 6.
// Supuestos: piezas independientes, tarifas y costos no laborales fijos,
// semanas = horas / (personas × horas por semana). Semilla fija: mismo encargo, mismo resultado.
import { crearAzar } from './azar.js';
import { redondear } from './redondeo.js';

export const DISTRIBUCIONES = ['pert', 'triangular'];
export const PERCENTILES = [50, 80, 90];
export const CONFIG_POR_DEFECTO = Object.freeze({
  distribucion: 'pert', optimista: 0.20, pesimista: 0.50, iteraciones: 5000, semilla: 42,
});
export const MAX_ITERACIONES = 100_000;

export function configurar(config = {}) {
  const cfg = { ...CONFIG_POR_DEFECTO, ...(config || {}) };
  const desconocidas = Object.keys(cfg).filter((k) => !(k in CONFIG_POR_DEFECTO));
  if (desconocidas.length) throw new RangeError(`Opciones de riesgo desconocidas: ${desconocidas.sort().join(', ')}`);
  cfg.distribucion = String(cfg.distribucion).toLowerCase();
  if (!DISTRIBUCIONES.includes(cfg.distribucion)) throw new RangeError('distribucion debe ser pert o triangular');
  cfg.optimista = Number(cfg.optimista);
  cfg.pesimista = Number(cfg.pesimista);
  if (!(cfg.optimista >= 0 && cfg.optimista < 1) || !(cfg.pesimista >= 0)) {
    throw new RangeError('optimista debe estar en [0, 1) y pesimista ≥ 0 (fracciones de las horas probables)');
  }
  cfg.iteraciones = Math.trunc(Number(cfg.iteraciones));
  cfg.semilla = Math.trunc(Number(cfg.semilla));
  if (!(cfg.iteraciones >= 100 && cfg.iteraciones <= MAX_ITERACIONES)) {
    throw new RangeError(`iteraciones debe estar entre 100 y ${MAX_ITERACIONES}`);
  }
  return cfg;
}

/** [optimista, probable, pesimista, origen] de una pieza. Sin a/b explícitos, usa los porcentajes. */
export function rangoTarea(tarea, cfg) {
  const m = Number(tarea.horas || tarea.probable || 0);
  let a = tarea.horas_optimista ?? tarea.optimista;
  let b = tarea.horas_pesimista ?? tarea.pesimista;
  if (a == null && b == null) return [m * (1 - cfg.optimista), m, m * (1 + cfg.pesimista), 'porcentaje'];
  a = a != null ? Number(a) : m * (1 - cfg.optimista);
  b = b != null ? Number(b) : m * (1 + cfg.pesimista);
  if (!(a >= 0 && a <= m && m <= b)) {
    throw new RangeError(`Pieza '${tarea.nombre}': debe cumplirse 0 ≤ optimista ≤ probable ≤ pesimista (${a} ≤ ${m} ≤ ${b})`);
  }
  return [a, m, b, 'edt'];
}

function sorteo(rng, a, m, b, distribucion) {
  if (b - a <= 1e-12) return m;
  if (distribucion === 'triangular') return rng.triangular(a, b, m);
  const alfa = 1 + (4 * (m - a)) / (b - a);
  const beta = 1 + (4 * (b - m)) / (b - a);
  return a + rng.betavariate(alfa, beta) * (b - a);
}

/** Percentil con interpolación lineal (igual que numpy.percentile por defecto). */
export function percentil(ordenados, p) {
  if (!ordenados.length) throw new RangeError('Sin valores');
  const pos = ((ordenados.length - 1) * p) / 100;
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  return ordenados[bajo] + (ordenados[alto] - ordenados[bajo]) * (pos - bajo);
}

function resumen(valores, dec) {
  const out = {};
  for (const p of PERCENTILES) out[`p${p}`] = redondear(percentil(valores, p), dec);
  let suma = 0;
  for (const v of valores) suma += v;
  out.media = redondear(suma / valores.length, dec);
  out.minimo = redondear(valores[0], dec);
  out.maximo = redondear(valores[valores.length - 1], dec);
  return out;
}

/**
 * tareas: [{nombre, optimista, probable, pesimista, tarifaHora}].
 * Devuelve la misma estructura que `simular` de eiran (horas, costo, semanas, prob_dentro_*) y,
 * si `muestras` es true, también las muestras ordenadas para dibujar el histograma.
 */
export function simular(tareas, capacidadSemanal, {
  costosFijos = 0, presupuestoReferencia = null, horasReferencia = null, config = {}, muestras = false,
} = {}) {
  const cfg = configurar(config);
  if (!tareas.length) throw new RangeError('No hay piezas que simular');
  if (!(capacidadSemanal > 0)) throw new RangeError('La capacidad semanal (personas × horas por semana) debe ser > 0');
  const rng = crearAzar(cfg.semilla);
  const horasSim = new Float64Array(cfg.iteraciones);
  const costoSim = new Float64Array(cfg.iteraciones);
  for (let i = 0; i < cfg.iteraciones; i++) {
    let h = 0;
    let c = 0;
    for (const t of tareas) {
      const x = sorteo(rng, t.optimista, t.probable, t.pesimista, cfg.distribucion);
      h += x;
      c += x * t.tarifaHora;
    }
    horasSim[i] = h;
    costoSim[i] = c + costosFijos;
  }
  horasSim.sort();
  costoSim.sort();

  const semanasCrudo = resumen(horasSim, 6);
  const semanas = {};
  for (const [k, v] of Object.entries(semanasCrudo)) semanas[k] = redondear(v / capacidadSemanal, 1);
  let probables = 0;
  for (const t of tareas) probables += t.probable;
  const r = {
    horas: resumen(horasSim, 1),
    costo: resumen(costoSim, 2),
    semanas,
    horas_probables: redondear(probables, 1),
    config: cfg,
    tareas_simuladas: tareas.length,
  };
  if (presupuestoReferencia != null) {
    let dentro = 0;
    for (const c of costoSim) if (c <= presupuestoReferencia + 1e-9) dentro++;
    r.presupuesto_con_contingencia = redondear(presupuestoReferencia, 2);
    r.prob_dentro_presupuesto = redondear(dentro / costoSim.length, 3);
    r.cubre_p80 = presupuestoReferencia >= r.costo.p80;
  }
  if (horasReferencia != null) {
    let dentro = 0;
    for (const h of horasSim) if (h <= horasReferencia + 1e-9) dentro++;
    r.horas_con_contingencia = redondear(horasReferencia, 1);
    r.prob_dentro_horas = redondear(dentro / horasSim.length, 3);
  }
  if (muestras) {
    r.muestrasCosto = costoSim;
    r.muestrasHoras = horasSim;
  }
  return r;
}
