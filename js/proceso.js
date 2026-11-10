// Gráficas de la página /proceso/, calculadas en vivo con el mismo motor que la herramienta.
import { PIEZAS, ROLES, EJEMPLO } from './catalogo.js';
import { cotizar, sensibilidadContingencia } from './modelo.js';
import { dibujarHistograma, el } from './dibujo.js';

const NF = (dec = 0) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const millones = (v) => `$ ${NF(1).format(v / 1e6)} M`;

// Tema (mismo interruptor que la herramienta)
document.getElementById('tema')?.addEventListener('click', () => {
  const raiz = document.documentElement;
  const oscuro = raiz.dataset.theme ? raiz.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  raiz.dataset.theme = oscuro ? 'light' : 'dark';
  try { localStorage.setItem('cotizador-tema', raiz.dataset.theme); } catch { /* sin almacenamiento */ }
});

// 1. Curva PERT frente a triangular para una pieza (densidad normalizada numéricamente)
function curvaPert() {
  const svg = document.getElementById('g-pert');
  const p = PIEZAS.find((x) => x.id === 'login');
  const [a, m, b] = p.horas;
  const alfa = 1 + (4 * (m - a)) / (b - a);
  const beta = 1 + (4 * (b - m)) / (b - a);
  const N = 120;
  const xs = Array.from({ length: N + 1 }, (_, i) => a + ((b - a) * i) / N);
  const pert = xs.map((x) => ((x - a) / (b - a)) ** (alfa - 1) * ((b - x) / (b - a)) ** (beta - 1));
  const tri = xs.map((x) => (x <= m ? (x - a) / (m - a) : (b - x) / (b - m)));
  const norma = (ys) => { const s = ys.reduce((t, y) => t + y, 0); return ys.map((y) => y / s); };
  const P = norma(pert); const T = norma(tri);
  const maxY = Math.max(...P, ...T);
  const X0 = 40; const X1 = 580; const Y0 = 20; const Y1 = 196;
  const px = (x) => X0 + ((x - a) / (b - a)) * (X1 - X0);
  const py = (y) => Y1 - (y / maxY) * (Y1 - Y0);
  const camino = (ys) => ys.map((y, i) => `${i ? 'L' : 'M'}${px(xs[i]).toFixed(1)},${py(y).toFixed(1)}`).join(' ');
  svg.append(
    el('path', { d: `${camino(P)} L${X1},${Y1} L${X0},${Y1} Z`, fill: 'var(--frio)', opacity: '.25' }),
    el('path', { d: camino(P), fill: 'none', stroke: 'var(--frio)', 'stroke-width': 3 }),
    el('path', { d: camino(T), fill: 'none', stroke: 'var(--tinta)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }),
    el('line', { x1: X0, x2: X1, y1: Y1, y2: Y1, stroke: 'var(--tinta)', 'stroke-width': 2 }),
  );
  const media = (a + 4 * m + b) / 6;
  for (const [v, t, y] of [[a, `a ${a} h`, 214], [m, `m ${m} h`, 214], [b, `b ${b} h`, 214], [media, `media ${NF(1).format(media)} h`, 232]]) {
    svg.append(el('line', { x1: px(v), x2: px(v), y1: Y1, y2: Y1 + 5, stroke: 'var(--tinta)', 'stroke-width': 2 }));
    svg.append(el('text', { x: px(v), y, 'text-anchor': v === a ? 'start' : v === b ? 'end' : 'middle' }, t));
  }
  svg.append(el('line', { x1: px(media), x2: px(media), y1: Y0, y2: Y1, stroke: 'var(--acento)', 'stroke-width': 2 }));
  svg.append(el('text', { x: X1, y: 30, 'text-anchor': 'end' }, 'continua: PERT · discontinua: triangular'));
  document.getElementById('c-pert').textContent = `«${p.nombre}»: optimista ${a} h, probable ${m} h, pesimista ${b} h. `
    + `PERT (α = ${NF(2).format(alfa)}, β = ${NF(2).format(beta)}) se concentra cerca de la probable; su media es ${NF(1).format(media)} h (calculado aquí).`;
}

// 2 y 3. Histograma del ejemplo y sensibilidad a la contingencia
function ejemplo() {
  const q = cotizar({
    piezas: PIEZAS.filter((p) => EJEMPLO.piezas.includes(p.id)).map((p) => ({ id: p.id, nombre: p.nombre, a: p.horas[0], m: p.horas[1], b: p.horas[2] })),
    equipo: ROLES.map((r) => ({ ...r, cantidad: EJEMPLO.equipo[r.id] || 0 })),
  });
  const { sim, cascada } = q;
  const tope = cascada.manoObra + cascada.contingenciaCosto + cascada.noLaboral;
  dibujarHistograma(document.getElementById('g-histo'), sim.muestrasCosto, {
    p50: sim.costo.p50, p80: sim.costo.p80, p90: sim.costo.p90, tope, bins: 34,
    etiquetaMin: millones(sim.costo.minimo), etiquetaMax: millones(sim.costo.maximo),
    etiquetaTope: `presupuesto + 15 % ${millones(tope)}`,
  });
  document.getElementById('c-histo').textContent = `Ejemplo (6 piezas, 1 frontend, 1 backend, 1 QA): costo sin margen P50 ${millones(sim.costo.p50)}, `
    + `P80 ${millones(sim.costo.p80)}, P90 ${millones(sim.costo.p90)}; plazo P50 ${NF(1).format(sim.semanas.p50)} y P90 ${NF(1).format(sim.semanas.p90)} semanas. `
    + `Con 15 % de contingencia el tope es ${millones(tope)} y el ${NF(0).format(sim.prob_dentro_presupuesto * 100)} % de los escenarios cabe. Calculado aquí con el motor portado de eiran.`;

  const pasos = Array.from({ length: 21 }, (_, i) => i * 0.025);
  const curva = sensibilidadContingencia(sim.muestrasCosto, cascada.manoObra, cascada.noLaboral, pasos);
  const svg = document.getElementById('g-sens');
  const X0 = 52; const X1 = 580; const Y0 = 16; const Y1 = 214;
  const px = (c) => X0 + (c / 0.5) * (X1 - X0);
  const py = (p) => Y1 - p * (Y1 - Y0);
  for (const p of [0, 0.5, 0.8, 1]) {
    svg.append(el('line', { x1: X0, x2: X1, y1: py(p), y2: py(p), stroke: 'var(--trama)', 'stroke-width': 1 }));
    svg.append(el('text', { x: X0 - 6, y: py(p) + 4, 'text-anchor': 'end' }, `${p * 100} %`));
  }
  svg.append(el('line', { x1: X0, x2: X1, y1: py(0.8), y2: py(0.8), stroke: 'var(--tinta)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
  svg.append(el('text', { x: X1, y: py(0.8) - 6, 'text-anchor': 'end' }, 'meta 80 %'));
  svg.append(el('line', { x1: X0, x2: X1, y1: Y1, y2: Y1, stroke: 'var(--tinta)', 'stroke-width': 2 }));
  for (const c of [0, 0.1, 0.2, 0.3, 0.4, 0.5]) svg.append(el('text', { x: px(c), y: Y1 + 18, 'text-anchor': 'middle' }, `${Math.round(c * 100)} %`));
  svg.append(el('text', { x: (X0 + X1) / 2, y: Y1 + 38, 'text-anchor': 'middle' }, 'contingencia sobre la mano de obra'));
  svg.append(el('path', {
    d: curva.map((k, i) => `${i ? 'L' : 'M'}${px(k.contingencia).toFixed(1)},${py(k.prob).toFixed(1)}`).join(' '),
    fill: 'none', stroke: 'var(--frio)', 'stroke-width': 3,
  }));
  for (const k of curva) svg.append(el('circle', { cx: px(k.contingencia), cy: py(k.prob), r: 3, fill: 'var(--frio)' }));
  const c15 = curva.find((k) => Math.abs(k.contingencia - 0.15) < 1e-9);
  svg.append(el('circle', { cx: px(0.15), cy: py(c15.prob), r: 7, fill: 'none', stroke: 'var(--acento)', 'stroke-width': 3 }));
  svg.append(el('text', { x: px(0.15) + 12, y: py(c15.prob) + 18 }, `15 % → ${NF(0).format(c15.prob * 100)} %`));
  const minimo80 = curva.find((k) => k.prob >= 0.8);
  const c0 = curva[0];
  document.getElementById('c-sens').textContent = `Sin contingencia, solo el ${NF(0).format(c0.prob * 100)} % de los escenarios cabe. `
    + (minimo80 ? `Desde ${NF(1).format(minimo80.contingencia * 100)} % de contingencia se supera la meta del 80 %. ` : '')
    + `Con el 15 % por defecto de eiran: ${NF(0).format(c15.prob * 100)} %. Calculado aquí con las ${NF(0).format(sim.config.iteraciones)} muestras del ejemplo.`;
}

curvaPert();
ejemplo();
